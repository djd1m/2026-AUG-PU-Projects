import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { WATCHDOG_INTERVAL_MS } from '@clipmaker/queue';
import { startWatchdog, watchdogTick } from '../apps/web/src/server/watchdog';
import { retentionTick } from '../apps/web/src/server/retention';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(failAt = '', error: unknown = new Error('named database failure')) {
  const query = vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
    if (failAt && sql.includes(failAt)) throw error;
    if (sql.includes('SELECT count(*) FROM account')) return { rows: [{ count: '0' }], rowCount: 1 };
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const pool = { query, connect: async () => ({ query, release }) } as unknown as Pool;
  const storage = { delete: vi.fn(async () => {}), eraseClipPrefix: vi.fn(async () => {}), erasePrefix: vi.fn(async () => {}) };
  return { query, pool, release, storage };
}

describe('WD-001: watchdog failure diagnostics', () => {
  it('default handler prints the original named error and the next tick still runs', async () => {
    vi.useFakeTimers();
    const error = new Error('WD-001 named tick failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tick = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const stop = startWatchdog(tick);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(log).toHaveBeenCalledWith('Сторож: проход не завершён', error);
      await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS);
      expect(tick).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledTimes(1);
    } finally { stop(); }
  });

  it.each([new Error('custom callback failure'), 'non-Error rejection'])('passes the original rejection to a custom callback: %s', async error => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const stop = startWatchdog(async () => { throw error; }, onError);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    } finally { stop(); }
  });

  it.each([
    ['SELECT id FROM video', 'закрытие зависших задач'],
    ['SELECT v.id FROM video', 'закрытие зависших пересборок'],
    ["v.status='queued'", 'создание отсутствующих попыток'],
    ['SELECT j.*', 'восстановление доставки заданий'],
    ['pg_try_advisory_lock', 'retention'],
  ])('names the failed step for %s and preserves rejection identity', async (sql, step) => {
    const error = new Error(`WD-001 failure: ${step}`), f = fixture(sql, error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(watchdogTick(f.pool, vi.fn(), new Date(), 100, f.storage)).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith(`Сторож: шаг «${step}» не завершён`, error);
  });

  it('logs a failed enqueue and still publishes the next job and runs retention', async () => {
    const f = fixture(), error = new Error('WD-001 Redis offline');
    f.query.mockImplementation(async sql => {
      if (sql.includes('SELECT j.*')) return { rows: [
        { id: 'first', status: 'running' }, { id: 'second', status: 'running' },
      ], rowCount: 2 };
      if (sql.includes('SELECT count(*) FROM account')) return { rows: [{ count: '0' }], rowCount: 1 };
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const enqueue = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    await expect(watchdogTick(f.pool, enqueue, new Date(), 100, f.storage)).resolves.toEqual({ failed: 0, published: 1 });
    expect(log).toHaveBeenCalledWith('Сторож: транспорт заданий недоступен', error);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(f.query).toHaveBeenCalledWith('SELECT pg_try_advisory_lock(50921012) AS locked');
  });

  it('retention logs each original cause before its summary and preserves retries and unlock', async () => {
    const f = fixture(), clipError = new Error('WD-001 clip deletion denied'), accountError = new Error('WD-001 account erasure denied');
    const now = new Date();
    f.query.mockImplementation(async sql => {
      if (sql.includes('SELECT count(*) FROM account')) return { rows: [{ count: '0' }], rowCount: 1 };
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (sql.startsWith('SELECT c.id')) return { rows: [{ id: 'clip', video_id: 'video', object_key: 'clip.mp4', thumbnail_key: null }], rowCount: 1 };
      if (sql.startsWith('SELECT id FROM account')) return { rows: [{ id: 'account' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    f.storage.eraseClipPrefix.mockRejectedValue(clipError);
    f.storage.erasePrefix.mockImplementation(async (...args: unknown[]) => { throw String(args[0]).startsWith('videos/') ? accountError : clipError; });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(retentionTick(f.pool, f.storage, now)).rejects.toThrow('не завершено операций 2');
    expect(log).toHaveBeenCalledWith('Очистка: удаление клипа; повтор на следующем проходе', clipError);
    expect(log).toHaveBeenCalledWith('Очистка: стирание аккаунта; повтор на следующем проходе', accountError);
    expect(f.query).toHaveBeenCalledWith('UPDATE account SET updated_at=$2 WHERE id=$1', ['account', now]);
    expect(f.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock(50921012)');
    expect(f.release).toHaveBeenCalledOnce();
  });
});
