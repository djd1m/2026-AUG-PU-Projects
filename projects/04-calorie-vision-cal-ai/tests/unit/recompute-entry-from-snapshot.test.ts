// Пересчёт чисел позиции/записи по ХРАНИМОМУ source_snapshot (FR-diary-and-streak-2/3).
// Живая таблица food_item здесь недостижима по построению — модуль получает снимок готовым
// аргументом (`recompute-entry-from-snapshot.ts`, шапка файла).

import { describe, expect, it } from 'vitest';
import { applyMassToItem, numbersFromSnapshot, recomputeEntryTotals } from '../../apps/api/src/diary/recompute-entry-from-snapshot.js';

const RICE_SNAPSHOT = { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28 };

describe('numbersFromSnapshot', () => {
  it('масштабирует значения на 100 г по формуле (масса/100) × значение_на_100г', () => {
    const numbers = numbersFromSnapshot(250, RICE_SNAPSHOT);
    expect(numbers).toEqual({ kcal: 325, protein: 6.8, fat: 0.8, carb: 70 });
  });

  it('позиция без снимка (не сопоставлена базе) даёт нулевые числа', () => {
    expect(numbersFromSnapshot(250, null)).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
    expect(numbersFromSnapshot(250, undefined)).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
  });
});

describe('recomputeEntryTotals', () => {
  it('исключает unmatched позиции из суммы, не подставляя ноль вместо значения', () => {
    const items = [
      { label_ru: 'рис', mass_g: 200, unmatched: false },
      { label_ru: 'неизвестное блюдо', mass_g: 300, unmatched: true },
    ];
    const snapshots = [RICE_SNAPSHOT, null];

    const totals = recomputeEntryTotals(items, snapshots);

    // Только рис участвует: (200/100) × {130, 2.7, 0.3, 28}.
    expect(totals).toEqual({ kcal: 260, protein: 5.4, fat: 0.6, carb: 56 });
  });

  it('пустой список позиций даёт нулевую сумму', () => {
    expect(recomputeEntryTotals([], [])).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
  });
});

describe('applyMassToItem', () => {
  it('меняет только массу и числа позиции, прочие поля не трогает', () => {
    const item = { label_ru: 'рис', mass_g: 250, unmatched: false, food_item_id: 'rice-1' };
    const updated = applyMassToItem(item, 180, RICE_SNAPSHOT);

    expect(updated.mass_g).toBe(180);
    expect(updated.label_ru).toBe('рис');
    expect(updated.food_item_id).toBe('rice-1');
    expect(updated.kcal).toBe(234); // (180/100) × 130 = 234
  });
});
