// FR-scan-pipeline-6 шаг 5, AC-scan-pipeline-11: диапазоны — код, без подрезания.

import { describe, expect, it } from 'vitest';
import { validateModelResponseRanges } from '../../../apps/recognizer/src/recognize/validate-ranges.js';
import type { ModelResponse } from '../../../apps/recognizer/src/provider/types.js';

function baseResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    items: [{ labelRu: 'борщ', massG: 200, candidates: [] }],
    confidence: 0.8,
    modelEstimateKcal: 300,
    model: 'haiku-4.5',
    ...overrides,
  };
}

describe('validateModelResponseRanges (AC-scan-pipeline-11, без подрезания)', () => {
  it('валидный ответ проходит', () => {
    expect(validateModelResponseRanges(baseResponse())).toEqual({ ok: true });
  });

  it('confidence = 1.5 — schema_violation по полю confidence, БЕЗ подрезания до 1', () => {
    const result = validateModelResponseRanges(baseResponse({ confidence: 1.5 }));
    expect(result).toEqual({ ok: false, field: 'confidence' });
  });

  it('confidence отрицательный — тоже нарушение', () => {
    expect(validateModelResponseRanges(baseResponse({ confidence: -0.1 })).ok).toBe(false);
  });

  it('mass_g = 6000 (сверх 5000) — schema_violation по mass_g, БЕЗ подрезания до 5000', () => {
    const result = validateModelResponseRanges(baseResponse({ items: [{ labelRu: 'x', massG: 6000, candidates: [] }] }));
    expect(result).toEqual({ ok: false, field: 'mass_g' });
  });

  it('mass_g = 0 (ниже минимума 1) — нарушение', () => {
    const result = validateModelResponseRanges(baseResponse({ items: [{ labelRu: 'x', massG: 0, candidates: [] }] }));
    expect(result.ok).toBe(false);
    expect(result.field).toBe('mass_g');
  });

  it('13 позиций (сверх 12) — schema_violation по items_count', () => {
    const items = Array.from({ length: 13 }, () => ({ labelRu: 'x', massG: 100, candidates: [] as string[] }));
    const result = validateModelResponseRanges(baseResponse({ items }));
    expect(result).toEqual({ ok: false, field: 'items_count' });
  });

  it('12 позиций — на границе, проходит', () => {
    const items = Array.from({ length: 12 }, () => ({ labelRu: 'x', massG: 100, candidates: [] as string[] }));
    expect(validateModelResponseRanges(baseResponse({ items })).ok).toBe(true);
  });

  it('более 3 кандидатов на позицию — нарушение', () => {
    const result = validateModelResponseRanges(baseResponse({ items: [{ labelRu: 'x', massG: 100, candidates: ['a', 'b', 'c', 'd'] }] }));
    expect(result).toEqual({ ok: false, field: 'candidates_count' });
  });

  it('отрицательный model_estimate_kcal — нарушение', () => {
    expect(validateModelResponseRanges(baseResponse({ modelEstimateKcal: -1 })).ok).toBe(false);
  });
});
