// Unit-слой задачи индексации: ReadIndexJob (молчание ≠ «выполняется», неизвестное → отказ internal),
// маршрут GET /api/index-jobs/{id} (чужое = 404), идентичность задания транспорта, числа канона §7.
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { indexJobView, INDEX_JOB_MAX_AUTOMATIC_ATTEMPTS, INDEX_JOB_STALLED_AFTER_MS, type IndexJobRow } from '../packages/db/src/index-jobs';
import { jobId, MAX_AUTOMATIC_ATTEMPTS, STALLED_AFTER_MS, JOB_DEADLINE_MS, WATCHDOG_INTERVAL_MS, PREVIEW_JOB_BUDGET, getRedisConnection } from '../packages/queue/src/index';
import { createIndexJobReadHandler } from '../apps/web/src/server/index-job-handler';

const now = new Date('2026-09-25T12:00:00Z');
const row = (over: Partial<IndexJobRow> = {}): IndexJobRow => ({ id: randomUUID(), status: 'running', failure_reason: null,
  pages_done: 17, pages_total: 50, chunks_done: 80, updated_at: new Date(now.getTime() - 60_000), ...over });

describe('ReadIndexJob: состояние', () => {
  it('queued/running с пульсом → running; done → done; failed → failed с причиной', () => {
    expect(indexJobView(row(), now).state).toBe('running');
    expect(indexJobView(row({ status: 'queued' }), now).state).toBe('running');
    expect(indexJobView(row({ status: 'done' }), now).state).toBe('done');
    expect(indexJobView(row({ status: 'failed', failure_reason: 'robots_disallowed' }), now)).toMatchObject({ state: 'failed', reason: 'robots_disallowed' });
  });
  it('молчание дольше 5 мин — «нет ответа», а не «выполняется» (граница 5 мин ровно — ещё running)', () => {
    expect(indexJobView(row({ updated_at: new Date(now.getTime() - STALLED_AFTER_MS - 1) }), now).state).toBe('no_response');
    expect(indexJobView(row({ status: 'queued', updated_at: new Date(now.getTime() - 6 * 60_000) }), now).state).toBe('no_response');
    expect(indexJobView(row({ updated_at: new Date(now.getTime() - STALLED_AFTER_MS) }), now).state).toBe('running');
    expect(indexJobView(row({ updated_at: new Date(Number.NaN) }), now).state).toBe('no_response');
  });
  it.each(['RUNNING', 'stalled', '', null, 'deferred', 1])('неизвестный статус %j → отказ internal (fail-closed)', (status) => {
    expect(indexJobView(row({ status }), now)).toMatchObject({ state: 'failed', reason: 'internal' });
  });
  it('неизвестная причина → internal', () => {
    expect(indexJobView(row({ status: 'failed', failure_reason: 'timeout' }), now).reason).toBe('internal');
  });
});

describe('Числа канона §7 «Задача индексации» — одно число в двух пакетах', () => {
  it('db и queue согласны; значения канона', () => {
    expect(INDEX_JOB_STALLED_AFTER_MS).toBe(STALLED_AFTER_MS);
    expect(INDEX_JOB_MAX_AUTOMATIC_ATTEMPTS).toBe(MAX_AUTOMATIC_ATTEMPTS);
    expect([STALLED_AFTER_MS, JOB_DEADLINE_MS, WATCHDOG_INTERVAL_MS, MAX_AUTOMATIC_ATTEMPTS]).toEqual([300_000, 900_000, 60_000, 2]);
    expect(PREVIEW_JOB_BUDGET).toEqual({ pageBudget: 20, embedBudget: 40_000 });
  });
});

describe('Транспорт: идентичность задания', () => {
  it('index:<id>:<generation>; непригодное — отказ', () => {
    const id = randomUUID();
    expect(jobId({ index_job_id: id, generation: 3 })).toBe(`index:${id}:3`);
    for (const bad of [{ index_job_id: 'x', generation: 1 }, { index_job_id: id, generation: -1 }, { index_job_id: id, generation: 1.5 }]) {
      expect(() => jobId(bad)).toThrow();
    }
  });
  it('Redis без пароля — отказ, а не соединение', () => {
    expect(() => getRedisConnection({ redisUrl: 'redis://redis:6379' })).toThrow(/парол/);
  });
});

describe('GET /api/index-jobs/{id}', () => {
  const cookie = `__Host-n6_session=${'a'.repeat(43)}`;
  const request = (headers: Record<string, string> = {}) => new Request('https://sufler.test.invalid/api/index-jobs/x', { headers });
  const view = { index_job_id: 'j', state: 'running' as const, pages_done: 1, pages_total: 5, chunks_done: 2 };
  it('владелец → 200 { data }; чтение по его account_id', async () => {
    const read = vi.fn(async (..._args: unknown[]) => view);
    const response = await createIndexJobReadHandler({ authenticate: async () => ({ account_id: 'acc' }), resolvePreviewBot: async () => null, read })(request({ cookie }), 'j');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: view });
    expect(read).toHaveBeenCalledWith('j', { accountId: 'acc' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('без сессии, чужая и несуществующая задача — ОДИН ответ 404', async () => {
    const bodies: unknown[] = [];
    for (const deps of [
      { authenticate: async () => null, resolvePreviewBot: async () => null, read: async () => view },
      { authenticate: async () => ({ account_id: 'acc' }), resolvePreviewBot: async () => null, read: async () => null },
    ]) {
      const response = await createIndexJobReadHandler(deps)(request({ cookie }), 'j');
      expect(response.status).toBe(404);
      bodies.push(await response.json());
    }
    expect(bodies[0]).toEqual(bodies[1]);
  });
  it('держатель предпросмотра читает по боту черновика; БД недоступна → 503, не «выполняется»', async () => {
    const read = vi.fn(async (..._args: unknown[]) => view);
    expect((await createIndexJobReadHandler({ authenticate: async () => null, resolvePreviewBot: async () => 'bot', read })(request(), 'j')).status).toBe(200);
    expect(read).toHaveBeenCalledWith('j', { previewBotId: 'bot' });
    const broken = await createIndexJobReadHandler({ authenticate: async () => ({ account_id: 'acc' }), resolvePreviewBot: async () => null,
      read: async () => { throw new Error('ECONNREFUSED'); } })(request({ cookie }), 'j');
    expect(broken.status).toBe(503);
  });
});
