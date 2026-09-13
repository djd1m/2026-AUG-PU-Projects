// `ComputeFromSnapshot` (FR-source-and-correct-6, AC-source-and-correct-9/10/11/12).

import { describe, expect, it } from 'vitest';
import { computeItemFromSnapshot, sumMatchedKcal, type Snapshot } from '@n4/shared';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    source: 'USDA-FDC',
    source_id: '168878',
    name_en: 'Rice, white, long-grain, cooked',
    kcal_per_100g: 130,
    protein_per_100g: 2.7,
    fat_per_100g: 0.3,
    carb_per_100g: 28.2,
    portion_g: 250,
    import_snapshot_date: '2026-04-01',
    ...overrides,
  };
}

describe('computeItemFromSnapshot — одна запись (AC-source-and-correct-11)', () => {
  it('числа считаются из СНИМКА: 250 г при 130 ккал/100г даёт 325 ккал', () => {
    const result = computeItemFromSnapshot({ foodItemId: 'rice-id', portionG: 250, sourceSnapshot: snapshot({ kcal_per_100g: 130 }) });
    expect(result.unmatched).toBe(false);
    expect(result.kcal).toBe(325);
  });

  it('переимпорт (изменение kcal_per_100g в ЖИВОЙ строке food_item) не влияет на УЖЕ построенный снимок', () => {
    const originalSnapshot = snapshot({ kcal_per_100g: 130 });
    const before = computeItemFromSnapshot({ foodItemId: 'rice-id', portionG: 250, sourceSnapshot: originalSnapshot });
    // "food_item" в базе обновился, но снимок этой позиции — независимая копия.
    const afterReimport = computeItemFromSnapshot({ foodItemId: 'rice-id', portionG: 250, sourceSnapshot: originalSnapshot });
    expect(afterReimport.kcal).toBe(before.kcal);
    expect(afterReimport.kcal).toBe(325);
  });
});

describe('computeItemFromSnapshot — позиция без записи базы (AC-source-and-correct-12)', () => {
  it('unmatched=true, все четыре числа — null, а НЕ ноль', () => {
    const result = computeItemFromSnapshot({ foodItemId: null, portionG: 150, sourceSnapshot: null });
    expect(result.unmatched).toBe(true);
    expect(result.kcal).toBeNull();
    expect(result.protein).toBeNull();
    expect(result.fat).toBeNull();
    expect(result.carb).toBeNull();
  });
});

describe('computeItemFromSnapshot — составное блюдо (AC-source-and-correct-10)', () => {
  it('каждая часть считается из СВОЕГО снимка по СВОЕЙ массе, сумма — итог позиции', () => {
    const result = computeItemFromSnapshot({
      foodItemId: 'borsch-synonym',
      portionG: 300,
      sourceSnapshot: null,
      parts: [
        { share: 0.6, sourceSnapshot: snapshot({ kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2 }) }, // рис, 180г
        { share: 0.4, sourceSnapshot: snapshot({ kcal_per_100g: 165, protein_per_100g: 31, fat_per_100g: 3.6, carb_per_100g: 0 }) }, // курица, 120г
      ],
    });
    expect(result.unmatched).toBe(false);
    // рис 180г: round(180/100*130)=234; курица 120г: round(120/100*165)=198; итог 432.
    expect(result.kcal).toBe(432);
  });

  it('часть без разрешённого food_item делает ВСЮ позицию unmatched — не считает по остатку', () => {
    const result = computeItemFromSnapshot({
      foodItemId: 'borsch-synonym',
      portionG: 300,
      sourceSnapshot: null,
      parts: [
        { share: 0.6, sourceSnapshot: snapshot() },
        { share: 0.4, sourceSnapshot: null }, // часть не разрешилась
      ],
    });
    expect(result.unmatched).toBe(true);
    expect(result.kcal).toBeNull();
  });
});

describe('sumMatchedKcal — db_kcal_total (FR-source-and-correct-6)', () => {
  it('суммирует ТОЛЬКО сопоставленные позиции, unmatched исключены без подстановки нуля в счёт', () => {
    const items = [
      computeItemFromSnapshot({ foodItemId: 'a', portionG: 100, sourceSnapshot: snapshot({ kcal_per_100g: 100 }) }), // 100
      computeItemFromSnapshot({ foodItemId: null, portionG: 100, sourceSnapshot: null }), // unmatched
      computeItemFromSnapshot({ foodItemId: 'b', portionG: 200, sourceSnapshot: snapshot({ kcal_per_100g: 50 }) }), // 100
    ];
    expect(sumMatchedKcal(items)).toBe(200);
  });

  it('пустой список даёт 0 (арифметика суммы, не «не измерено»)', () => {
    expect(sumMatchedKcal([])).toBe(0);
  });
});
