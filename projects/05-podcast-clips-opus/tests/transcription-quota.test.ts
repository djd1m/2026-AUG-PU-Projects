import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { authorizeSttCall } from '../packages/db/src/transcription';
import type { Attempt } from '../packages/db/src/attempts';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
const attempt: Attempt = { video_id: 'test', stage: 'stt', fence: 1, series_no: 1, attempt_no: 1, clip_id: null, status: 'running' };
// SQL trace tests supplement, never substitute for PostgreSQL integration tests.
function database(previous: number, charged = 2, refused?: string) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (sql.includes('FROM video v')) return { rowCount: 1, rows: [{ account_id: 'owner', duration_seconds: '120',
      minutes_charged: charged, stt_calls: { '0': previous }, started_at: new Date() }] };
    if (sql.includes('UPDATE quota_counter') && args[0] === refused) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [{ used: 4 }] };
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { pool, calls };
}
describe('STT authorization SQL traces', () => {
  it('retry charges both minute scopes before dispatch count commits', async () => {
    const { pool, calls } = database(1);
    expect(await authorizeSttCall(pool, attempt, loadLimits(environment()), 0, 120)).toBe(2);
    const charges = calls.filter(c => c.sql.includes('UPDATE quota_counter'));
    expect(charges.map(c => [c.args[0], c.args[3]])).toEqual([['user_minutes', 2], ['global_minutes', 2]]);
    expect(calls.findIndex(c => c.sql.includes('UPDATE quota_counter'))).toBeLessThan(calls.findIndex(c => c.sql.includes('SET stt_calls')));
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });
  it('initial authorization requires committed full-file charge', async () => {
    const { pool, calls } = database(0, 0);
    await expect(authorizeSttCall(pool, attempt, loadLimits(environment()), 0, 120)).rejects.toThrow('квота');
    expect(calls.some(c => c.sql.includes('SET stt_calls'))).toBe(false);
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('global refusal rolls quota back, persists refusal and dispatches nothing', async () => {
    const { pool, calls } = database(1, 2, 'global_minutes');
    expect(await authorizeSttCall(pool, attempt, loadLimits(environment()), 0, 120)).toBeNull();
    expect(calls.some(c => c.sql === 'ROLLBACK TO SAVEPOINT quota_charge')).toBe(true);
    expect(calls.some(c => c.args.includes('refused_global_minutes'))).toBe(true);
    expect(calls.some(c => c.sql.includes('SET stt_calls'))).toBe(false);
  });
  it('three attempts exhaust the chunk, including unknown crash outcomes', async () => {
    const { pool, calls } = database(3);
    expect(await authorizeSttCall(pool, attempt, loadLimits(environment()), 0, 120)).toBeNull();
    expect(calls.some(c => c.args.includes('stt_failed'))).toBe(true);
  });
});
