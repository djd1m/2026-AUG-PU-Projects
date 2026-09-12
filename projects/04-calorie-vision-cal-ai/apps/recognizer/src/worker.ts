// Цикл воркера. Опрос раз в секунду: при 3000 сканах в сутки (≈ 0,03 rps) это незаметно, а
// брокер очередей был бы шестым сервисом и вторым местом хранения истины (`Architecture.md`).
//
// РАСШИРЕНИЕ фичи `scan-pipeline`: `tick()` foundation закрывал ЛЮБОЕ задание
// `refused(no_food_matched)` без вызова модели по-настоящему. Здесь он делегирует
// `RecognizeScanWithinScanPipeline` (нормализация → вызов модели → диапазоны → эскалация →
// сопоставление → запись, `recognize-scan.ts`) — это И ЕСТЬ содержание фичи. `sweepStuckScans`
// вызывается тем же циклом опроса, не отдельным сервисом (FR-scan-pipeline-16).

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import type { Logger, QuotaLimits } from '@n4/shared';
import { acquireLease, recordResult } from './lease.js';
import type { ModelProvider } from './provider/types.js';
import type { MatchIngredientPort } from './match/port.js';
import { recognizeScan, type NormalizeOutcome, type RecognizeJob } from './recognize/recognize-scan.js';
import { sweepStuckScans } from './recognize/sweep-stuck-scans.js';

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
}

export interface Worker {
  readonly ownerId: string;
  /** Один проход цикла. Возвращает `true`, если задание было взято. */
  tick(): Promise<boolean>;
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

    await recognizeScan(job, {
      pool: options.pool,
      quotaLimits: options.quotaLimits,
      provider: options.provider,
      matchPort: options.matchPort,
      normalize: options.normalize,
      recordResult: (target, record) => recordResult(options.pool, target, record),
      logger: options.logger,
    });
    return true;
  };

  return {
    ownerId,
    tick,
    start() {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        if (running) return;
        running = true;
        void tick()
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
