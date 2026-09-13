// `EvaluateDiscrepancy` (FR-source-and-correct-8, AC-source-and-correct-14/15/16).

import { describe, expect, it } from 'vitest';
import { evaluateDiscrepancy } from '@n4/shared';

describe('evaluateDiscrepancy', () => {
  it('AC-14: расхождение 22% показывает оба числа, conflict_flag=true', () => {
    const result = evaluateDiscrepancy(780, 640);
    expect(result.discrepancyRatio).toBeCloseTo(0.219, 3);
    expect(result.conflictFlag).toBe(true);
  });

  it('AC-15: граница 15,0% — conflict_flag=false; 15,1% (1151/1000) — true', () => {
    const atThreshold = evaluateDiscrepancy(1150, 1000);
    expect(atThreshold.discrepancyRatio).toBeCloseTo(0.15, 5);
    expect(atThreshold.conflictFlag).toBe(false);

    const overThreshold = evaluateDiscrepancy(1151, 1000);
    expect(overThreshold.discrepancyRatio).toBeCloseTo(0.151, 5);
    expect(overThreshold.conflictFlag).toBe(true);
  });

  it('AC-16: нулевой знаменатель — «не измерено», а не 0%', () => {
    const result = evaluateDiscrepancy(500, 0);
    expect(result.discrepancyRatio).toBeNull();
    expect(result.conflictFlag).toBe(false);
  });

  it('db_kcal_total отсутствует (null) — тоже «не измерено»', () => {
    expect(evaluateDiscrepancy(500, null)).toEqual({ discrepancyRatio: null, conflictFlag: false });
  });

  it('model_estimate_kcal отсутствует (null) — сравнивать не с чем', () => {
    expect(evaluateDiscrepancy(null, 500)).toEqual({ discrepancyRatio: null, conflictFlag: false });
  });

  it('расхождение считается симметрично (модуль разности)', () => {
    // модель ниже базы даёт тот же модуль, что и модель выше базы при равном разрыве.
    const under = evaluateDiscrepancy(500, 640);
    const over = evaluateDiscrepancy(780, 640);
    expect(under.discrepancyRatio).toBeCloseTo(over.discrepancyRatio ?? -1, 5);
  });
});
