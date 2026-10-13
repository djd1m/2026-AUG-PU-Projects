// Цикл воркера (Pseudocode «Worker lease loop»). Перенос N1 #7 — projects/01-testimonials-senja/services/worker/src/
// {index,transcribe-job}.ts: поллер Postgres без Redis, остановка по сигналу, уборка отдельным расписанием. Адаптировано:
// у N1 транзакция держалась открытой на всё время обработки (компромисс недели); здесь — нет: захват закрывает
// транзакцию, дальше каждая запись короткая и условна по fence (lease.ts), соединение пула во время работы свободно.

import { JOB_RENEW_EVERY_MS, type Pool } from '@n6b/db';
import { acquireLease, checkpointLease, finishJob, type JobOutcome, type LeasedJob, reportProgress } from './lease.js';
import { type JobContext, JobCeilingExceeded, JobLeaseLost, type JobRunner } from './runner.js';
import { SWEEP_EVERY_MS, sweepStuckJobs, TEXT_CEILING } from './sweeper.js';

export const IDLE_SLEEP_MS = 2_000;
export const TEXT_INTERNAL = 'Сбой обработки источника. Нажмите «Повторить» — обработанное сохранится.';

export interface WorkerDeps {
  readonly pool: Pool;
  readonly runner: JobRunner;
  readonly renewEveryMs?: number;
  readonly log?: (line: string) => void;
}

export type RunOnceResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'finished'; readonly jobId: string; readonly outcome: JobOutcome; readonly write: 'written' | 'lost' }
  | { readonly kind: 'abandoned'; readonly jobId: string };

/** Один захват: аренда → работа вне транзакции с пульсом → исход, условный по fence. */
export async function runOnce(deps: WorkerDeps): Promise<RunOnceResult> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const job = await acquireLease(deps.pool);
  if (!job) return { kind: 'idle' };

  const controller = new AbortController();
  let stop: 'lost' | 'over-ceiling' | null = null;
  const halt = (why: 'lost' | 'over-ceiling') => { if (!stop) { stop = why; controller.abort(); } };
  const checkpoint = async () => {
    const state = await checkpointLease(deps.pool, job);
    if (state !== 'ok') halt(state);
    if (stop === 'lost') throw new JobLeaseLost();
    if (stop === 'over-ceiling') throw new JobCeilingExceeded();
  };
  let beating = false;
  const beat = setInterval(() => {
    if (beating || stop) return;
    beating = true;
    checkpointLease(deps.pool, job).then((s) => { if (s !== 'ok') halt(s); },
      (e: unknown) => log(`worker: пульс задачи ${job.id} не прошёл: ${(e as Error).name}`))
      .finally(() => { beating = false; });
  }, deps.renewEveryMs ?? JOB_RENEW_EVERY_MS);

  const ctx: JobContext = {
    job, signal: controller.signal, checkpoint,
    progress: async (done, total) => {
      if (stop === 'lost' || !(await reportProgress(deps.pool, job, done, total))) { halt('lost'); throw new JobLeaseLost(); }
    },
  };

  let outcome: JobOutcome;
  try {
    outcome = await deps.runner.run(ctx);
    if (!stop && outcome.state === 'succeeded') await checkpoint(); // последняя проверка перед «готово»: потолок и аренда
  } catch (error) {
    if (!(error instanceof JobLeaseLost) && !(error instanceof JobCeilingExceeded) && !stop) {
      log(`worker: задача ${job.id} упала: ${(error as Error).name}`);
    }
    outcome = { state: 'failed', error: TEXT_INTERNAL };
  } finally {
    clearInterval(beat);
  }
  if (stop === 'lost') {
    log(`worker: задача ${job.id} отдана (fence ${job.fence}): результат не пишется`);
    return { kind: 'abandoned', jobId: job.id };
  }
  if (stop === 'over-ceiling') outcome = { state: 'failed', error: TEXT_CEILING };
  const write = await finishJob(deps.pool, job, outcome);
  return { kind: 'finished', jobId: job.id, outcome, write };
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/** Бесконечный цикл до stop(): захват, пауза 2 с без задач, уборщик раз в минуту. */
export function startWorker(deps: WorkerDeps): { stop: () => Promise<void> } {
  const log = deps.log ?? ((line: string) => console.log(line));
  const stopping = new AbortController();
  const sweep = () => sweepStuckJobs(deps.pool).then((ids) => { if (ids.length) log(`worker: уборщик закрыл ${ids.length}`); },
    (e: unknown) => log(`worker: уборщик не прошёл: ${(e as Error).name}`));
  const sweeper = setInterval(() => void sweep(), SWEEP_EVERY_MS);
  const done = (async () => {
    await sweep();
    while (!stopping.signal.aborted) {
      let idle = true;
      try { idle = (await runOnce(deps)).kind === 'idle'; } catch (e) { log(`worker: захват не прошёл: ${(e as Error).name}`); }
      if (idle) await sleep(IDLE_SLEEP_MS, stopping.signal);
    }
  })();
  return { stop: async () => { stopping.abort(); clearInterval(sweeper); await done; } };
}

export type { LeasedJob };
