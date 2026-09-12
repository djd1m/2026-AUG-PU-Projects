// Единицы измерения канона. Брендированные типы: `Grams` и `Kcal` — разные вещи,
// и компилятор обязан это знать, иначе масса однажды сложится с калорийностью.

declare const unit: unique symbol;
type Unit<Tag extends string, Base> = Base & { readonly [unit]: Tag };

/** Масса в граммах, ЦЕЛОЕ. */
export type Grams = Unit<'grams', number>;
/** Энергия в килокалориях, ЦЕЛОЕ. */
export type Kcal = Unit<'kcal', number>;
/** Макронутриент в граммах, ОДИН знак после запятой. */
export type Macro = Unit<'macro', number>;
/** Уверенность модели, вещественное 0..1. */
export type Confidence = Unit<'confidence', number>;
/** Усечённый префикс адреса клиента. НЕ полный адрес — полного у нас нет нигде. */
export type IPPrefix = Unit<'ip-prefix', string>;

export function grams(value: number): Grams {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`масса обязана быть целым неотрицательным числом граммов, получено ${value}`);
  return value as Grams;
}

export function kcal(value: number): Kcal {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`энергия обязана быть целым неотрицательным числом ккал, получено ${value}`);
  return value as Kcal;
}

export function macro(value: number): Macro {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`макронутриент обязан быть неотрицательным числом граммов, получено ${value}`);
  return (Math.round(value * 10) / 10) as Macro;
}

/**
 * Уверенность обязана лежать в 0..1. Значение вне диапазона трактуется как ОТСУТСТВУЮЩЕЕ,
 * а не подрезается до границы: `confidence = 7`, подрезанное до 1, тихо стало бы «уверен»
 * и отменило эскалацию (`RecognizeScan` шаг 3а).
 */
export function confidence(value: number): Confidence {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`уверенность обязана лежать в 0..1, получено ${value}`);
  return value as Confidence;
}

export function ipPrefix(value: string): IPPrefix {
  if (value.trim() === '') throw new RangeError('префикс адреса не может быть пустым');
  return value as IPPrefix;
}
