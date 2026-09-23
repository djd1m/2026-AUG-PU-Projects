import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createPool, type Pool } from '../packages/db/src/index';
import { transaction } from '../packages/db/src/quota';
import { authorizeSelection } from '../packages/db/src/selection';
import { authorizeSttCall } from '../packages/db/src/transcription';
import { publishRenderResult } from '../packages/db/src/render';
import type { Attempt } from '../packages/db/src/attempts';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { parseProbe, ProbeError } from '../apps/worker/src/media/probe';
import { renderErrorMessage } from '../apps/worker/src/render/diagnostics';
const attempt: Attempt = { video_id: 'video', fence: 1, stage: 'stt', series_no: 1, attempt_no: 1, clip_id: null, status: 'running' };
const limits = loadLimits(environment());
afterEach(() => vi.restoreAllMocks());
function database(query: ReturnType<typeof vi.fn>) {
  const release = vi.fn();
  return { pool: { connect: async () => ({ query, release }) } as unknown as Pool, release };
}
it('RC-001 duplicate initial dispatch does not claim the next paid retry', async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM video v')) return { rowCount: 1, rows: [{ account_id: 'owner', duration_seconds: '120', minutes_charged: 2,
      stt_calls: {}, started_at: new Date() }] }; // Old joined snapshot.
    if (sql.includes('SELECT') && sql.includes('FROM job_attempt')) return { rowCount: 1, rows: [{ stt_calls: { '0': 1 } }] };
    return { rowCount: 1, rows: [{ used: 2 }] };
  });
  expect(await authorizeSttCall(database(query).pool, attempt, limits, 0, 120)).toBeNull();
  expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE quota_counter'))).toBe(false);
});
it('RC-001 losing conditional claim never consumes retry quota', async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM video v')) return { rowCount: 1, rows: [{ account_id: 'owner', duration_seconds: '120', minutes_charged: 2, started_at: new Date() }] };
    if (sql.includes('SELECT stt_calls')) return { rowCount: 1, rows: [{ stt_calls: { '0': 1 } }] };
    if (sql.includes('SET stt_calls')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [{ used: 2 }] };
  });
  expect(await authorizeSttCall(database(query).pool, attempt, limits, 0, 120, new Date(), 1)).toBeNull();
  expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE quota_counter'))).toBe(false);
});
it('RC-002 every integration pool uses production factory; timeouts cannot be overridden', async () => {
  const pool = createPool('postgresql://test@localhost/test_test');
  try { expect(pool.options).toMatchObject({ max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 5000 }); }
  finally { await pool.end(); }
  for (const file of readdirSync('tests').filter(f => f.endsWith('.integration.test.ts'))) {
    expect(readFileSync(`tests/${file}`, 'utf8'), file).not.toMatch(/new Pool\s*\(/);
  }
});
it('RC-003 publication holds no transaction or pool client', async () => {
  let clients = 0, inTransaction = false;
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN') inTransaction = true;
    if (sql === 'COMMIT') inTransaction = false;
    if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ total: 1, done: 1, terminal: 1 }] };
    return { rowCount: 1, rows: [{ id: 'clip' }] };
  });
  const pool = { connect: async () => { clients++; return { query, release: () => { clients--; } }; } } as unknown as Pool;
  expect(await publishRenderResult(pool, { ...attempt, stage: 'render', clip_id: 'clip' },
    { object_key: 'clip', thumbnail_key: 'thumb', bytes: 1, watermarked: true }, async () => {
      expect(inTransaction).toBe(false); expect(clients).toBe(0); return 1;
    })).toBe(true);
});
it('RC-005 compose does not advertise prohibited render concurrency configuration', () => {
  expect(readFileSync('docker-compose.yml', 'utf8')).not.toContain('N5_RENDER_CONCURRENCY');
});
it('RC-006 database error propagates by identity without terminal no_timestamps', async () => {
  const error = new Error('database unavailable');
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM video v')) return { rowCount: 1, rows: [{ duration_seconds: '120', started_at: new Date() }] };
    if (sql.includes('FROM transcript')) throw error;
    return { rowCount: 1, rows: [] };
  });
  await expect(authorizeSelection(database(query).pool, attempt, limits, 'test')).rejects.toBe(error);
  expect(query.mock.calls.some(([sql]) => sql.includes("SET status='failed'"))).toBe(false);
});
it('RC-006 malformed transcript still produces no_timestamps', async () => {
  const query = vi.fn(async (sql: string) => sql.includes('FROM video v')
    ? { rowCount: 1, rows: [{ duration_seconds: '120', started_at: new Date() }] } : { rowCount: 1, rows: [{}] });
  expect(await authorizeSelection(database(query).pool, attempt, limits, 'test')).toBeNull();
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status='failed'"), expect.arrayContaining(['no_timestamps']));
});
it('RC-006 malformed ffprobe output retains cause and is not a refundable timeout', () => {
  for (const input of ['{', '{}', '{"format":{"duration":"NaN"},"streams":[]}']) {
    try { parseProbe(input); expect.fail('Invalid probe accepted'); }
    catch (error) { expect(error).not.toBeInstanceOf(ProbeError); expect(error).toHaveProperty('cause'); expect(error).toHaveProperty('message', 'Непригодный вывод ffprobe'); }
  }
});
it('RC-008 failed rollback preserves original error and destroys the client', async () => {
  const original = new Error('original failure'), rollback = new Error('broken connection');
  const query = vi.fn(async (sql: string) => { if (sql === 'ROLLBACK') throw rollback; });
  const { pool, release } = database(query);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(transaction(pool, async () => { throw original; })).rejects.toBe(original);
  expect(release).toHaveBeenCalledWith(true);
});
it('RC-008 successful rollback returns a reusable client and preserves error identity', async () => {
  const original = new Error('work failure'), { pool, release } = database(vi.fn(async () => ({})));
  await expect(transaction(pool, async () => { throw original; })).rejects.toBe(original);
  expect(release).toHaveBeenCalledWith(undefined);
});
it('RC-009 nested causes are bounded, cycle-safe and sanitized at every level', () => {
  const deepest = new Error('Connection reset https://user:password@example.invalid/?token=PRIVATE_VALUE');
  const error = new Error('Publish failed', { cause: new Error('Upload failed', { cause: deepest }) });
  deepest.cause = error;
  const message = renderErrorMessage(error);
  expect(message).toContain('Publish failed'); expect(message).toContain('Upload failed'); expect(message).toContain('Connection reset');
  expect(message).not.toMatch(/PRIVATE_VALUE|https:|user:password/); expect(message.length).toBeLessThanOrEqual(4096);
});
