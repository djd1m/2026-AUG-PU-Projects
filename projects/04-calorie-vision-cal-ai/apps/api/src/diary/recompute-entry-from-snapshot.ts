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
//
// Правка RV-diary-and-streak-01 (review-report.md): составное блюдо (`match/port.ts`,
// `MatchedItem.parts[]`) несёт числа НЕ в верхнем `source_snapshot` позиции — тот часто
// placeholder БЕЗ питательных полей вовсе («верхний уровень — снимок НЕ используется, если есть
// parts», `composite-parts.test.ts`) — а в `items[i].parts[].sourceSnapshot`, СВОЁМ на каждую
// часть, с долей массы `share`. Прежняя реализация читала только верхний снимок и получала НОЛЬ
// калорий на составном блюде вместо суммы по частям. Одновременно `readNumber` подменяла ЛЮБОЙ
// отсутствующий нутриент нулём — тот же класс дефекта, что `.claude/rules/fail-closed-defaults.md`
// запрещает для конфигурации: отсутствующее ЧИТАЛОСЬ КАК ИЗМЕРЕННЫЙ НОЛЬ. Теперь снимок, в
// котором нет хотя бы одного из четырёх полей, ЯВНО отклоняется (`readMeasuredNumber` возвращает
// `null`), и позиция/составное блюдо целиком ИСКЛЮЧАЕТСЯ из итога — тот же принцип, что уже
// применялся к `unmatched` (частичное число составного блюда выглядело бы измеренным и было бы
// неверным; честнее не посчитать вовсе, чем посчитать неверно).

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

/** Для полей, где отсутствие значения безопасно трактовать как ноль (например, текущая масса позиции). */
function readNumberOrZero(item: RawItem | null | undefined, ...keys: string[]): number {
  if (item === null || item === undefined) return 0;
  const value = readField(item, ...keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Для полей, где отсутствие значения ОБЯЗАНО быть отличимо от измеренного нуля (нутриенты на
 * 100 г, доля части составного блюда): `null` — не измерено, а не 0.
 */
function readMeasuredNumber(item: RawItem | null | undefined, ...keys: string[]): number | null {
  if (item === null || item === undefined) return null;
  const value = readField(item, ...keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isItemUnmatched(item: RawItem): boolean {
  return readField(item, 'unmatched') === true;
}

export function itemMassG(item: RawItem): number {
  return readNumberOrZero(item, 'mass_g', 'massG');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Части составного блюда (`match/port.ts`, `MatchedItem.parts[]`); `null`, если блюдо простое. */
function itemParts(item: RawItem): readonly RawItem[] | null {
  const raw = item['parts'];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as RawItem[];
}

/**
 * Числа по ОДНОМУ снимку. `null` в ДВУХ случаях, трактуемых ОДИНАКОВО — «не измерено»: снимка
 * нет вовсе (позиция не сопоставлена базе), ЛИБО снимок есть, но не хватает хотя бы одного из
 * четырёх полей (RV-diary-and-streak-01 — раньше такой снимок молча давал 0, а не отказ).
 */
export function numbersFromSnapshot(massG: number, snapshot: RawItem | null | undefined): ItemNumbers | null {
  if (snapshot === null || snapshot === undefined) return null;
  const kcalPer100g = readMeasuredNumber(snapshot, 'kcal_per_100g', 'kcalPer100g');
  const proteinPer100g = readMeasuredNumber(snapshot, 'protein_per_100g', 'proteinPer100g');
  const fatPer100g = readMeasuredNumber(snapshot, 'fat_per_100g', 'fatPer100g');
  const carbPer100g = readMeasuredNumber(snapshot, 'carb_per_100g', 'carbPer100g');
  if (kcalPer100g === null || proteinPer100g === null || fatPer100g === null || carbPer100g === null) {
    return null; // снимок неполон — отклоняем ЯВНО, а не подставляем 0 за отсутствующий нутриент
  }
  const ratio = massG / 100;
  return {
    kcal: Math.round(ratio * kcalPer100g),
    protein: round1(ratio * proteinPer100g),
    fat: round1(ratio * fatPer100g),
    carb: round1(ratio * carbPer100g),
  };
}

function sumItemNumbers(a: ItemNumbers, b: ItemNumbers): ItemNumbers {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carb: a.carb + b.carb };
}

/**
 * Числа по СОСТАВНОМУ блюду: сумма по частям, у КАЖДОЙ — свой `sourceSnapshot` и доля массы
 * `share` (масса части = масса позиции × `share`). Верхний `source_snapshot` позиции НЕ
 * используется вовсе, как и задокументировано у источника `parts[]`
 * (`composite-parts.test.ts`: «верхний уровень — снимок НЕ используется, если есть parts»).
 * Неполный снимок ИЛИ отсутствующая доля ЛЮБОЙ части исключает ВСЮ позицию из итога — частичная
 * сумма составного блюда выглядела бы измеренной и была бы неверной.
 */
function numbersFromParts(massG: number, parts: readonly RawItem[]): ItemNumbers | null {
  let totals: ItemNumbers = { kcal: 0, protein: 0, fat: 0, carb: 0 };
  for (const part of parts) {
    const share = readMeasuredNumber(part, 'share');
    if (share === null) return null;
    const snapshot = (readField(part, 'sourceSnapshot', 'source_snapshot') as RawItem | null | undefined) ?? null;
    const partNumbers = numbersFromSnapshot(massG * share, snapshot);
    if (partNumbers === null) return null;
    totals = sumItemNumbers(totals, partNumbers);
  }
  return { kcal: Math.round(totals.kcal), protein: round1(totals.protein), fat: round1(totals.fat), carb: round1(totals.carb) };
}

/** Числа по ОДНОЙ позиции: по частям, если это составное блюдо, иначе по единственному снимку. */
export function numbersForItem(item: RawItem, massG: number, snapshot: RawItem | null | undefined): ItemNumbers | null {
  const parts = itemParts(item);
  if (parts !== null) return numbersFromParts(massG, parts);
  return numbersFromSnapshot(massG, snapshot);
}

/** Копия позиции с новой массой и пересчитанными числами (по частям либо по снимку); прочие поля не тронуты. */
export function applyMassToItem(item: RawItem, massG: number, snapshot: RawItem | null): RawItem {
  const numbers = numbersForItem(item, massG, snapshot) ?? { kcal: 0, protein: 0, fat: 0, carb: 0 };
  return { ...item, mass_g: massG, kcal: numbers.kcal, protein: numbers.protein, fat: numbers.fat, carb: numbers.carb };
}

/**
 * Сумма по ВСЕМ позициям записи из их текущей массы и параллельного массива снимков.
 * `unmatched`, а также позиции с неполным снимком (или неполной частью составного блюда)
 * исключены (`.claude/rules/coding-style.md` и `fail-closed-defaults.md`: «неизвестное не
 * заменяется нулём... исключается из итога» — ноль не подставляется вместо значения, позиция
 * просто не участвует).
 */
export function recomputeEntryTotals(items: readonly RawItem[], snapshots: ReadonlyArray<RawItem | null>): ItemNumbers {
  let kcal = 0;
  let protein = 0;
  let fat = 0;
  let carb = 0;
  items.forEach((item, index) => {
    if (isItemUnmatched(item)) return;
    const numbers = numbersForItem(item, itemMassG(item), snapshots[index] ?? null);
    if (numbers === null) return; // снимок(и) неполон — позиция исключена из итога, а не ноль
    kcal += numbers.kcal;
    protein += numbers.protein;
    fat += numbers.fat;
    carb += numbers.carb;
  });
  return { kcal, protein: round1(protein), fat: round1(fat), carb: round1(carb) };
}
