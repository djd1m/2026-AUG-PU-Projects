// Детерминированный фейк (DEC-A-009). Наружу НЕ ходит ни одним байтом: сетевого клиента
// в этом файле нет вовсе, и это проверяемо чтением, а не обещанием.
//
// Детерминизм нужен не для красоты: тест, у которого ответ меняется от прогона к прогону,
// не отличает «поменялся ответ» от «поменялся код».
//
// РАСШИРЕНИЕ фичи `scan-pipeline`: тесты границы эскалации (AC-12), конкурентной эскалации
// (AC-13), устаревшей аренды с управляемой задержкой (AC-17) и провайдер-отказов (AC-16)
// нуждаются в УПРАВЛЯЕМОМ фейке — детерминированная форма ответа этого не даёт. Опции
// необязательны: без них поведение БАЙТ-В-БАЙТ то же, что в `foundation`.

import { createHash } from 'node:crypto';
import type { ModelProvider, ModelRequest, ModelResponse } from './types.js';

const LABELS = ['гречка отварная', 'куриная грудка', 'салат из огурцов', 'борщ', 'омлет'] as const;

function digits(hash: string, offset: number, length: number): number {
  return Number.parseInt(hash.slice(offset, offset + length), 16);
}

export type FakeOutcome = 'ok' | 'no_food' | 'provider_unavailable' | 'provider_timeout';

export interface FakeModelProviderOptions {
  /** Переопределяет вычисленную уверенность — тесты границы 0,59/0,60 и эскалации. */
  confidenceOverride?: (request: ModelRequest) => number | undefined;
  /** Принудительный исход вместо обычного ответа (AC-scan-pipeline-16). */
  outcomeOverride?: (request: ModelRequest) => FakeOutcome | undefined;
  /** Управляемая задержка ОТВЕТА, мс — устаревшая аренда с реальным вызовом (AC-scan-pipeline-17). */
  delayMs?: (request: ModelRequest) => number;
}

class ProviderUnavailableError extends Error {
  constructor() {
    super('фейковый провайдер: недоступен (тестовый режим)');
    this.name = 'ProviderUnavailableError';
  }
}

function sleepRespectingSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function createFakeModelProvider(options: FakeModelProviderOptions = {}): ModelProvider {
  return {
    kind: 'fake',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      const delay = options.delayMs?.(request) ?? 0;
      await sleepRespectingSignal(delay, request.signal);

      const outcome = options.outcomeOverride?.(request) ?? 'ok';
      if (outcome === 'provider_unavailable') throw new ProviderUnavailableError();
      if (outcome === 'provider_timeout') {
        await sleepRespectingSignal(request.deadlineMs + 1000, request.signal);
        // Если сигнал не оборвал сон (например, тест не подключил реальный таймер) —
        // всё равно вернуть отказ, эмулирующий истечение дедлайна на стороне провайдера.
        throw new DOMException('The operation was aborted', 'AbortError');
      }

      // Вход целиком, а не только идентификатор: один и тот же кадр обязан давать один и
      // тот же ответ, а разные кадры — разные.
      const hash = createHash('sha256').update(`${request.scanId}|${request.imageKey}|${request.model}`).digest('hex');

      if (outcome === 'no_food') {
        return { items: [], confidence: 0.9, modelEstimateKcal: 0, model: request.model };
      }

      const count = (digits(hash, 0, 2) % 3) + 1;
      const items = Array.from({ length: count }, (_, index) => {
        const seed = digits(hash, 4 + index * 6, 6);
        return {
          labelRu: LABELS[seed % LABELS.length] ?? 'блюдо',
          massG: 50 + (seed % 351),
          candidates: [] as readonly string[],
        };
      });

      const naturalConfidence = Math.round((digits(hash, 32, 4) / 0xffff) * 100) / 100;
      const confidence = options.confidenceOverride?.(request) ?? naturalConfidence;

      return {
        items,
        confidence,
        modelEstimateKcal: 100 + (digits(hash, 40, 4) % 900),
        model: request.model,
      };
    },
  };
}
