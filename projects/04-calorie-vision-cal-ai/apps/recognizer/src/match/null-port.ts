// `NullMatchIngredientPort` — реализация этой фичи (FR-scan-pipeline-8, «Стык с
// `source-and-correct`»). `food_item` пуст: КАЖДЫЙ элемент возвращается `food_item_id: null`,
// `parts` НИКОГДА не присутствует (AC-scan-pipeline-35). Ни сети, ни обращения к базе.

import type { MatchIngredientPort, MatchedItem, RecognizedItemForMatch } from './port.js';

export function createNullMatchIngredientPort(): MatchIngredientPort {
  return {
    async match(items: readonly RecognizedItemForMatch[]): Promise<MatchedItem[]> {
      return items.map((item) => ({
        foodItemId: null,
        portionG: item.massG,
        sourceSnapshot: null,
      }));
    },
  };
}
