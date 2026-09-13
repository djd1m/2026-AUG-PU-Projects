// RecomputeDayTotals (FR-diary-and-streak-6). Логика чистая — источник СУММЫ и обработка
// пустого дня проверяются без базы: результат `recomputeDayTotals` целиком определяется
// строками, которые вернул бы SELECT, а не самим SQL (мок `DbPool` подменяет только `query`).

import { describe, expect, it } from 'vitest';
import { recomputeDayTotals } from '../../apps/api/src/diary/day-totals.js';

interface FakeRow {
  readonly meal_slot: string;
  readonly kcal_total: number;
  readonly protein_total: string;
  readonly fat_total: string;
  readonly carb_total: string;
}

function fakePool(rows: FakeRow[]) {
  return {
    query: async () => ({ rows, rowCount: rows.length }),
  } as unknown as import('@n4/db').DbPool;
}

describe('RecomputeDayTotals', () => {
  it('сумма по дню считается только из персистированных колонок diary_entry', async () => {
    const rows: FakeRow[] = [
      { meal_slot: 'breakfast', kcal_total: 300, protein_total: '10.0', fat_total: '5.0', carb_total: '40.0' },
      { meal_slot: 'lunch', kcal_total: 500, protein_total: '20.0', fat_total: '15.0', carb_total: '60.0' },
      { meal_slot: 'lunch', kcal_total: 200, protein_total: '5.0', fat_total: '3.0', carb_total: '25.0' },
    ];
    const result = await recomputeDayTotals(fakePool(rows), 'owner-1', '2026-09-13');

    expect(result.totals).toEqual({ kcal: 1000, protein: 35, fat: 23, carb: 125 });
    expect(result.byMeal.breakfast).toEqual({ kcal: 300, protein: 10, fat: 5, carb: 40 });
    expect(result.byMeal.lunch).toEqual({ kcal: 700, protein: 25, fat: 18, carb: 85 });
    expect(result.byMeal.dinner).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
    expect(result.byMeal.snack).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
  });

  it('день без записей даёт нулевой итог, а не ошибку', async () => {
    const result = await recomputeDayTotals(fakePool([]), 'owner-1', '2026-09-13');

    expect(result.totals).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      expect(result.byMeal[slot]).toEqual({ kcal: 0, protein: 0, fat: 0, carb: 0 });
    }
  });
});
