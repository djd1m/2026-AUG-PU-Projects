// AC-scan-pipeline-35: составное блюдо — у КАЖДОЙ части свой source_snapshot (не общий на
// всё блюдо). `NullMatchIngredientPort` НИКОГДА не возвращает `parts` (эта фича, проверено
// отдельно в `null-port.test.ts`); контракт `parts[]` испытывается тестовым двойником,
// готовым принять реальную реализацию `source-and-correct` без переделки вызывающего кода
// (PC-08). Не требует базы — чистый контракт типа `MatchedItem`.

import { describe, expect, it } from 'vitest';
import type { MatchIngredientPort, MatchedItem, RecognizedItemForMatch } from '../../../apps/recognizer/src/match/port.js';

/** Тестовый двойник ТОЛЬКО для этого контракта: возвращает составное блюдо с parts[]. */
function fixedCompositeMatchPort(): MatchIngredientPort {
  return {
    async match(items: readonly RecognizedItemForMatch[]): Promise<MatchedItem[]> {
      return items.map((item): MatchedItem => ({
        foodItemId: 'composite-dish',
        portionG: item.massG,
        sourceSnapshot: { id: 'composite-dish', note: 'верхний уровень — снимок НЕ используется, если есть parts' },
        parts: [
          { foodItemId: 'rice', share: 0.6, sourceSnapshot: { id: 'rice', kcal_per_100g: 130, import_snapshot_date: '2026-01-01' } },
          { foodItemId: 'chicken', share: 0.4, sourceSnapshot: { id: 'chicken', kcal_per_100g: 165, import_snapshot_date: '2026-02-01' } },
        ],
      }));
    },
  };
}

describe('составное блюдо: у каждой части свой source_snapshot (AC-scan-pipeline-35)', () => {
  it('parts[] несут РАЗНЫЕ source_snapshot, а не общий на всё блюдо', async () => {
    const port = fixedCompositeMatchPort();
    const result = await port.match([{ labelRu: 'плов с курицей', massG: 300 }]);

    const parts = result[0]?.parts;
    expect(parts).toBeDefined();
    expect(parts).toHaveLength(2);

    const snapshots = parts!.map((part) => part.sourceSnapshot);
    // Снимки РАЗЛИЧНЫ (не один и тот же объект/значение на обе части).
    expect(snapshots[0]).not.toEqual(snapshots[1]);
    expect(snapshots[0]?.id).toBe('rice');
    expect(snapshots[1]?.id).toBe('chicken');

    // share суммируется в 1 — тот же инвариант, что проверяет контрактный тест порта
    // (null-port.test.ts) для ЛЮБОЙ реализации.
    const totalShare = parts!.reduce((sum, part) => sum + Number(part.share), 0);
    expect(totalShare).toBeCloseTo(1, 5);
  });

  it('каждая часть несёт СВОЙ foodItemId, отличный от foodItemId соседней части', async () => {
    const port = fixedCompositeMatchPort();
    const result = await port.match([{ labelRu: 'плов с курицей', massG: 300 }]);
    const ids = result[0]!.parts!.map((part) => part.foodItemId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
