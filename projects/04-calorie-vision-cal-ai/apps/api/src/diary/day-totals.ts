// RecomputeDayTotals (FR-diary-and-streak-6, AC-diary-and-streak-18).
//
// ЕДИНСТВЕННОЕ место, агрегирующее калории и БЖУ дня (03_architecture.md, «Границы, которые фича
// обязана сохранить»). Источник суммы — ТОЛЬКО персистированные колонки `diary_entry`
// (`kcal_total`, `protein_total`, `fat_total`, `carb_total`): таблица `food_item` здесь НЕ
// УЧАСТВУЕТ ни при каком условии — переимпорт базы не имеет права задним числом изменить уже
// показанный итог (`.claude/rules/coding-style.md`, «Числа и источник»).
//
// Страж по исходнику (`tests/unit/day-totals-guard.test.ts`, `guard-must-be-able-to-fail`):
// внедрённый дефект — замена суммы персистированных колонок на пересчёт через
// `JOIN food_item` по `items->>'food_item_id'` — обязан дать красный результат; этот файл не
// содержит ни слова `food_item`, ни обращения к любой другой таблице, кроме `diary_entry`.

import type { DbClient, DbPool } from '@n4/db';
import { MEAL_SLOTS, type MealSlot } from '@n4/shared';

export interface DayTotals {
  readonly kcal: number;
  readonly protein: number;
  readonly fat: number;
  readonly carb: number;
}

export interface DayTotalsResult {
  readonly totals: DayTotals;
  readonly byMeal: Record<MealSlot, DayTotals>;
}

interface DiaryEntryTotalsRow {
  readonly meal_slot: MealSlot;
  readonly kcal_total: number;
  readonly protein_total: string;
  readonly fat_total: string;
  readonly carb_total: string;
}

const SELECT_DAY_ENTRIES = `
  SELECT meal_slot, kcal_total, protein_total, fat_total, carb_total
  FROM diary_entry
  WHERE owner_key = $1 AND eaten_on = $2 AND deleted_at IS NULL
`;

function emptyTotals(): DayTotals {
  return { kcal: 0, protein: 0, fat: 0, carb: 0 };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function add(target: DayTotals, kcal: number, protein: number, fat: number, carb: number): DayTotals {
  return { kcal: target.kcal + kcal, protein: target.protein + protein, fat: target.fat + fat, carb: target.carb + carb };
}

/**
 * Пустой день (ни одной неудалённой записи) даёт нулевой итог по построению — это ЧЕСТНЫЙ ноль,
 * а не «не измерено» (`.claude/rules/fail-closed-defaults.md`: здесь ноль записей означает ноль
 * калорий, отличие от `discrepancy_ratio` при делении на ноль там, где ноль был бы ложью).
 */
export async function recomputeDayTotals(executor: DbPool | DbClient, ownerKey: string, eatenOn: string): Promise<DayTotalsResult> {
  const result = await executor.query<DiaryEntryTotalsRow>(SELECT_DAY_ENTRIES, [ownerKey, eatenOn]);

  let totals = emptyTotals();
  const byMeal: Record<MealSlot, DayTotals> = {
    breakfast: emptyTotals(),
    lunch: emptyTotals(),
    dinner: emptyTotals(),
    snack: emptyTotals(),
  };

  for (const row of result.rows) {
    const kcal = row.kcal_total;
    const protein = Number(row.protein_total);
    const fat = Number(row.fat_total);
    const carb = Number(row.carb_total);
    totals = add(totals, kcal, protein, fat, carb);
    if (MEAL_SLOTS.includes(row.meal_slot)) {
      byMeal[row.meal_slot] = add(byMeal[row.meal_slot], kcal, protein, fat, carb);
    }
  }

  totals = { kcal: totals.kcal, protein: round1(totals.protein), fat: round1(totals.fat), carb: round1(totals.carb) };
  for (const slot of MEAL_SLOTS) {
    const value = byMeal[slot];
    byMeal[slot] = { kcal: value.kcal, protein: round1(value.protein), fat: round1(value.fat), carb: round1(value.carb) };
  }

  return { totals, byMeal };
}
