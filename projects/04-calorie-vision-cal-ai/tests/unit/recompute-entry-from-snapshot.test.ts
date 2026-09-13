// Пересчёт чисел позиции/записи по ХРАНИМОМУ source_snapshot (FR-diary-and-streak-2/3).
// Живая таблица food_item здесь недостижима по построению — модуль получает снимок готовым
// аргументом (`recompute-entry-from-snapshot.ts`, шапка файла).

import { describe, expect, it } from 'vitest';
import { applyMassToItem, numbersForItem, numbersFromSnapshot, recomputeEntryTotals } from '../../apps/api/src/diary/recompute-entry-from-snapshot.js';

const RICE_SNAPSHOT = { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28 };

describe('numbersFromSnapshot', () => {
  it('масштабирует значения на 100 г по формуле (масса/100) × значение_на_100г', () => {
    const numbers = numbersFromSnapshot(250, RICE_SNAPSHOT);
    expect(numbers).toEqual({ kcal: 325, protein: 6.8, fat: 0.8, carb: 70 });
  });

  it('позиция без снимка (не сопоставлена базе) даёт null — не измерено, не ноль', () => {
    expect(numbersFromSnapshot(250, null)).toBeNull();
    expect(numbersFromSnapshot(250, undefined)).toBeNull();
  });

  // RV-diary-and-streak-01 (review-report.md): раньше отсутствующий нутриент подменялся нулём
  // (`readNumber`) — снимок с ХОТЯ БЫ ОДНИМ отсутствующим полем читался как «0 ккал/100 г»,
  // хотя это не измерение, а дыра в данных.
  it('снимок с отсутствующим хотя бы одним нутриентом отклоняется явно, а не считается нулём', () => {
    const incomplete = { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3 }; // carb_per_100g отсутствует
    expect(numbersFromSnapshot(250, incomplete)).toBeNull();
  });
});

describe('numbersForItem — составное блюдо (RV-diary-and-streak-01)', () => {
  it('считает по частям (parts[]), а не по верхнему снимку — воспроизведение находки ревью', () => {
    // Воспроизводит review-report.md RV-01 дословно: 300 г, доли 0,6 риса (130 ккал/100г) и
    // 0,4 курицы (165 ккал/100г); верхний снимок — placeholder БЕЗ единого питательного поля.
    // Раньше это давало 0 ккал (верхний снимок игнорировался бы полностью через readNumber);
    // теперь — сумма по частям: 180г риса → 234 ккал, 120г курицы → 198 ккал, итого 432.
    const compositeItem = {
      label_ru: 'плов с курицей',
      mass_g: 300,
      unmatched: false,
      food_item_id: 'composite-dish',
      parts: [
        { foodItemId: 'rice', share: 0.6, sourceSnapshot: { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28 } },
        { foodItemId: 'chicken', share: 0.4, sourceSnapshot: { kcal_per_100g: 165, protein_per_100g: 31, fat_per_100g: 3.6, carb_per_100g: 0 } },
      ],
    };
    const topLevelSnapshot = { id: 'composite-dish', note: 'верхний уровень — снимок НЕ используется, если есть parts' };

    const numbers = numbersForItem(compositeItem, 300, topLevelSnapshot);

    expect(numbers).not.toBeNull();
    expect(numbers?.kcal).toBe(432); // 1,8×130 + 1,2×165 = 234 + 198
    expect(numbers?.kcal).not.toBe(0); // именно ЭТОТ ноль воспроизводил дефект RV-01
  });

  it('неполный снимок ЛЮБОЙ части исключает ВСЁ составное блюдо (не частичное число)', () => {
    const compositeItem = {
      mass_g: 300,
      parts: [
        { foodItemId: 'rice', share: 0.6, sourceSnapshot: { kcal_per_100g: 130, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28 } },
        { foodItemId: 'chicken', share: 0.4, sourceSnapshot: { kcal_per_100g: 165 } }, // неполный снимок части
      ],
    };
    expect(numbersForItem(compositeItem, 300, null)).toBeNull();
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
