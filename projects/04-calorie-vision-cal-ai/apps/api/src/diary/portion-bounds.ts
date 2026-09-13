// Границы `set_portion` (FR-diary-and-streak-3, AC-diary-and-streak-7, AC-diary-and-streak-8).
//
// Валидация ЦЕЛИКОМ, до любой записи: дробное, отрицательное, `0`, строка, `null`, вне диапазона
// 5–2000 — все дают отказ БЕЗ частичного применения (ввод не принят частично, а не «принят с
// подрезкой до границы» — тот же принцип, что `confidence` в `packages/shared/src/domain/units.ts`).

export const PORTION_MIN_GRAMS = 5;
export const PORTION_MAX_GRAMS = 2000;

export function isValidPortionMassG(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= PORTION_MIN_GRAMS && value <= PORTION_MAX_GRAMS;
}

export function isValidItemIndex(value: unknown, itemsLength: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < itemsLength;
}
