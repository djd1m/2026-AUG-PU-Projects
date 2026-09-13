// `ComputeFromSnapshot` и `EvaluateDiscrepancy` (`02_pseudocode.md`, FR-source-and-correct-
// 6/7/8, ADR-001). Живёт в `packages/shared`, а НЕ дублируется по `apps/recognizer` и
// `apps/api` отдельно: обеим сторонам (сопоставление при распознавании и пересчёт при
// правке `POST /scans/{id}/correct`) нужна ОДНА и та же арифметика, а не два места с одним
// правилом, которые однажды разойдутся молча. `apps/recognizer/src/compute/*` и
// `apps/api/src/correct/apply-op.ts` ИМПОРТИРУЮТ отсюда — не переопределяют.
//
// `evaluateDiscrepancy` — ЕДИНСТВЕННОЕ место во всей кодовой базе, где значение
// `model_estimate_kcal` читается для АРИФМЕТИКИ (страж `tests/guard/single-model-estimate-
// read.test.ts`, испытан мутацией, AC-source-and-correct-24). Строка ниже, содержащая
// вычитание/деление, — та самая единственная точка; менять её текст — вносить дефект.

import type { Snapshot } from './food.js';

export interface ComputedItemNumbers {
  readonly unmatched: boolean;
  readonly kcal: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
  readonly carb: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function fromOneSnapshot(snapshot: Snapshot, massG: number): { kcal: number; protein: number; fat: number; carb: number } {
  return {
    kcal: Math.round((massG / 100) * snapshot.kcal_per_100g),
    protein: round1((massG / 100) * snapshot.protein_per_100g),
    fat: round1((massG / 100) * snapshot.fat_per_100g),
    carb: round1((massG / 100) * snapshot.carb_per_100g),
  };
}

const UNMATCHED: ComputedItemNumbers = { unmatched: true, kcal: null, protein: null, fat: null, carb: null };

export interface ComputableItem {
  readonly foodItemId: string | null;
  readonly portionG: number;
  readonly sourceSnapshot: Snapshot | null;
  readonly parts?: ReadonlyArray<{ readonly share: number; readonly sourceSnapshot: Snapshot | null }>;
}

/**
 * `ComputeFromSnapshot` шаг 1 — по ОДНОЙ позиции. Ноль вместо неизвестного НЕ
 * подставляется: позиция без записи базы → `unmatched = true`, четыре поля `null`.
 */
export function computeItemFromSnapshot(item: ComputableItem): ComputedItemNumbers {
  if (item.parts !== undefined && item.parts.length > 0) {
    let kcal = 0;
    let protein = 0;
    let fat = 0;
    let carb = 0;
    for (const part of item.parts) {
      // Часть, чья запись `food_item` не найдена, делает ВЕСЬ синоним непригодным —
      // считать по остатку долей ЗАПРЕЩЕНО (FR-source-and-correct-5).
      if (part.sourceSnapshot === null) return UNMATCHED;
      const massG = Math.round(item.portionG * part.share);
      const partNumbers = fromOneSnapshot(part.sourceSnapshot, massG);
      kcal += partNumbers.kcal;
      protein += partNumbers.protein;
      fat += partNumbers.fat;
      carb += partNumbers.carb;
    }
    return { unmatched: false, kcal: Math.round(kcal), protein: round1(protein), fat: round1(fat), carb: round1(carb) };
  }
  if (item.foodItemId === null || item.sourceSnapshot === null) return UNMATCHED;
  const numbers = fromOneSnapshot(item.sourceSnapshot, item.portionG);
  return { unmatched: false, ...numbers };
}

/** `db_kcal_total` — сумма `kcal` позиций, где `unmatched = false` (FR-source-and-correct-6). */
export function sumMatchedKcal(items: readonly ComputedItemNumbers[]): number {
  return items.reduce((sum, item) => sum + (item.unmatched ? 0 : (item.kcal ?? 0)), 0);
}

export interface DiscrepancyResult {
  readonly discrepancyRatio: number | null;
  readonly conflictFlag: boolean;
}

const CONFLICT_THRESHOLD = 0.15;

/**
 * `EvaluateDiscrepancy` (FR-source-and-correct-8). Нулевой/отсутствующий знаменатель —
 * «не измерено» (`discrepancyRatio: null`), а НЕ `0%` (`honest-configuration.md` CFG-I7).
 */
export function evaluateDiscrepancy(modelEstimateKcal: number | null, dbKcalTotal: number | null): DiscrepancyResult {
  if (dbKcalTotal === null || dbKcalTotal === 0 || modelEstimateKcal === null) {
    return { discrepancyRatio: null, conflictFlag: false };
  }
  // ЕДИНСТВЕННОЕ арифметическое чтение `model_estimate_kcal` во всей кодовой базе.
  const discrepancyRatio = Math.abs(modelEstimateKcal - dbKcalTotal) / dbKcalTotal;
  return { discrepancyRatio, conflictFlag: discrepancyRatio > CONFLICT_THRESHOLD };
}
