// `MatchIngredientPort` — точка расширения для сопоставления с базой продуктов
// (FR-scan-pipeline-8, ADR-001 «Стык с `source-and-correct`»). ОДИН пакетный вызов на ВЕСЬ
// список позиций — контракт СИММЕТРИЧЕН верхнему уровню и готов принять составное блюдо
// (`parts[]`) без переделки вызывающего кода (PC-08, Попытка 4).

import type { Confidence } from '@n4/shared';

export interface RecognizedItemForMatch {
  readonly labelRu: string;
  readonly massG: number;
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
