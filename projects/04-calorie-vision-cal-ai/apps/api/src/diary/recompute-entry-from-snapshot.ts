// Пересчёт чисел позиции и записи по ХРАНИМОМУ `source_snapshot` (FR-diary-and-streak-2,
// FR-diary-and-streak-3). Формула — `(масса_г/100) × значение_на_100г` из снимка
// (`.claude/rules/coding-style.md`, «Числа и источник»); живая таблица `food_item` не читается
// НИКОГДА — этот модуль получает снимок готовым аргументом, а не ходит за ним сам.
//
// `diary_entry.items` хранит копию `recognition.items[]` (`source-and-correct`, `RecognizedItem`,
// поля `snake_case`: `mass_g`, `unmatched`, `food_item_id`, `source_snapshot`); ключи читаются с
// лёгким запасом на `camelCase` — тем же самым, каким `routes/scans.ts` уже защищается от разницы
// форматов между версиями конвейера распознавания.
//
// `diary_entry.source_snapshot` хранит ПАРАЛЛЕЛЬНЫЙ массив снимков `Snapshot | null` по индексу
// позиции — отдельно от `items`, потому что именно эта колонка (а не `items`) является источником
// математики `set_portion`; позиция, помеченная `unmatched`, снимка не имеет (`null`) и в итог не
// входит (`unmatched` исключена из суммы — тот же принцип, что и в исходном распознавании).

export type RawItem = Record<string, unknown>;

export interface ItemNumbers {
  readonly kcal: number;
  readonly protein: number;
  readonly fat: number;
  readonly carb: number;
}

function readField(item: RawItem, ...keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }
  return undefined;
}

function readNumber(item: RawItem | null | undefined, ...keys: string[]): number {
  if (item === null || item === undefined) return 0;
  const value = readField(item, ...keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function isItemUnmatched(item: RawItem): boolean {
  return readField(item, 'unmatched') === true;
}

export function itemMassG(item: RawItem): number {
  return readNumber(item, 'mass_g', 'massG');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Позиция без снимка (не сопоставлена базе) даёт нулевые числа — она и так исключена из итога. */
export function numbersFromSnapshot(massG: number, snapshot: RawItem | null | undefined): ItemNumbers {
  if (snapshot === null || snapshot === undefined) return { kcal: 0, protein: 0, fat: 0, carb: 0 };
  const ratio = massG / 100;
  const kcalPer100g = readNumber(snapshot, 'kcal_per_100g', 'kcalPer100g');
  const proteinPer100g = readNumber(snapshot, 'protein_per_100g', 'proteinPer100g');
  const fatPer100g = readNumber(snapshot, 'fat_per_100g', 'fatPer100g');
  const carbPer100g = readNumber(snapshot, 'carb_per_100g', 'carbPer100g');
  return {
    kcal: Math.round(ratio * kcalPer100g),
    protein: round1(ratio * proteinPer100g),
    fat: round1(ratio * fatPer100g),
    carb: round1(ratio * carbPer100g),
  };
}

/** Копия позиции с новой массой и пересчитанными по СНИМКУ числами; прочие поля не тронуты. */
export function applyMassToItem(item: RawItem, massG: number, snapshot: RawItem | null): RawItem {
  const numbers = numbersFromSnapshot(massG, snapshot);
  return { ...item, mass_g: massG, kcal: numbers.kcal, protein: numbers.protein, fat: numbers.fat, carb: numbers.carb };
}

/**
 * Сумма по ВСЕМ позициям записи из их текущей массы и параллельного массива снимков.
 * `unmatched` позиции исключены (`.claude/rules/coding-style.md`: «Неизвестное не заменяется
 * нулём... исключается из итога» — здесь ноль не подставляется вместо значения, позиция просто
 * не участвует).
 */
export function recomputeEntryTotals(items: readonly RawItem[], snapshots: ReadonlyArray<RawItem | null>): ItemNumbers {
  let kcal = 0;
  let protein = 0;
  let fat = 0;
  let carb = 0;
  items.forEach((item, index) => {
    if (isItemUnmatched(item)) return;
    const numbers = numbersFromSnapshot(itemMassG(item), snapshots[index] ?? null);
    kcal += numbers.kcal;
    protein += numbers.protein;
    fat += numbers.fat;
    carb += numbers.carb;
  });
  return { kcal, protein: round1(protein), fat: round1(fat), carb: round1(carb) };
}
