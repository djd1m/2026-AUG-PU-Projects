// Цикл воркера (FR-foundation-6). Опрос раз в секунду: при 3000 сканах в сутки
// (≈ 0,03 rps) это незаметно, а брокер очередей был бы шестым сервисом и вторым местом
// хранения истины (`Architecture.md`, Technology Stack).
//
// В ТОМ ЖЕ тике работает уборщик застрявших заданий: предел `lease_fence < 3` делает
// задание с исчерпанными захватами невидимым для выборки, и без уборщика оно провисело бы
// в `queued` вечно. Предел без уборщика — это не защита, а тихая потеря.
//
// ЧЕГО ЭТОТ ЦИКЛ НЕ ДЕЛАЕТ и почему это честнее, чем выглядело бы «done»:
// сопоставления с базой продуктов в фиче `foundation` НЕТ, а `recognition` без единой
// ссылки на `food_item` не имеет права стать `done` — иначе на экране появилось бы число,
// не взятое из базы (ADR-001). Поэтому каркас закрывает задание статусом `refused` с
// причиной `no_food_matched`: сопоставление вводит фича `scan-pipeline`.

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';
import { acquireLease, recordResult, sweepStuckScans } from './lease.js';
import { MODEL_RESPONSE_SCHEMA, ModelDeadlineExceeded, type ModelId, type ModelProvider } from './provider/types.js';

/**
 * Первичная модель канона §6. Каркас зовёт её ЯВНО, потому что модель выбирает
 * вызывающий, а не адаптер: эскалацию к Sonnet 5 по уверенности < 0,6 вводит фича
 * `scan-pipeline`, и именно она будет передавать сюда другой идентификатор.
 */
export const PRIMARY_MODEL: ModelId = 'haiku-4.5';

/**
 * Бюджет одного вызова в каркасе. Настоящая арифметика бюджета (общий дедлайн операции
 * минус уже потраченное на нормализацию) принадлежит фиче `scan-pipeline`; здесь важно
 * ДРУГОЕ — что дедлайн вообще ПЕРЕДАЁТСЯ, а не подразумевается бесконечным.
 */
export const DEFAULT_CALL_DEADLINE_MS = 30_000;

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
  /** Один проход уборщика. Вынесен отдельно, чтобы его можно было проверить в одиночку. */
  sweep(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}

export function createWorker(options: WorkerOptions): Worker {
  const ownerId = options.ownerId ?? randomUUID();
  const interval = options.pollIntervalMs ?? 1_000;
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  const sweep = async (): Promise<void> => {
    const swept = await sweepStuckScans(options.pool);
    if (swept.neverLeased > 0 || swept.attemptsExhausted > 0) {
      options.logger.warn('swept_stuck_scans', {
        never_leased: swept.neverLeased,
        attempts_exhausted: swept.attemptsExhausted,
      });
    }
  };

  const tick = async (): Promise<boolean> => {
    const job = await acquireLease(options.pool, ownerId);
    if (job === undefined) return false;

    let response;
    try {
      response = await options.provider.recognize(
        { scanId: job.id, objectKey: job.photoId },
        MODEL_RESPONSE_SCHEMA,
        // Модель и дедлайн задаёт ВЫЗЫВАЮЩИЙ — порт их не выбирает.
        { model: PRIMARY_MODEL, deadlineMs: DEFAULT_CALL_DEADLINE_MS },
      );
    } catch (error) {
      if (error instanceof ModelDeadlineExceeded) {
        // Попытка оплачена, результата нет. Это НАЗВАННАЯ цена, а не скрытая.
        const outcome = await recordResult(options.pool, job, {
          status: 'failed',
          confidence: null,
          items: [],
          modelEstimateKcal: null,
          modelUsed: PRIMARY_MODEL,
          failureReason: 'timeout',
        });
        options.logger.warn('model_call_deadline_exceeded', { scan_id: job.id, fence: job.fence, write: outcome });
        return true;
      }
      throw error;
    }

    const outcome = await recordResult(options.pool, job, {
      status: 'refused',
      confidence: response.confidence,
      items: response.items,
      modelEstimateKcal: response.modelEstimateKcal,
      modelUsed: response.model,
      failureReason: 'no_food_matched',
    });

    if (outcome === 'stale_lease') {
      // Ноль затронутых строк по fence — устаревший захват, а не ошибка базы.
      options.logger.warn('stale_lease_result', { scan_id: job.id, fence: job.fence, lease_owner: ownerId });
      return true;
    }
    if (outcome === 'swept') {
      // Задание уже закрыл уборщик: статус терминальный, и затирать его нельзя.
      options.logger.warn('swept_as_timeout', { scan_id: job.id, fence: job.fence, lease_owner: ownerId });
      return true;
    }
    options.logger.info('scan_finished', { scan_id: job.id, fence: job.fence, provider: options.provider.kind, model: response.model });
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
