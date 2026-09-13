// `CorrectScan` шаги 4-9 (`02_pseudocode.md`, FR-source-and-correct-9/10/11). Числа
// пересчитываются ИЗ СНИМКА через `@n4/shared` — та же функция, что использует
// `recognizer` при первичном сопоставлении (`ADR-001`, `security-operation-order.md`:
// два места с одной арифметикой расходятся молча). `evaluateDiscrepancy` здесь —
// ВТОРОЙ вызов ОДНОЙ функции (не второе арифметическое выражение): страж по исходнику
// (`single-model-estimate-read.test.ts`) считает АРИФМЕТИЧЕСКИЕ выражения, а не вызовы.

import type { DbClient } from '@n4/db';
import { computeItemFromSnapshot, evaluateDiscrepancy, sumMatchedKcal, type ComputedItemNumbers, type Snapshot } from '@n4/shared';
import { validateChoice, validateFoodItemId, validateIndex, validateMassG, type CorrectOp, type CorrectRequestBody, type ValidationError } from './validate-input.js';
import type { PersistedItem } from './response.js';

export interface CurrentScanRow {
  readonly items: readonly PersistedItem[];
  readonly model_estimate_kcal: number | null;
  readonly conflict_flag: boolean;
  readonly conflict_choice: string | null;
  readonly conflict_choice_at: Date | null;
  readonly corrections: readonly unknown[];
}

export interface AppliedCorrection {
  readonly items: PersistedItem[];
  readonly corrections: unknown[];
  readonly dbKcalTotal: number;
  readonly discrepancyRatio: number | null;
  readonly conflictFlag: boolean;
  readonly conflictChoice: string | null;
  readonly conflictChoiceAt: Date | null;
  readonly userCorrected: boolean;
}

export type ApplyOpResult = { readonly kind: 'ok'; readonly result: AppliedCorrection } | { readonly kind: 'error'; readonly status: 409 | 422; readonly error: ValidationError };

interface FoodItemLookupRow {
  readonly source_id: string;
  readonly name_en: string;
  /** Русское название из курации `food_synonym` — `null`, если записи нет; тогда подписью
   * становится `name_en` (`buildReplacedLabel`). Приходит ИЗ БАЗЫ, а не из тела запроса:
   * присланная клиентом подпись позволила бы показать «индейка» над числами свинины. */
  readonly name_ru: string | null;
  readonly kcal_per_100g: number;
  readonly protein_per_100g: number;
  readonly fat_per_100g: number;
  readonly carb_per_100g: number;
  readonly import_snapshot_date: string;
}

export async function lookupFoodItem(client: DbClient, id: string): Promise<FoodItemLookupRow | undefined> {
  const result = await client.query<{
    source_id: string;
    name_en: string;
    name_ru: string | null;
    kcal_per_100g: number;
    protein_per_100g: string;
    fat_per_100g: string;
    carb_per_100g: string;
    import_snapshot_date: string;
  }>(
    `SELECT fi.source_id, fi.name_en, fi.kcal_per_100g, fi.protein_per_100g, fi.fat_per_100g, fi.carb_per_100g,
            fi.import_snapshot_date::text AS import_snapshot_date,
            (SELECT fs.name_ru FROM food_synonym fs WHERE fs.food_item_id = fi.id
              ORDER BY char_length(fs.name_ru), fs.name_ru LIMIT 1) AS name_ru
     FROM food_item fi WHERE fi.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    source_id: row.source_id,
    name_en: row.name_en,
    name_ru: row.name_ru,
    kcal_per_100g: row.kcal_per_100g,
    protein_per_100g: Number(row.protein_per_100g),
    fat_per_100g: Number(row.fat_per_100g),
    carb_per_100g: Number(row.carb_per_100g),
    import_snapshot_date: row.import_snapshot_date,
  };
}

export type FoodItemLookupFn = (client: DbClient, id: string) => Promise<FoodItemLookupRow | undefined>;

/**
 * Подпись позиции ПОСЛЕ замены. Прежняя подпись пережить замену не может: она названа
 * моделью по прошлому продукту, и оставить её — значит показать «Свинина» над числами
 * индейки. Читается это как «кнопка не работает» (дефект найден владельцем 13.09.2026).
 *
 * Источник подписи — ТОЛЬКО база: русская курация `food_synonym`, иначе английское
 * название записи. Регистр первой буквы поднимается — курация хранится строчными, а
 * подписи позиций на экране начинаются с заглавной; это форма показа, не данные.
 */
export function buildReplacedLabel(row: Pick<FoodItemLookupRow, 'name_ru' | 'name_en'>): string {
  const source = row.name_ru !== null && row.name_ru.trim() !== '' ? row.name_ru.trim() : row.name_en;
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function toComputedNumbers(item: PersistedItem): ComputedItemNumbers {
  return { unmatched: item.unmatched, kcal: item.kcal, protein: item.protein, fat: item.fat, carb: item.carb };
}

function recomputePortion(item: PersistedItem, massG: number): PersistedItem {
  const numbers = computeItemFromSnapshot({
    foodItemId: item.food_item_id,
    portionG: massG,
    sourceSnapshot: item.source_snapshot,
    parts: item.parts?.map((part) => ({ share: part.share, sourceSnapshot: part.sourceSnapshot })),
  });
  return { ...item, mass_g: massG, unmatched: numbers.unmatched, kcal: numbers.kcal, protein: numbers.protein, fat: numbers.fat, carb: numbers.carb };
}

/**
 * Применяет ОДНУ операцию правки к копии `items`/`corrections`. Не пишет в базу —
 * вызывающий маршрут делает это ОДНИМ `UPDATE` в транзакции (шаг 9: частично применённая
 * правка показала бы состав от одного состояния и итог от другого).
 */
export async function applyCorrectOp(
  client: DbClient,
  current: CurrentScanRow,
  op: CorrectOp,
  body: CorrectRequestBody,
  deps: { readonly now?: () => Date; readonly lookupFoodItem?: FoodItemLookupFn } = {},
): Promise<ApplyOpResult> {
  const now = deps.now ?? (() => new Date());
  const lookup = deps.lookupFoodItem ?? lookupFoodItem;
  const items = current.items.map((item) => ({ ...item }));
  const corrections: unknown[] = [...current.corrections];
  let conflictChoice = current.conflict_choice;
  let conflictChoiceAt = current.conflict_choice_at;
  let userCorrected = false;

  if (op === 'set_portion') {
    const indexResult = validateIndex(body, items.length);
    if (!indexResult.ok) return { kind: 'error', status: 422, error: indexResult.error };
    const massResult = validateMassG(body);
    if (!massResult.ok) return { kind: 'error', status: 422, error: massResult.error };
    const before = items[indexResult.value] as PersistedItem;
    items[indexResult.value] = recomputePortion(before, massResult.value);
    userCorrected = true;
  } else if (op === 'replace_item') {
    const indexResult = validateIndex(body, items.length);
    if (!indexResult.ok) return { kind: 'error', status: 422, error: indexResult.error };
    const idResult = validateFoodItemId(body);
    if (!idResult.ok) return { kind: 'error', status: 422, error: idResult.error };
    const foodItem = await lookup(client, idResult.value);
    // `food_item_id`, которого нет в базе, → `422` (FR-source-and-correct-10).
    if (foodItem === undefined) return { kind: 'error', status: 422, error: { code: 'unknown_food_item', message: 'food_item_id не найден в базе' } };
    const before = items[indexResult.value] as PersistedItem;
    // Произвольные название, калорийность и значения на 100 г от клиента ИГНОРИРУЮТСЯ —
    // числа собираются ИСКЛЮЧИТЕЛЬНО из записи базы по `food_item_id` (ADR-001).
    const snapshot: Snapshot = {
      source: 'USDA-FDC',
      source_id: foodItem.source_id,
      name_en: foodItem.name_en,
      kcal_per_100g: foodItem.kcal_per_100g,
      protein_per_100g: foodItem.protein_per_100g,
      fat_per_100g: foodItem.fat_per_100g,
      carb_per_100g: foodItem.carb_per_100g,
      portion_g: before.mass_g,
      import_snapshot_date: foodItem.import_snapshot_date,
    };
    const numbers = computeItemFromSnapshot({ foodItemId: idResult.value, portionG: before.mass_g, sourceSnapshot: snapshot });
    const label = buildReplacedLabel(foodItem);
    // `candidates[]` — догадки МОДЕЛИ о прежнем продукте; после ручной замены они говорят
    // о том, чего в позиции больше нет, и на экране выглядят как неприменившаяся замена.
    items[indexResult.value] = { ...before, label_ru: label, candidates: undefined, food_item_id: idResult.value, source_snapshot: snapshot, parts: undefined, unmatched: numbers.unmatched, kcal: numbers.kcal, protein: numbers.protein, fat: numbers.fat, carb: numbers.carb };
    corrections.push({
      at: now().toISOString(),
      op: 'replace_item',
      index: indexResult.value,
      from: { label_ru: before.label_ru, food_item_id: before.food_item_id, mass_g: before.mass_g },
      to: { label_ru: label, food_item_id: idResult.value, mass_g: before.mass_g },
    });
    userCorrected = true;
  } else if (op === 'delete_item') {
    const indexResult = validateIndex(body, items.length);
    if (!indexResult.ok) return { kind: 'error', status: 422, error: indexResult.error };
    const [removed] = items.splice(indexResult.value, 1);
    corrections.push({
      at: now().toISOString(),
      op: 'delete_item',
      index: indexResult.value,
      from: { label_ru: removed?.label_ru, food_item_id: removed?.food_item_id ?? null, mass_g: removed?.mass_g },
      to: null,
    });
    userCorrected = true;
  } else if (op === 'resolve_conflict') {
    // `409`: разрешать нечего без зафиксированного расхождения.
    if (!current.conflict_flag) return { kind: 'error', status: 409, error: { code: 'no_conflict', message: 'расхождение не зафиксировано — разрешать нечего' } };
    const choiceResult = validateChoice(body);
    if (!choiceResult.ok) return { kind: 'error', status: 422, error: choiceResult.error };
    // Шаг 6.5: пересчёта чисел НЕТ — выбор фиксирует согласие с базой и не трогает ни
    // массы, ни снимки. Число блюда остаётся `db_kcal_total`.
    conflictChoice = 'take_db';
    conflictChoiceAt = now();
  }

  // Шаг 7: пересуммировать блюдо, пересчитать расхождение ЗАНОВО — правка могла изменить
  // обе стороны сравнения.
  const dbKcalTotal = sumMatchedKcal(items.map(toComputedNumbers));
  const discrepancy = evaluateDiscrepancy(current.model_estimate_kcal, dbKcalTotal);

  return {
    kind: 'ok',
    result: {
      items,
      corrections,
      dbKcalTotal,
      discrepancyRatio: discrepancy.discrepancyRatio,
      conflictFlag: discrepancy.conflictFlag,
      conflictChoice,
      conflictChoiceAt,
      userCorrected,
    },
  };
}
