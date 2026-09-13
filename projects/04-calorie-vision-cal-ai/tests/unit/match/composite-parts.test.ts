// AC-scan-pipeline-35: составное блюдо — у КАЖДОЙ части свой source_snapshot (не общий на
// всё блюдо). `NullMatchIngredientPort` НИКОГДА не возвращает `parts` (эта фича, проверено
// отдельно в `null-port.test.ts`); контракт `parts[]` испытывается тестовым двойником,
// готовым принять реальную реализацию `source-and-correct` без переделки вызывающего кода
// (PC-08). Не требует базы.
//
// RV-scan-pipeline-13: ПЕРВАЯ версия проверяла ТОЛЬКО сам тестовый двойник («тест создаёт
// снимки, затем подтверждает, что создал разные снимки» — производственный код вообще не
// вызывался). `recognize-scan.ts` действительно ТЕРЯЛ `parts`/`source_snapshot` при записи
// результата (сохранял только `food_item_id`/`unmatched`) — исправлено (`persistedItem`).
// Тест ниже прогоняет РЕАЛЬНЫЙ `recognizeScan` с этим портом и проверяет ЗАПИСАННУЮ строку.

import { openSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recognizeScan, type RecognizeScanDeps } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import type { MatchIngredientPort, MatchedItem, RecognizedItemForMatch } from '../../../apps/recognizer/src/match/port.js';
import type { ModelProvider, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import type { ResultRecord } from '../../../apps/recognizer/src/lease.js';

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

describe('RV-scan-pipeline-13: recognizeScan НЕ теряет parts/source_snapshot при записи результата', () => {
  it('запись recordResult несёт items[0].parts с ДВУМЯ частями и РАЗНЫМИ снимками', async () => {
    const recorded: Array<{ record: ResultRecord }> = [];
    const provider: ModelProvider = {
      kind: 'fake',
      recognize: async (): Promise<ModelResponse> => ({
        items: [{ labelRu: 'плов с курицей', massG: 300, candidates: [] }],
        confidence: 0.95,
        modelEstimateKcal: 450,
        model: 'haiku-4.5',
      }),
    };
    const deps: RecognizeScanDeps = {
      pool: {} as never,
      quotaLimits: { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 },
      provider,
      matchPort: fixedCompositeMatchPort(),
      normalize: async () => ({ ok: true, normalizedKey: 'stub-key' }),
      recordResult: async (_target, record) => {
        recorded.push({ record });
        return 'written';
      },
      logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this as never; } },
      lookupIpPrefix: async () => '203.0.113.0/24',
      modelCallLogFd: openSync('/dev/null', 'w'),
    };

    const job = { id: 'scan-composite', fence: 1, photoId: 'photo-1', deviceSessionId: 'session-1', createdAt: new Date() };
    const outcome = await recognizeScan(job, deps);

    expect(outcome.status).toBe('done'); // сопоставлено (foodItemId='composite-dish' ≠ null)
    const writtenItems = recorded[0]?.record.items as Array<{ parts?: unknown[]; source_snapshot: unknown; food_item_id: string | null }>;
    expect(writtenItems).toHaveLength(1);
    expect(writtenItems[0]?.food_item_id).toBe('composite-dish');
    expect(writtenItems[0]?.parts).toHaveLength(2);
    const writtenSnapshots = (writtenItems[0]?.parts as Array<{ sourceSnapshot: { id: string } }>).map((part) => part.sourceSnapshot.id);
    expect(writtenSnapshots).toEqual(['rice', 'chicken']);
    expect(writtenItems[0]?.source_snapshot).toEqual({ id: 'composite-dish', note: 'верхний уровень — снимок НЕ используется, если есть parts' });
  });
});
