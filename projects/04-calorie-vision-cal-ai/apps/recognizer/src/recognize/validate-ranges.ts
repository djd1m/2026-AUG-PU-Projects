// Диапазоны проверяет НАШ КОД, после разбора (FR-scan-pipeline-6 шаг 5, AC-scan-pipeline-11).
// Значение вне диапазона трактуется как ОТСУТСТВУЮЩЕЕ, а НЕ подрезается до границы:
// `confidence = 1.5`, подрезанное до `1`, тихо стало бы «уверен» и отменило эскалацию.

import type { ModelResponse } from '../provider/types.js';

export type RangeViolationField = 'confidence' | 'mass_g' | 'items_count' | 'candidates_count' | 'model_estimate_kcal';

export interface RangeValidationResult {
  readonly ok: boolean;
  readonly field?: RangeViolationField;
}

const MAX_ITEMS = 12;
const MAX_CANDIDATES = 3;
const MIN_MASS_G = 1;
const MAX_MASS_G = 5000;

export function validateModelResponseRanges(response: ModelResponse): RangeValidationResult {
  if (!Number.isFinite(response.confidence) || response.confidence < 0 || response.confidence > 1) {
    return { ok: false, field: 'confidence' };
  }
  if (response.items.length > MAX_ITEMS) return { ok: false, field: 'items_count' };
  for (const item of response.items) {
    if (!Number.isFinite(item.massG) || item.massG < MIN_MASS_G || item.massG > MAX_MASS_G) {
      return { ok: false, field: 'mass_g' };
    }
    if (item.candidates.length > MAX_CANDIDATES) return { ok: false, field: 'candidates_count' };
  }
  if (!Number.isFinite(response.modelEstimateKcal) || response.modelEstimateKcal < 0) {
    return { ok: false, field: 'model_estimate_kcal' };
  }
  return { ok: true };
}
