// Детерминированный фейк (DEC-A-009). Наружу НЕ ходит ни одним байтом: сетевого клиента
// в этом файле нет вовсе, и это проверяемо чтением, а не обещанием.
//
// Детерминизм нужен не для красоты: тест, у которого ответ меняется от прогона к прогону,
// не отличает «поменялся ответ» от «поменялся код».
//
// Фейк УВАЖАЕТ ДЕДЛАЙН, и это не украшение: если бы он отвечал мгновенно всегда, ветка
// «не успели» не исполнялась бы НИ РАЗУ до живого прогона — а именно она стоит денег
// (попытка оплачена, результат выброшен). Задержка задаётся явно параметром, а не
// выводится из входа: случайно пересекающий дедлайн тест мигает и потому ничего не значит.

import { createHash } from 'node:crypto';
import {
  ModelDeadlineExceeded,
  type ModelCallOptions,
  type ModelImage,
  type ModelProvider,
  type ModelResponse,
  type ModelResponseSchema,
} from './types.js';

const LABELS = ['гречка отварная', 'куриная грудка', 'салат из огурцов', 'борщ', 'омлет'] as const;

export interface FakeProviderOptions {
  /** Сколько «думает» фейк. По умолчанию ноль: тесты не ждут зря. */
  readonly latencyMs?: number;
}

function digits(hash: string, offset: number, length: number): number {
  return Number.parseInt(hash.slice(offset, offset + length), 16);
}

export function createFakeModelProvider(options: FakeProviderOptions = {}): ModelProvider {
  const latencyMs = options.latencyMs ?? 0;

  return {
    kind: 'fake',
    async recognize(image: ModelImage, schema: ModelResponseSchema, opts: ModelCallOptions): Promise<ModelResponse> {
      // Дедлайн проверяется ДО работы: истёкший бюджет — это отказ, а не «попробуем
      // быстренько». Ноль и отрицательное значение означают «уже поздно».
      if (!Number.isFinite(opts.deadlineMs) || opts.deadlineMs <= 0) throw new ModelDeadlineExceeded(opts.deadlineMs);
      if (opts.signal?.aborted === true) throw new ModelDeadlineExceeded(opts.deadlineMs);

      if (latencyMs > 0) {
        const waited = Math.min(latencyMs, opts.deadlineMs);
        await new Promise<void>((resolve) => setTimeout(resolve, waited));
        // Работа не укладывается в бюджет — отказ по дедлайну, а не поздний ответ:
        // поздний ответ оплачен и всё равно выбрасывается, и честнее сказать об этом сразу.
        if (latencyMs > opts.deadlineMs) throw new ModelDeadlineExceeded(opts.deadlineMs);
      }

      // Вход целиком, а не только идентификатор: один и тот же кадр обязан давать один и
      // тот же ответ, а разные кадры — разные. Модель входит в хеш: ответ Sonnet 5 и ответ
      // Haiku 4.5 на один кадр обязаны различаться, иначе тест эскалации ничего не видит.
      const hash = createHash('sha256')
        .update(`${image.scanId}|${image.objectKey}|${opts.model}|${schema.name}`)
        .digest('hex');
      const count = (digits(hash, 0, 2) % 3) + 1;
      const items = Array.from({ length: count }, (_, index) => {
        const seed = digits(hash, 4 + index * 6, 6);
        return {
          labelRu: LABELS[seed % LABELS.length] ?? 'блюдо',
          massG: 50 + (seed % 351),
          candidates: [] as readonly string[],
        };
      });

      return {
        // Эхо модели: ответ сам говорит, чей он, и это не восстанавливается по памяти.
        model: opts.model,
        items,
        confidence: Math.round((digits(hash, 32, 4) / 0xffff) * 100) / 100,
        modelEstimateKcal: 100 + (digits(hash, 40, 4) % 900),
      };
    },
  };
}
