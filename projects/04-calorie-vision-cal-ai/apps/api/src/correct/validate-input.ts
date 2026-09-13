// Валидация тела `POST /api/v1/scans/{id}/correct` (`02_pseudocode.md`, `CorrectScan`
// шаги 4-6, FR-source-and-correct-9/10/11). Границы применяются на СЕРВЕРЕ: порция вне
// 5–2000 г, дробное, отрицательное, строка, `null`, отсутствующее поле — `422` с
// сохранением ПРЕЖНЕГО значения (`security.md`, «Граница входа»).

export const CORRECT_OPS = ['set_portion', 'replace_item', 'delete_item', 'resolve_conflict'] as const;
export type CorrectOp = (typeof CORRECT_OPS)[number];

export const PORTION_MIN_G = 5;
export const PORTION_MAX_G = 2000;

export interface CorrectRequestBody {
  readonly op?: unknown;
  readonly index?: unknown;
  readonly mass_g?: unknown;
  readonly food_item_id?: unknown;
  readonly query?: unknown;
  readonly choice?: unknown;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ValidationError };

function isOp(value: unknown): value is CorrectOp {
  return typeof value === 'string' && (CORRECT_OPS as readonly string[]).includes(value);
}

/** Неизвестное значение `op` — `422 unknown_op`, а не «наверное, `set_portion`» (fail-closed). */
export function validateOp(body: CorrectRequestBody): ValidationResult<CorrectOp> {
  if (!isOp(body.op)) return { ok: false, error: { code: 'unknown_op', message: 'неизвестная операция' } };
  return { ok: true, value: body.op };
}

/** Индекс позиции — тоже ВХОД: вне границ списка → `422`, а не запись мимо массива. */
export function validateIndex(body: CorrectRequestBody, itemCount: number): ValidationResult<number> {
  const raw = body.index;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= itemCount) {
    return { ok: false, error: { code: 'index_out_of_range', message: `индекс позиции обязан быть целым в диапазоне 0..${Math.max(0, itemCount - 1)}`, details: { item_count: itemCount } } };
  }
  return { ok: true, value: raw };
}

/**
 * Дробное, отрицательное, строка, `null`, отсутствующее поле — ВСЕ дают `422` с одним и
 * тем же кодом и названным диапазоном (AC-source-and-correct-18). Клиентская проверка —
 * удобство, а не защита.
 */
export function validateMassG(body: CorrectRequestBody): ValidationResult<number> {
  const raw = body.mass_g;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < PORTION_MIN_G || raw > PORTION_MAX_G) {
    return { ok: false, error: { code: 'portion_out_of_range', message: `порция обязана быть целым числом ${PORTION_MIN_G}..${PORTION_MAX_G} г`, details: { min: PORTION_MIN_G, max: PORTION_MAX_G } } };
  }
  return { ok: true, value: raw };
}

export function validateFoodItemId(body: CorrectRequestBody): ValidationResult<string> {
  const raw = body.food_item_id;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: { code: 'unknown_food_item', message: 'food_item_id обязателен и обязан быть строкой' } };
  }
  return { ok: true, value: raw };
}

export function validateQuery(body: CorrectRequestBody): ValidationResult<string> {
  const raw = body.query;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: { code: 'invalid_query', message: 'query обязан быть непустой строкой' } };
  }
  return { ok: true, value: raw };
}

/** Закрытое множество ИЗ ОДНОГО значения (DEC-A-023): `model`, `base`, `''` — все `422`. */
export function validateChoice(body: CorrectRequestBody): ValidationResult<'take_db'> {
  if (body.choice !== 'take_db') {
    return { ok: false, error: { code: 'unknown_choice', message: "choice обязан быть 'take_db'" } };
  }
  return { ok: true, value: 'take_db' };
}
