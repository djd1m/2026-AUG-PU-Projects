// `buildNutrientMap` — RV-source-and-correct-02 (слепое ревью, 2026-09-13). Прежний код
// выбирал нутриент ПО ИМЕНИ, игнорируя единицу: «Energy» существует в дампе USDA FDC И в
// ккал (`1008`), И в кДж (`1062`), и порядок строк `nutrient.csv` не гарантирован.

import { describe, expect, it } from 'vitest';
import { buildNutrientMap } from '../../../scripts/fdc/nutrient-map.js';

function row(id: string, name: string, unit: string): Record<string, string> {
  return { id, name, unit_name: unit, nutrient_nbr: id, rank: '0' };
}

const VALID_ROWS = [row('1008', 'Energy', 'KCAL'), row('1003', 'Protein', 'G'), row('1004', 'Total lipid (fat)', 'G'), row('1005', 'Carbohydrate, by difference', 'G')];

describe('buildNutrientMap (RV-source-and-correct-02)', () => {
  it('выбирает energyId=1008 (KCAL), когда строка kJ (1062) идёт ПЕРЕД строкой kcal', () => {
    const rows = [row('1062', 'Energy', 'kJ'), ...VALID_ROWS];
    const map = buildNutrientMap(rows);
    expect(map.energyId).toBe('1008');
  });

  it('выбирает energyId=1008 (KCAL), когда строка kJ идёт ПОСЛЕ строки kcal', () => {
    const rows = [...VALID_ROWS, row('1062', 'Energy', 'kJ')];
    const map = buildNutrientMap(rows);
    expect(map.energyId).toBe('1008');
  });

  it('регистр единицы не влияет на выбор (KCAL/kcal/Kcal)', () => {
    const rows = [row('1008', 'Energy', 'Kcal'), row('1003', 'Protein', 'g'), row('1004', 'Total lipid (fat)', 'g'), row('1005', 'Carbohydrate, by difference', 'g')];
    const map = buildNutrientMap(rows);
    expect(map).toEqual({ energyId: '1008', proteinId: '1003', fatId: '1004', carbId: '1005' });
  });

  it('строка «Energy» БЕЗ единицы kcal (только kJ) — нутриент считается ОТСУТСТВУЮЩИМ, а не подставляется kJ-id', () => {
    const rows = [row('1062', 'Energy', 'kJ'), row('1003', 'Protein', 'G'), row('1004', 'Total lipid (fat)', 'G'), row('1005', 'Carbohydrate, by difference', 'G')];
    expect(() => buildNutrientMap(rows)).toThrow(/energyId/);
  });

  it('неоднозначность (ДВА разных id под один критерий имя+единица) — ОТКАЗ, а не первая строка по порядку файла', () => {
    // Гипотетический дефект дампа: два разных id обе названы «Energy» в ккал.
    const rows = [row('1008', 'Energy', 'KCAL'), row('9999', 'Energy', 'KCAL'), row('1003', 'Protein', 'G'), row('1004', 'Total lipid (fat)', 'G'), row('1005', 'Carbohydrate, by difference', 'G')];
    expect(() => buildNutrientMap(rows)).toThrow(/неоднозначен/);
  });

  it('повторная СТРОГО одинаковая строка (тот же id, то же имя, та же единица) не считается неоднозначностью', () => {
    const rows = [...VALID_ROWS, row('1008', 'Energy', 'KCAL')];
    expect(() => buildNutrientMap(rows)).not.toThrow();
  });

  it('отсутствие нужного нутриента (например, protein) даёт названную ошибку', () => {
    const rows = [row('1008', 'Energy', 'KCAL'), row('1004', 'Total lipid (fat)', 'G'), row('1005', 'Carbohydrate, by difference', 'G')];
    expect(() => buildNutrientMap(rows)).toThrow(/proteinId/);
  });
});
