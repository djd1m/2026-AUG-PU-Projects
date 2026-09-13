// Соответствие идентификаторов нутриентов USDA FDC — четыре значения на 100 г
// (`ImportFdcDump` шаг 3). Номера — из реального словаря FDC (`nutrient.csv`,
// колонка `nutrient_nbr`/`id`): 1008 Energy (kcal), 1003 Protein (g),
// 1004 Total lipid (fat) (g), 1005 Carbohydrate, by difference (g).
//
// Читаются из САМОГО дампа (`nutrient.csv`), а не зашиваются числом: имя нутриента может
// быть локализовано или отличаться версией дампа, а численный `id` в `food_nutrient.csv`
// обязан совпасть со строкой `nutrient.csv` этого ЖЕ дампа.
//
// RV-source-and-correct-02 (слепое ревью, 2026-09-13): выбор ТОЛЬКО по имени `Energy`
// молча путает единицу. USDA FDC несёт «Energy» в ДВУХ единицах — `1008/KCAL` и
// `1062/KJ` — и порядок строк в `nutrient.csv` НЕ гарантирован: если `1062/Energy/kJ`
// стоит выше `1008/Energy/kcal`, прежний код брал первое совпадение по имени и записывал
// килоджоули как килокалории — молчаливая порча ВСЕЙ базы чисел, ради которой фича
// существует. Единица теперь ЧАСТЬ критерия выбора, а не игнорируется.

export interface NutrientMap {
  readonly energyId: string;
  readonly proteinId: string;
  readonly fatId: string;
  readonly carbId: string;
}

interface NutrientCriterion {
  readonly namePattern: RegExp;
  readonly unitPattern: RegExp;
}

// Единица — тоже часть критерия: «Energy» существует в дампе И в ккал (нужная нам), И в
// кДж (`1062`) — опознаются ПО ИМЕНИ одинаково, но это РАЗНЫЕ величины. Белки/жиры/
// углеводы FDC несёт в граммах (`G`); строка с тем же именем в миллиграммах или иной
// единице — другой нутриент, а не тот же с опечаткой в дампе.
const CRITERIA: Record<keyof NutrientMap, NutrientCriterion> = {
  energyId: { namePattern: /^energy$/i, unitPattern: /^kcal$/i },
  proteinId: { namePattern: /^protein$/i, unitPattern: /^g$/i },
  fatId: { namePattern: /^total lipid \(fat\)$/i, unitPattern: /^g$/i },
  carbId: { namePattern: /^carbohydrate, by difference$/i, unitPattern: /^g$/i },
};

export function buildNutrientMap(nutrientRows: ReadonlyArray<Record<string, string>>): NutrientMap {
  // Все строки, подошедшие под критерий каждого нутриента (имя И единица) — не только
  // первая: неоднозначность (два РАЗНЫХ id под один критерий) обязана быть ОТКАЗОМ, а не
  // тихим выбором первой попавшейся строки в порядке файла.
  const matches: Record<keyof NutrientMap, string[]> = { energyId: [], proteinId: [], fatId: [], carbId: [] };

  for (const row of nutrientRows) {
    const name = (row.name ?? '').trim();
    const unit = (row.unit_name ?? '').trim();
    const id = (row.id ?? '').trim();
    if (id === '') continue;
    for (const key of Object.keys(CRITERIA) as Array<keyof NutrientMap>) {
      const criterion = CRITERIA[key];
      if (criterion.namePattern.test(name) && criterion.unitPattern.test(unit) && !matches[key].includes(id)) {
        matches[key].push(id);
      }
    }
  }

  const missing = (Object.keys(CRITERIA) as Array<keyof NutrientMap>).filter((key) => matches[key].length === 0);
  if (missing.length > 0) {
    throw new Error(`nutrient.csv не содержит нужных нутриентов (имя + единица): ${missing.join(', ')}`);
  }
  const ambiguous = (Object.keys(CRITERIA) as Array<keyof NutrientMap>).filter((key) => matches[key].length > 1);
  if (ambiguous.length > 0) {
    const detail = ambiguous.map((key) => `${key}: ${matches[key].join(', ')}`).join('; ');
    throw new Error(`nutrient.csv неоднозначен — несколько разных id подошли под один нутриент (имя+единица): ${detail}`);
  }

  const result: Partial<Record<keyof NutrientMap, string>> = {};
  for (const key of Object.keys(CRITERIA) as Array<keyof NutrientMap>) {
    result[key] = matches[key][0];
  }
  return result as NutrientMap;
}
