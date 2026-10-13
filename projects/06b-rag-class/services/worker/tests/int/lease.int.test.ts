import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { JOB_MAX_ATTEMPTS, retryJob } from '@n6b/db';
import { ownerPool, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { acquireLease, checkpointLease, finishJob, type LeasedJob, reportProgress } from '../../src/lease';
import { runOnce } from '../../src/loop';
import { dispatchRunner, type JobRunner, notConnectedRunner, TEXT_NOT_CONNECTED } from '../../src/runner';
import { sweepStuckJobs, TEXT_CEILING, TEXT_WORKER_GONE } from '../../src/sweeper';
import { expireLease, isolateQueue, jobRow, seedJobs } from './helpers';

// Worker lease loop (FR-n6b-4, ADR-005) на настоящем Postgres под служебным пользователем n6b_app_service.
// Два пула — два процесса воркера: у каждого свои соединения, как у двух контейнеров.
const owner = ownerPool();
const workerA = servicePool(10);
const workerB = servicePool(10);
const cabinet = tenantPool(4);
afterAll(async () => { await Promise.all([owner.end(), workerA.end(), workerB.end(), cabinet.end()]); });
beforeEach(async () => { await isolateQueue(owner); });

const quiet = { log: () => undefined };

describe('захват: SKIP LOCKED и не более трёх захватов', () => {
  it('SC-US-004-1 конкурентно: два воркера × 30 попыток на 10 задач — каждая захвачена ровно один раз', async () => {
    const { jobIds } = await seedJobs(owner, 10);
    const pools = [workerA, workerB];
    const got = await Promise.all(Array.from({ length: 30 }, (_, i) => acquireLease(pools[i % 2]!)));
    const leased = got.filter((j): j is LeasedJob => j !== null);
    expect(leased).toHaveLength(10);
    expect(new Set(leased.map((j) => j.id))).toEqual(new Set(jobIds));
    expect(leased.every((j) => j.fence === 1 && j.attempts === 1)).toBe(true);
    const rows = await owner.query("SELECT count(*)::int AS n FROM index_job WHERE id = ANY($1) AND state = 'running'", [jobIds]);
    expect(rows.rows[0].n).toBe(10);
  });

  it('SKIP LOCKED: строку, заблокированную чужой транзакцией, захват пропускает сразу, а не ждёт', async () => {
    const { jobIds: [locked, free] } = await seedJobs(owner, 2);
    const holder = await owner.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM index_job WHERE id = $1 FOR UPDATE', [locked]);
      const t0 = Date.now();
      const got = await Promise.race([acquireLease(workerA),
        new Promise<'waited'>((r) => setTimeout(() => r('waited'), 2000))]);
      expect(got).not.toBe('waited');
      expect((got as LeasedJob).id).toBe(free);
      expect(Date.now() - t0).toBeLessThan(2000);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('живую аренду второй воркер не забирает; истёкшую — забирает с fence+1, run_started_at прежний', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const a = (await acquireLease(workerA))!;
    expect(await acquireLease(workerB)).toBeNull();
    const started = (await jobRow(owner, id!)).run_started_at;
    await expireLease(owner, id!);
    const b = (await acquireLease(workerB))!;
    expect(b.id).toBe(a.id);
    expect(b.fence).toBe(a.fence + 1);
    expect(b.attempts).toBe(2);
    expect((await jobRow(owner, id!)).run_started_at).toEqual(started);
  });

  it('четвёртого захвата нет; уборщик закрывает задачу «исполнитель не отвечает»', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    for (let i = 1; i <= JOB_MAX_ATTEMPTS; i += 1) {
      expect((await acquireLease(workerA))?.attempts).toBe(i);
      await expireLease(owner, id!);
    }
    expect(await acquireLease(workerA)).toBeNull();
    expect(await sweepStuckJobs(workerA)).toEqual([id]);
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'failed', error: TEXT_WORKER_GONE, attempts: 3 });
  });

  it('уборщик не трогает живую аренду и задачу с запасом захватов', async () => {
    const { jobIds: [live, spare] } = await seedJobs(owner, 2);
    await acquireLease(workerA);
    await acquireLease(workerA);
    await expireLease(owner, spare!);
    expect(await sweepStuckJobs(workerA)).toEqual([]);
    expect((await jobRow(owner, live!)).state).toBe('running');
  });

  // F-1 (08_review.md): вторая половина условия уборщика ИСТИННА, живая аренда — единственное, что его останавливает.
  it('живая аренда третьего захвата (attempts = 3) не закрывается; исполнитель пишет свой исход', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    let third: LeasedJob | null = null;
    for (let i = 1; i <= JOB_MAX_ATTEMPTS; i += 1) {
      third = await acquireLease(workerA);
      if (i < JOB_MAX_ATTEMPTS) await expireLease(owner, id!);
    }
    expect(third).toMatchObject({ id, attempts: 3 });
    expect(await sweepStuckJobs(workerA)).toEqual([]);
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'running', attempts: 3, error: null });
    expect(await finishJob(workerA, third!, { state: 'succeeded', note: 'третий захват' })).toBe('written');
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'succeeded', note: 'третий захват' });
  });

  it('живая аренда после потолка (run_started_at − 20 мин) — не уборщику: её закрывает контрольная точка исполнителя', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const job = (await acquireLease(workerA))!;
    await owner.query("UPDATE index_job SET run_started_at = now() - interval '20 minutes' WHERE id = $1", [id]);
    expect(await sweepStuckJobs(workerA)).toEqual([]);
    expect((await jobRow(owner, id!)).state).toBe('running');
    // Pseudocode «Worker lease loop» шаг 8: уборщик — только истёкшая аренда; потолок живой задачи видит её же продление.
    expect(await checkpointLease(workerA, job)).toBe('over-ceiling');
  });
});

describe('fence: воркер с просроченной арендой не пишет', () => {
  it('ни прогресс, ни продление, ни исход; победитель пишет своё', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const a = (await acquireLease(workerA))!;
    expect(await reportProgress(workerA, a, 3, 10)).toBe(true);
    await expireLease(owner, id!);
    const b = (await acquireLease(workerB))!;
    expect(b.progressDone).toBe(3); // повтор продолжает с сохранённого прогресса
    expect(await reportProgress(workerA, a, 9, 10)).toBe(false);
    expect(await checkpointLease(workerA, a)).toBe('lost');
    expect(await finishJob(workerA, a, { state: 'succeeded', note: 'A' })).toBe('lost');
    expect(await finishJob(workerB, b, { state: 'failed', error: 'B' })).toBe('written');
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'failed', error: 'B', progress_done: 3, note: null });
    expect(await finishJob(workerB, b, { state: 'succeeded' })).toBe('lost'); // исход один
  });

  it('конкурентно: 20 одновременных записей исхода двумя захватами — записан ровно один, и это победитель', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const a = (await acquireLease(workerA))!;
    await expireLease(owner, id!);
    const b = (await acquireLease(workerB))!;
    const writes = await Promise.all(Array.from({ length: 20 }, (_, i) => i % 2
      ? finishJob(workerA, a, { state: 'succeeded', note: 'A' }) : finishJob(workerB, b, { state: 'succeeded', note: 'B' })));
    expect(writes.filter((w) => w === 'written')).toHaveLength(1);
    expect((await jobRow(owner, id!)).note).toBe('B');
  });

  it('пульс видит потерю аренды и отменяет работу; исход не пишется', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const runner: JobRunner = { run: (ctx) => new Promise((resolve) => {
      ctx.signal.addEventListener('abort', () => resolve({ state: 'succeeded', note: 'поздно' }));
      void owner.query('UPDATE index_job SET lease_fence = lease_fence + 1 WHERE id = $1', [id]); // перезахват «другим»
    }) };
    const r = await runOnce({ pool: workerA, runner, renewEveryMs: 50, ...quiet });
    expect(r).toEqual({ kind: 'abandoned', jobId: id });
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'running', note: null });
  });
});

describe('потолок 15 минут от run_started_at', () => {
  it('контрольная точка после 15 мин → отказ «превышено время задачи»', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const runner: JobRunner = { run: async (ctx) => {
      await owner.query("UPDATE index_job SET run_started_at = now() - interval '16 minutes' WHERE id = $1", [id]);
      await ctx.checkpoint();
      return { state: 'succeeded' };
    } };
    const r = await runOnce({ pool: workerA, runner, ...quiet });
    expect(r).toMatchObject({ kind: 'finished', write: 'written', outcome: { state: 'failed', error: TEXT_CEILING } });
  });

  it('«готово» после потолка не пишется: последняя контрольная точка перед успехом', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const runner: JobRunner = { run: async () => {
      await owner.query("UPDATE index_job SET run_started_at = now() - interval '15 minutes 1 second' WHERE id = $1", [id]);
      return { state: 'succeeded' };
    } };
    expect((await runOnce({ pool: workerA, runner, ...quiet }))).toMatchObject({ outcome: { error: TEXT_CEILING } });
  });

  it('уборщик: аренда истекла и потолок пройден → отказ по времени', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    await acquireLease(workerA);
    await owner.query("UPDATE index_job SET run_started_at = now() - interval '20 minutes', leased_until = now() - interval '1 second' WHERE id = $1", [id]);
    expect(await sweepStuckJobs(workerA)).toEqual([id]);
    expect((await jobRow(owner, id!)).error).toBe(TEXT_CEILING);
  });

  it('SC-US-004-3: задача, созданная и упавшая вчера, после «Повторить» продолжает, а не падает по потолку', async () => {
    const { accountId, jobIds: [id] } = await seedJobs(owner, 1, 'failed');
    await owner.query(`UPDATE index_job SET created_at = now() - interval '1 day', run_started_at = now() - interval '1 day',
      attempts = 3, progress_done = 25, progress_total = 40, error = 'исчерпан суточный предел индексации' WHERE id = $1`, [id]);
    expect(await retryJob(cabinet, accountId, id!)).toBe('retried');
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'queued', attempts: 0, run_started_at: null, error: null,
      progress_done: 25 });
    let resumedFrom = -1;
    const runner: JobRunner = { run: async (ctx) => {
      resumedFrom = ctx.job.progressDone;
      await ctx.checkpoint();
      await ctx.progress(40, 40);
      return { state: 'succeeded', note: 'продолжено' };
    } };
    expect(await runOnce({ pool: workerA, runner, ...quiet })).toMatchObject({ kind: 'finished', write: 'written',
      outcome: { state: 'succeeded' } });
    expect(resumedFrom).toBe(25);
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'succeeded', progress_done: 40, attempts: 1, lease_fence: 1 });
  });
});

describe('исполнитель и разделяемый ресурс', () => {
  it('заглушка даёт честный отказ с причиной, а не «готово»', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    expect(await runOnce({ pool: workerA, runner: dispatchRunner({}), ...quiet })).toMatchObject({
      outcome: { state: 'failed', error: TEXT_NOT_CONNECTED } });
    expect(await jobRow(owner, id!)).toMatchObject({ state: 'failed', error: TEXT_NOT_CONNECTED });
    expect(notConnectedRunner).toBeDefined();
  });

  it('исключение исполнителя → отказ с текстом для владельца, без внутренностей', async () => {
    const { jobIds: [id] } = await seedJobs(owner, 1);
    const runner: JobRunner = { run: async () => { throw new Error('ECONNRESET 10.0.0.5:5432 password=…'); } };
    await runOnce({ pool: workerA, runner, ...quiet });
    const row = await jobRow(owner, id!);
    expect(row.state).toBe('failed');
    expect(row.error).not.toMatch(/ECONNRESET|password|10\.0/);
  });

  it('соединение пула не удерживается во время работы: 6 задач идут одновременно на пуле из 2 соединений', async () => {
    await seedJobs(owner, 6);
    const small = servicePool(2);
    let inside = 0;
    let maxInside = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const runner: JobRunner = { run: async (ctx) => {
      inside += 1; maxInside = Math.max(maxInside, inside);
      await gate;
      await ctx.progress(1, 1);
      inside -= 1;
      return { state: 'succeeded' };
    } };
    const runs = Array.from({ length: 6 }, () => runOnce({ pool: small, runner, ...quiet }));
    for (let i = 0; i < 100 && maxInside < 6; i += 1) await new Promise((r) => setTimeout(r, 50));
    const checkedOut = small.totalCount - small.idleCount;
    release();
    const results = await Promise.all(runs);
    await small.end();
    expect(maxInside).toBe(6);
    expect(checkedOut).toBe(0);
    expect(results.every((r) => r.kind === 'finished' && r.write === 'written')).toBe(true);
  });
});
