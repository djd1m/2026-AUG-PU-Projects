import { afterEach, expect, it, vi } from 'vitest';
import type { Pool, Attempt } from '../packages/db/src';
const lease = vi.hoisted(() => vi.fn());
vi.mock('../packages/db/src/attempts', async importOriginal => ({
  ...await importOriginal<typeof import('../packages/db/src/attempts')>(), leaseAttemptTx: lease,
}));
import { retryRender } from '../packages/db/src/render';

afterEach(() => { vi.resetAllMocks(); });
const attempt: Attempt = { video_id: 'video', clip_id: 'clip', fence: 4, stage: 'render',
  series_no: 1, attempt_no: 1, status: 'running' };
function fixture(stale = false) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('count(*)')) return { rowCount: 1, rows: [{ total: 1, done: 0, terminal: 1 }] };
    return { rowCount: stale ? 0 : 1, rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, query };
}
it('SL-008 geometry terminalizes the first attempt atomically without leasing a retry', async () => {
  const { pool, query } = fixture();
  lease.mockResolvedValue({ ...attempt, fence: 5, attempt_no: 2 });
  expect(await retryRender(pool, attempt, 'watermark_geometry')).toBeNull();
  expect(lease).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE job_attempt SET status='failed'"),
    ['video', 4, 'watermark_geometry']);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE clip SET status='failed'"),
    ['clip', 4, 'watermark_geometry']);
  expect(query.mock.calls[0]?.[0]).toBe('BEGIN');
  expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
});
it('SL-008 transient ffmpeg failure still leases its retry', async () => {
  const { pool, query } = fixture(), next = { ...attempt, fence: 5, attempt_no: 2 };
  lease.mockResolvedValue(next);
  expect(await retryRender(pool, attempt, 'ffmpeg_failed')).toEqual(next);
  expect(lease).toHaveBeenCalledOnce();
  expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE clip SET status='failed'"))).toBe(false);
});
it('SL-008 obsolete geometry failure cannot change a clip or allocate an attempt', async () => {
  const { pool, query } = fixture(true);
  expect(await retryRender(pool, attempt, 'watermark_geometry')).toBeNull();
  expect(lease).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
