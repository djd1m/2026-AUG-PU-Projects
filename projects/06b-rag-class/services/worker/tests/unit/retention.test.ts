import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import { RETENTION_EVERY_MS, RETENTION_BATCH_SIZE, RETENTION_MAX_BATCHES, retainRecentData, startRetention } from '../../src/retention';
const pool = {} as Pool;
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
describe('SRC-05 startup/daily retention lifecycle', () => {
  it('starts immediately, daily only, no overlapping runs, stop waits before pool can close', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const cleanup = vi.fn(() => new Promise<{ questions: number; counters: number; skipped: boolean }>((resolve) => {
      finish = () => resolve({ questions: 4, counters: 2, skipped: false });
    }));
    const log = vi.fn(); const retention = startRetention(pool, log, cleanup);
    await flush(); expect(cleanup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETENTION_EVERY_MS * 2); expect(cleanup).toHaveBeenCalledTimes(1);
    finish(); await flush();
    await vi.advanceTimersByTimeAsync(RETENTION_EVERY_MS - 1); expect(cleanup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(cleanup).toHaveBeenCalledTimes(2);
    let closed = false; const stop = retention.stop().then(() => { closed = true; });
    await flush(); expect(closed).toBe(false); finish(); await stop; expect(closed).toBe(true);
    await vi.advanceTimersByTimeAsync(RETENTION_EVERY_MS * 3); expect(cleanup).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('worker: retention questions=4 counters=2');
  });
  it('bounded cleanup reports backlog and schedules a new transaction, then returns to daily cadence', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('pg_try_advisory') ? { rows: [{ held: true }] }
      : { rows: [], rowCount: sql.includes('DELETE FROM') ? RETENTION_BATCH_SIZE : 0 });
    const c = { query, release: vi.fn() };
    const bounded = { connect: async () => c } as unknown as Pool;
    expect(await retainRecentData(bounded)).toEqual({ questions: RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES,
      counters: RETENTION_BATCH_SIZE * RETENTION_MAX_BATCHES, skipped: false, more: true });
    expect(query.mock.calls.filter(([sql]) => sql.includes('DELETE FROM')).length).toBe(RETENTION_MAX_BATCHES * 2);
    expect(c.release).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    const cleanup = vi.fn().mockResolvedValueOnce({ questions: 20000, counters: 0, skipped: false, more: true })
      .mockResolvedValue({ questions: 1, counters: 0, skipped: false, more: false });
    const retention = startRetention(pool, () => undefined, cleanup); await flush();
    await vi.advanceTimersByTimeAsync(999); expect(cleanup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(cleanup).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); expect(cleanup).toHaveBeenCalledTimes(2);
    await retention.stop();
  });
  it('logs only error class and attempts next day after failure', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn().mockRejectedValueOnce(new TypeError('secret content')).mockResolvedValue({ questions: 0, counters: 0, skipped: false });
    const log = vi.fn(); const retention = startRetention(pool, log, cleanup);
    await flush(); expect(log).toHaveBeenCalledWith('worker: retention failed: TypeError');
    await vi.advanceTimersByTimeAsync(RETENTION_EVERY_MS); expect(cleanup).toHaveBeenCalledTimes(2);
    await retention.stop();
  });
});
