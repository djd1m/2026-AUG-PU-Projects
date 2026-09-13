// Цикл воркера. Опрос раз в секунду: при 3000 сканах в сутки (≈ 0,03 rps) это незаметно, а
// брокер очередей был бы шестым сервисом и вторым местом хранения истины (`Architecture.md`).
//
// В ТОМ ЖЕ тике работает уборщик застрявших заданий: предел `lease_fence < 3` делает
// задание с исчерпанными захватами невидимым для выборки, и без уборщика оно провисело бы
// в `queued` вечно. Предел без уборщика — это не защита, а тихая потеря
// (`recognize/sweep-stuck-scans.ts`, FR-scan-pipeline-16 — не отдельный сервис).
//
// Каркас `foundation` закрывал ЛЮБОЕ задание `refused(no_food_matched)` без настоящего
// распознавания — честная заглушка, пока сопоставления с базой не существовало. Фича
// `scan-pipeline` её ЗАМЕЩАЕТ: тик делегирует `RecognizeScanWithinScanPipeline`
// (нормализация → квота → вызов модели → диапазоны → эскалация → сопоставление → запись,
// `recognize/recognize-scan.ts`) — это и есть содержание фичи.

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import type { Logger, QuotaLimits } from '@n4/shared';
import { acquireLease, recordResult } from './lease.js';
import { type ModelId, type ModelProvider } from './provider/types.js';
import type { MatchIngredientPort } from './match/port.js';
import { recognizeScan, type NormalizeOutcome, type RecognizeJob } from './recognize/recognize-scan.js';
import { sweepStuckScans } from './recognize/sweep-stuck-scans.js';

/**
 * Первичная модель канона §6. Модель выбирает ВЫЗЫВАЮЩИЙ, а не адаптер: арифметику
 * бюджета и выбор между первичной и эскалационной ведёт `recognize-scan.ts`
 * (`CANON.modelPrimary`/`CANON.modelEscalation`). Константа сохранена как имя решения.
 */
export const PRIMARY_MODEL: ModelId = 'haiku-4.5';

export interface WorkerOptions {
  readonly pool: DbPool;
  readonly provider: ModelProvider;
  readonly matchPort: MatchIngredientPort;
  readonly quotaLimits: QuotaLimits;
  readonly normalize: (job: RecognizeJob, signal: AbortSignal) => Promise<NormalizeOutcome>;
  readonly logger: Logger;
  readonly ownerId?: string;
  readonly pollIntervalMs?: number;
  /** Каждый N-й тик также прогоняет `SweepStuckScans` (по умолчанию — каждый). */
  readonly sweepEveryNTicks?: number;
  /**
   * Файловый дескриптор журнала `model_call`. Тест подменяет его, чтобы ПРОЧИТАТЬ запись
   * о попытке: она пишется через `writeSync` мимо логгера (переживание краха процесса),
   * и без этого прохода утверждение «попытка оплачена и записана» проверить нечем.
   */
  readonly modelCallLogFd?: number;
}

export interface Worker {
  readonly ownerId: string;
  /** Один проход цикла. Возвращает `true`, если задание было взято. */
  tick(): Promise<boolean>;
  /** Один проход уборщика. Вынесен отдельно, чтобы его можно было проверить в одиночку. */
  sweep(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}

export function createWorker(options: WorkerOptions): Worker {
  const ownerId = options.ownerId ?? randomUUID();
  const interval = options.pollIntervalMs ?? 1_000;
  const sweepEvery = options.sweepEveryNTicks ?? 1;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let tickCount = 0;

  const sweep = async (): Promise<void> => {
    const swept = await sweepStuckScans(options.pool);
    if (swept.neverLeased > 0 || swept.leaseLimitExhausted > 0 || swept.taskBudgetExpired > 0) {
      options.logger.warn('swept_stuck_scans', {
        never_leased: swept.neverLeased,
        attempts_exhausted: swept.leaseLimitExhausted,
        task_budget_expired: swept.taskBudgetExpired,
      });
    }
  };

  const tick = async (): Promise<boolean> => {
    tickCount += 1;
    if (tickCount % sweepEvery === 0) {
      try {
        await sweepStuckScans(options.pool);
      } catch (error) {
        options.logger.error('sweep_failed', { message: (error as Error).message });
      }
    }

    const job = await acquireLease(options.pool, ownerId);
    if (job === undefined) return false;

    const outcome = await recognizeScan(job, {
      pool: options.pool,
      quotaLimits: options.quotaLimits,
      provider: options.provider,
      matchPort: options.matchPort,
      normalize: options.normalize,
      recordResult: (target, record) => recordResult(options.pool, target, record),
      logger: options.logger,
      modelCallLogFd: options.modelCallLogFd,
    });

    // Событие успешной записи возвращено из каркаса `foundation`: без него у ЗАВЕРШЁННОГО
    // задания нет ни одного события уровня воркера, и «скан закрыт» приходится выводить из
    // ОТСУТСТВИЯ `stale_lease_result`/`swept_as_timeout` — вывод из молчания, тот самый,
    // против которого написано различение этих двух исходов. События о НЕсостоявшейся
    // записи пишет `recognize-scan.ts` на ОБЩЕМ пути (`writeTerminal`), поэтому здесь
    // остаётся только положительный случай.
    if (outcome.writeOutcome === 'written') {
      options.logger.info('scan_finished', {
        scan_id: job.id,
        fence: job.fence,
        provider: options.provider.kind,
        status: outcome.status,
        failure_reason: outcome.failureReason,
      });
    }
    return true;
  };

  return {
    ownerId,
    tick,
    sweep,
    start() {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        if (running) return;
        running = true;
        void tick()
          .then(() => sweep())
          .catch((error: unknown) => options.logger.error('tick_failed', { message: (error as Error).message }))
          .finally(() => {
            running = false;
          });
      }, interval);
    },
    async stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
