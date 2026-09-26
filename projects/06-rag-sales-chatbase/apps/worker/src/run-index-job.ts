// RunIndexJob (Pseudocode) — написано заново по образцу обработчиков N5 apps/worker/src/workers/*.ts
// (аренда → работа → закрытие по фенсу; устаревшая попытка молча выходит). Обработчик «сайт» (CrawlSite) —
// фича crawler (crawl/site-processor.ts); ExtractPdf, ChunkDocument, EmbedAndStore — pdf-source, chunk-embed.
import { completeIndexJob, failIndexJob, leaseIndexJob, retryAutomatically, StaleAttemptError, type Lease, type Pool } from '@n6/db';
import type { IndexJobFailureReason } from '@n6/rag';
import type { IndexMessage } from '@n6/queue';

// Отказ шага с причиной из закрытого списка. retryable — сбой, который может пройти сам (5xx шлюза, сеть).
export class StepFailure extends Error {
  constructor(readonly reason: IndexJobFailureReason, readonly retryable = false) { super(`Шаг индексации отказал: ${reason}`); this.name = 'StepFailure'; }
}
export type SourceProcessor = (lease: Lease) => Promise<void>;
export type RunOutcome = 'skipped' | 'done' | 'failed' | 'retry' | 'stale';
export interface RunDependencies { pool: Pool; enqueue: (message: IndexMessage) => Promise<void>; process: SourceProcessor }

export async function runIndexJob(deps: RunDependencies, message: IndexMessage): Promise<RunOutcome> {
  const lease = await leaseIndexJob(deps.pool, message);
  if (!lease) return 'skipped'; // устаревшее сообщение, завершённая или удалённая задача
  try {
    await deps.process(lease);
    await completeIndexJob(deps.pool, lease);
    return 'done';
  } catch (error) {
    if (error instanceof StaleAttemptError) return 'stale';
    const reason: IndexJobFailureReason = error instanceof StepFailure ? error.reason : 'internal';
    try {
      if (error instanceof StepFailure && error.retryable) {
        const next = await retryAutomatically(deps.pool, lease, reason);
        if (!next.retry) return 'failed';
        // Сбой постановки не теряет задачу: она running с пульсом, сторож закроет её stalled через 5 мин.
        await deps.enqueue(next.message);
        return 'retry';
      }
      await failIndexJob(deps.pool, lease, reason);
      return 'failed';
    } catch (closeError) {
      if (closeError instanceof StaleAttemptError) return 'stale';
      throw closeError;
    }
  }
}

// Пока обработчиков источников нет, задача честно закрывается internal, а не висит «выполняется».
export const noProcessorYet: SourceProcessor = async () => {
  console.error('worker-index: обработчик PDF ещё не подключён (фича pdf-source) — задача закрыта internal');
  throw new StepFailure('internal');
};

// Выбор обработчика по виду источника (source.kind). Неизвестный вид — internal, а не «успех без работы».
export function processByKind(pool: Pool, processors: Record<'site' | 'pdf', SourceProcessor>): SourceProcessor {
  return async (lease) => {
    const source = await pool.query<{ kind: string }>('SELECT kind FROM source WHERE id = $1', [lease.sourceId]);
    const kind = source.rows[0]?.kind;
    if (kind !== 'site' && kind !== 'pdf') throw new StepFailure('internal');
    await processors[kind](lease);
  };
}
