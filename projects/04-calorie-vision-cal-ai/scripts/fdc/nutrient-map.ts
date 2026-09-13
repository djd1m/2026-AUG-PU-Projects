// Соответствие идентификаторов нутриентов USDA FDC — четыре значения на 100 г
// (`ImportFdcDump` шаг 3). Номера — из реального словаря FDC (`nutrient.csv`,
// колонка `nutrient_nbr`/`id`): 1008 Energy (kcal), 1003 Protein (g),
// 1004 Total lipid (fat) (g), 1005 Carbohydrate, by difference (g).
//
// Читаются из САМОГО дампа (`nutrient.csv`), а не зашиваются числом: имя нутриента может
// быть локализовано или отличаться версией дампа, а численный `id` в `food_nutrient.csv`
// обязан совпасть со строкой `nutrient.csv` этого ЖЕ дампа.

export interface NutrientMap {
  readonly energyId: string;
  readonly proteinId: string;
  readonly fatId: string;
  readonly carbId: string;
}

const NAME_PATTERNS: Record<keyof NutrientMap, RegExp> = {
  energyId: /^energy$/i,
  proteinId: /^protein$/i,
  fatId: /^total lipid \(fat\)$/i,
  carbId: /^carbohydrate, by difference$/i,
};

export function buildNutrientMap(nutrientRows: ReadonlyArray<Record<string, string>>): NutrientMap {
  const found: Partial<Record<keyof NutrientMap, string>> = {};
  for (const row of nutrientRows) {
    const name = (row.name ?? '').trim();
    const id = (row.id ?? '').trim();
    if (id === '') continue;
    for (const key of Object.keys(NAME_PATTERNS) as Array<keyof NutrientMap>) {
      if (found[key] === undefined && NAME_PATTERNS[key].test(name)) found[key] = id;
    }
  }
  const missing = (Object.keys(NAME_PATTERNS) as Array<keyof NutrientMap>).filter((key) => found[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`nutrient.csv не содержит нужных нутриентов: ${missing.join(', ')}`);
  }
  return found as NutrientMap;
}
