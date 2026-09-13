// `MatchIngredientPort` — точка расширения для сопоставления с базой продуктов
// (FR-scan-pipeline-8, ADR-001 «Стык с `source-and-correct`»). ОДИН пакетный вызов на ВЕСЬ
// список позиций — контракт СИММЕТРИЧЕН верхнему уровню и готов принять составное блюдо
// (`parts[]`) без переделки вызывающего кода (PC-08, Попытка 4).

import type { Confidence } from '@n4/shared';

export interface RecognizedItemForMatch {
  readonly labelRu: string;
  readonly massG: number;
  /**
   * До трёх идентификаторов записей базы, ПРЕДЛОЖЕННЫХ моделью (`RecognizedItemDraft.
   * candidates`, `scan-pipeline`) — РАСШИРЕНИЕ, добавленное фичей `source-and-correct`
   * (FR-source-and-correct-3, шаг 4 `SearchFoodCandidates`: триграммы по `food_item.
   * name_en` ТОЛЬКО среди этих кандидатов, а не по всей базе). Опциональное поле —
   * `NullMatchIngredientPort` и контрактный тест (`AC-scan-pipeline-28`) его не читают и
   * не ломаются от его присутствия; сигнатура порта НЕ меняется.
   */
  readonly candidates?: readonly string[];
}

export interface MatchedPart {
  readonly foodItemId: string;
  readonly share: Confidence | number;
  readonly sourceSnapshot: Record<string, unknown>;
}

export interface MatchedItem {
  readonly foodItemId: string | null;
  readonly portionG: number;
  readonly sourceSnapshot: Record<string, unknown> | null;
  /** Составное блюдо: КАЖДАЯ часть несёт СВОЙ `sourceSnapshot` (PC-08). */
  readonly parts?: readonly MatchedPart[];
}

export interface MatchIngredientPort {
  /** Длина и порядок ответа ОБЯЗАНЫ совпадать со входом (контрактный тест, AC-scan-pipeline-28). */
  match(items: readonly RecognizedItemForMatch[]): Promise<MatchedItem[]>;
}
