// Цикл воркера (FR-foundation-6). Опрос раз в секунду: при 3000 сканах в сутки
// (≈ 0,03 rps) это незаметно, а брокер очередей был бы шестым сервисом и вторым местом
// хранения истины (`Architecture.md`, Technology Stack).
//
// ЧЕГО ЭТОТ ЦИКЛ НЕ ДЕЛАЕТ и почему это честнее, чем выглядело бы «done»:
// сопоставления с базой продуктов в фиче `foundation` НЕТ, а `recognition` без единой
// ссылки на `food_item` не имеет права стать `done` — иначе на экране появилось бы число,
// не взятое из базы (ADR-001). Поэтому каркас закрывает задание статусом `refused` с
// причиной `no_food_matched`: сопоставление вводит фича `scan-pipeline`.

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';
import { acquireLease, recordResult } from './lease.js';
import type { ModelProvider } from './provider/types.js';

export interface WorkerOptions {
  readonly pool: DbPool;
  readonly provider: ModelProvider;
  readonly logger: Logger;
  readonly ownerId?: string;
  readonly pollIntervalMs?: number;
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
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  const tick = async (): Promise<boolean> => {
    const job = await acquireLease(options.pool, ownerId);
    if (job === undefined) return false;

    const response = await options.provider.recognize({
      scanId: job.id,
      imageKey: job.photoId ?? 'unknown',
      model: 'haiku-4.5',
    });

    const written = await recordResult(options.pool, job, {
      status: 'refused',
      confidence: response.confidence,
      items: response.items,
      modelEstimateKcal: response.modelEstimateKcal,
      modelUsed: 'haiku-4.5',
      failureReason: 'no_food_matched',
    });

    if (!written) {
      // Ноль затронутых строк — устаревший захват, а не ошибка базы.
      options.logger.warn('stale_lease_result', { scan_id: job.id, fence: job.fence, lease_owner: ownerId });
      return true;
    }
    options.logger.info('scan_finished', { scan_id: job.id, fence: job.fence, provider: options.provider.kind });
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
