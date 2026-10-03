import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
vi.mock('../../src/lease', () => ({ acquireLease: vi.fn(async () => null), checkpointLease: vi.fn(),
  finishJob: vi.fn(), reportProgress: vi.fn() }));
vi.mock('../../src/sweeper', () => ({ SWEEP_EVERY_MS: 60000, TEXT_CEILING: 'ceiling', sweepStuckJobs: vi.fn(async () => []) }));
import { startWorker } from '../../src/loop';
afterEach(() => vi.useRealTimers());
describe('SRC-05 actual worker lifecycle wiring', () => {
  it('worker startup invokes real retention; stop awaits cleanup transaction before pool.end', async () => {
    vi.useFakeTimers();
    let entered!: () => void; const started = new Promise<void>((r) => { entered = r; });
    let release!: () => void; const held = new Promise<void>((r) => { release = r; });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory')) return { rows: [{ held: true }], rowCount: 1 };
      if (sql.includes('DELETE FROM question_log')) { entered(); await held; }
      return { rows: [], rowCount: 0 };
    });
    const end = vi.fn(async () => undefined);
    const pool = { connect: async () => ({ query, release: vi.fn() }), end } as unknown as Pool;
    const worker = startWorker({ pool, runner: { run: vi.fn() }, log: () => undefined });
    await started;
    let stopped = false;
    const shutdown = worker.stop().then(async () => { stopped = true; await pool.end(); });
    await Promise.resolve(); await Promise.resolve(); expect(stopped).toBe(false); expect(end).not.toHaveBeenCalled();
    release(); await shutdown;
    expect(stopped).toBe(true); expect(end).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('DELETE FROM quota_counter'))).toBe(true);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
