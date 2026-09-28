// RunIndexJob (Pseudocode) — написано заново по образцу обработчиков N5 apps/worker/src/workers/*.ts
// (аренда → работа → закрытие по фенсу; устаревшая попытка молча выходит). Обработчик «сайт» (CrawlSite) —
// фича crawler (crawl/site-processor.ts); ExtractPdf — pdf-source (pdf/pdf-processor.ts); ChunkDocument,
// EmbedAndStore — chunk-embed. onSettled — «finally» задачи: вызывается после done И после failed (ADR-018:
// сырой PDF удаляется в обоих случаях), но НЕ после stale (файл нужен новой попытке) и НЕ перед автоповтором.
import { completeIndexJob, failIndexJob, leaseIndexJob, retryAutomatically, StaleAttemptError, type IndexCoverage, type Lease, type Pool } from '@n6/db';
import type { IndexJobFailureReason, IndexJobTruncation } from '@n6/rag';
import type { IndexMessage } from '@n6/queue';

// Отказ шага с причиной из закрытого списка. retryable — сбой, который может пройти сам (5xx шлюза, сеть).
export class StepFailure extends Error {
  constructor(readonly reason: IndexJobFailureReason, readonly retryable = false) { super(`Шаг индексации отказал: ${reason}`); this.name = 'StepFailure'; }
}
// Исход обработчика: truncated — обход остановлен исчерпанием собственного бюджета задачи (A-N6-052), задача done
// с пометкой. Отсутствие исхода — прочитано всё, что позволил обход.
// coverage — известные и непрочитанные адреса при остановленном обходе (crawl-coverage, A-N6-070).
export interface ProcessOutcome { truncated: IndexJobTruncation | null; coverage?: IndexCoverage | null }
export type SourceProcessor = (lease: Lease) => Promise<ProcessOutcome | void>;
export type RunOutcome = 'skipped' | 'done' | 'failed' | 'retry' | 'stale';
export interface RunDependencies {
  pool: Pool; enqueue: (message: IndexMessage) => Promise<void>; process: SourceProcessor;
  onSettled?: (lease: Lease, outcome: 'done' | 'failed') => Promise<void>;
}
// Сбой уборки не меняет исход задачи: остаток подберёт подметание тома (pdf/uploads.ts, sweepUploads).
async function settle(deps: RunDependencies, lease: Lease, outcome: 'done' | 'failed'): Promise<RunOutcome> {
  try { await deps.onSettled?.(lease, outcome); }
  catch { console.error(`worker-index: уборка после задачи ${lease.indexJobId} не выполнена — остаток подберёт подметание тома`); }
  return outcome;
}

export async function runIndexJob(deps: RunDependencies, message: IndexMessage): Promise<RunOutcome> {
  const lease = await leaseIndexJob(deps.pool, message);
  if (!lease) return 'skipped'; // устаревшее сообщение, завершённая или удалённая задача
  try {
    const outcome = await deps.process(lease);
    await completeIndexJob(deps.pool, lease, new Date(), outcome ? outcome.truncated : null, outcome?.coverage ?? null);
    return await settle(deps, lease, 'done');
  } catch (error) {
    if (error instanceof StaleAttemptError) return 'stale';
    const reason: IndexJobFailureReason = error instanceof StepFailure ? error.reason : 'internal';
    try {
      if (error instanceof StepFailure && error.retryable) {
        const next = await retryAutomatically(deps.pool, lease, reason);
        if (!next.retry) return await settle(deps, lease, 'failed');
        // Сбой постановки не теряет задачу: она running с пульсом, сторож закроет её stalled через 5 мин.
        await deps.enqueue(next.message);
        return 'retry';
      }
      await failIndexJob(deps.pool, lease, reason);
      return await settle(deps, lease, 'failed');
    } catch (closeError) {
      if (closeError instanceof StaleAttemptError) return 'stale';
      throw closeError;
    }
  }
}

// Заглушка без обработчика: задача честно закрывается internal, а не висит «выполняется». Воркер с фичи
// pdf-source её не подключает; остаётся для тестов, где вид источника не важен.
export const noProcessorYet: SourceProcessor = async () => {
  console.error('worker-index: обработчик источника не подключён — задача закрыта internal');
  throw new StepFailure('internal');
};

// Выбор обработчика по виду источника (source.kind). Неизвестный вид — internal, а не «успех без работы».
// text (text-source, A-N6-080): обработчик не передан (прежние вызовы и тесты) — тоже internal, а не молчаливый успех.
export function processByKind(pool: Pool, processors: Record<'site' | 'pdf', SourceProcessor> & { text?: SourceProcessor }): SourceProcessor {
  return async (lease) => {
    const source = await pool.query<{ kind: string }>('SELECT kind FROM source WHERE id = $1', [lease.sourceId]);
    const kind = source.rows[0]?.kind;
    if (kind === 'text') return (processors.text ?? noProcessorYet)(lease);
    if (kind !== 'site' && kind !== 'pdf') throw new StepFailure('internal');
    // Исход обработчика (пометка усечения, A-N6-052) обязан дойти до completeIndexJob — не проглатывать.
    return processors[kind](lease);
  };
}
