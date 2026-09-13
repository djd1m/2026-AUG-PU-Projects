// `UsdaMatchIngredientPort` (`02_pseudocode.md`, FR-source-and-correct-4, AC-source-and-
// correct-8/9). Реализует `MatchIngredientPort` БЕЗ изменения сигнатуры — заменяет
// `NullMatchIngredientPort` в точке сборки `recognizer` (`worker.ts`).

import type { DbPool } from '@n4/db';
import { searchFoodCandidates } from '@n4/db';
import type { FoodSearchCandidate, Snapshot } from '@n4/shared';
import type { MatchedItem, MatchIngredientPort, RecognizedItemForMatch } from './port.js';
import { expandRecipeParts } from './expand-recipe-parts.js';

function toSnapshot(candidate: FoodSearchCandidate, portionG: number): Snapshot {
  return {
    source: 'USDA-FDC',
    source_id: candidate.source_id,
    name_en: candidate.name_en,
    kcal_per_100g: candidate.kcal_per_100g,
    protein_per_100g: candidate.protein_per_100g,
    fat_per_100g: candidate.fat_per_100g,
    carb_per_100g: candidate.carb_per_100g,
    portion_g: portionG,
    import_snapshot_date: candidate.import_snapshot_date,
  };
}

export function createUsdaMatchIngredientPort(pool: DbPool): MatchIngredientPort {
  return {
    async match(items: readonly RecognizedItemForMatch[]): Promise<MatchedItem[]> {
      const results: MatchedItem[] = [];
      // ПО ПОРЯДКУ, а не `Promise.all`: порядок — часть контракта (вызывающий код
      // сопоставляет ответ по индексу), и последовательный обход делает это тривиально
      // верным без дополнительной сортировки результатов параллельных промисов.
      for (const item of items) {
        const found = await searchFoodCandidates(pool, { query: item.labelRu, mode: 'auto', modelCandidateSourceIds: item.candidates });
        const best = found[0];
        if (best === undefined) {
          // Промах: `portion_g` возвращается ДАЖЕ при промахе — контракт требует
          // положительного значения, и масса — данные модели, а не следствие сопоставления.
          results.push({ foodItemId: null, portionG: item.massG, sourceSnapshot: null });
          continue;
        }
        if (best.kind === 'recipe') {
          results.push(await expandRecipeParts(pool, best.synonymId, best.parts, item.massG));
          continue;
        }
        // Прямая запись — собрать `Snapshot`, `portion_g = mass_g` от модели, а НЕ
        // `default_portion_g` записи (ADR-001: модель отвечает за порцию, база — за число
        // на 100 г).
        const snapshot = toSnapshot(best.candidate, item.massG);
        results.push({ foodItemId: best.candidate.food_item_id, portionG: item.massG, sourceSnapshot: snapshot as unknown as Record<string, unknown> });
      }
      return results;
    },
  };
}
