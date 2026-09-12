// Детерминированный фейк (DEC-A-009). Наружу НЕ ходит ни одним байтом: сетевого клиента
// в этом файле нет вовсе, и это проверяемо чтением, а не обещанием.
//
// Детерминизм нужен не для красоты: тест, у которого ответ меняется от прогона к прогону,
// не отличает «поменялся ответ» от «поменялся код».

import { createHash } from 'node:crypto';
import type { ModelProvider, ModelRequest, ModelResponse } from './types.js';

const LABELS = ['гречка отварная', 'куриная грудка', 'салат из огурцов', 'борщ', 'омлет'] as const;

function digits(hash: string, offset: number, length: number): number {
  return Number.parseInt(hash.slice(offset, offset + length), 16);
}

export function createFakeModelProvider(): ModelProvider {
  return {
    kind: 'fake',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      // Вход целиком, а не только идентификатор: один и тот же кадр обязан давать один и
      // тот же ответ, а разные кадры — разные.
      const hash = createHash('sha256').update(`${request.scanId}|${request.imageKey}|${request.model}`).digest('hex');
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
        items,
        confidence: Math.round((digits(hash, 32, 4) / 0xffff) * 100) / 100,
        modelEstimateKcal: 100 + (digits(hash, 40, 4) % 900),
      };
    },
  };
}
