// Страж seed RU-курации (DEC-A-064, 2026-09-29): каждый `food_item_source_id` обязан указывать на
// позицию USDA FDC, чьё `name_en` содержит ожидаемые английские слова `expect_en`.
//
// Чем заслужено. На стенде «яйцо вареное» показывало калории «Butter, salted» (173410), «мёд» —
// «Buckwheat» (170286), «гречка вареная» — «Oats» (169705): 82 строки из 153 указывали не туда.
// Причина — фикстура `tests/fixtures/fdc/food.csv` была СОЧИНЕНА: настоящим id приписаны
// выдуманные названия («173410 = Egg, hard-boiled»), и seed сверялся с ней. Интеграционные тесты
// были зелёными, потому что фикстура и seed лгали согласованно.
//
// Поэтому здесь ДВЕ проверки, и вторая не менее важна первой:
//   1. seed ↔ фикстура: `name_en` каждой позиции содержит `expect_en` (слой 1, всегда);
//   2. фикстура ↔ настоящий дамп FDC: названия в фикстуре совпадают с дампом (только при
//      `FDC_DUMP_DIR`; без дампа ПРОПУСК объявлен, а не выдан за зелёный — см. 05_completion.md).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import type { SeedSynonymRow } from '@n4/shared';
import { findDuplicateNormalizedNames } from '@n4/db';

const SEED_PATH = fileURLToPath(new URL('../../packages/db/seed/food-synonym.ru.json', import.meta.url));
const FIXTURE_FOOD = fileURLToPath(new URL('../fixtures/fdc/food.csv', import.meta.url));
/** Синтетические строки фикстуры (нет нутриента, нет порции) — в настоящем дампе их нет намеренно. */
const SYNTHETIC_ID_FROM = 999_000;

const SEED_ROWS: SeedSynonymRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

function readFoodNames(path: string): Map<string, string> {
  const records = parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true }) as Array<Record<string, string>>;
  return new Map(records.map((r) => [r.fdc_id as string, r.description as string]));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Каждое слово `expect_en` (через `;`) обязано стоять в `name_en` ЦЕЛЫМ словом: «Egg» ≠ «Eggplant». */
function keywordMismatch(expectEn: string | undefined, nameEn: string | undefined): string | null {
  if (expectEn === undefined || expectEn.trim() === '') return 'expect_en пуст — без ожидания страж не страж';
  if (nameEn === undefined) return 'id нет в фикстуре FDC';
  const keywords = expectEn.split(';').map((k) => k.trim()).filter((k) => k.length > 0);
  if (keywords.length === 0) return 'expect_en без слов';
  for (const keyword of keywords) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(keyword)}(?![A-Za-z])`, 'i');
    if (!re.test(nameEn)) return `«${nameEn}» не содержит «${keyword}»`;
  }
  return null;
}

/** Все несоответствия seed ↔ названия FDC; пустой список — страж зелёный. */
function seedMismatches(rows: readonly SeedSynonymRow[], names: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (row.recipe_parts !== undefined) {
      row.recipe_parts.forEach((part, index) => {
        const problem = keywordMismatch(part.expect_en, names.get(part.food_item_source_id));
        if (problem !== null) problems.push(`${row.name_ru} [часть ${index + 1}, ${part.food_item_source_id}]: ${problem}`);
      });
      continue;
    }
    const id = row.food_item_source_id;
    const problem = id === undefined ? 'нет food_item_source_id' : keywordMismatch(row.expect_en, names.get(id));
    if (problem !== null) problems.push(`${row.name_ru} [${id}]: ${problem}`);
  }
  return problems;
}

describe('seed food_synonym ↔ USDA FDC (DEC-A-064)', () => {
  const names = readFoodNames(FIXTURE_FOOD);

  it('seed не пуст и каждая строка несёт expect_en (у составных — каждая часть)', () => {
    expect(SEED_ROWS.length).toBe(153);
    const withoutExpectation = SEED_ROWS.flatMap((row) =>
      row.recipe_parts !== undefined
        ? row.recipe_parts.filter((p) => !p.expect_en?.trim()).map(() => row.name_ru)
        : row.expect_en?.trim() ? [] : [row.name_ru],
    );
    expect(withoutExpectation).toEqual([]);
  });

  it('КАЖДЫЙ food_item_source_id указывает на позицию с ожидаемым name_en', () => {
    expect(seedMismatches(SEED_ROWS, names)).toEqual([]);
  });

  it('в seed нет дублей name_ru_normalized — поиск вернул бы две записи на одно слово', () => {
    expect(findDuplicateNormalizedNames(SEED_ROWS)).toEqual([]);
  });

  // Испытание стража ВНУТРИ набора (guard-must-be-able-to-fail.md): дефект стенда 29.09 и пустое
  // ожидание обязаны давать красный. Если эти ожидания зеленеют — страж ослеп.
  it('ИСПЫТАНИЕ: «яйцо вареное» → 173410 (Butter, salted) красит страж', () => {
    const mutated = SEED_ROWS.map((row) => (row.name_ru === 'яйцо вареное' ? { ...row, food_item_source_id: '173410' } : row));
    const problems = seedMismatches(mutated, names);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/яйцо вареное \[173410\].*Butter, salted.*Egg/);
  });

  it('ИСПЫТАНИЕ: пустой и отсутствующий expect_en — красный, а не «ожиданий нет — всё верно»', () => {
    expect(keywordMismatch('', 'Honey')).not.toBeNull();
    expect(keywordMismatch('  ', 'Honey')).not.toBeNull();
    expect(keywordMismatch(undefined, 'Honey')).not.toBeNull();
    expect(keywordMismatch(' ; ', 'Honey')).not.toBeNull();
    expect(keywordMismatch('Honey', undefined)).not.toBeNull();
    expect(keywordMismatch('Egg', 'Eggplant, raw')).not.toBeNull(); // целым словом, не подстрокой
    expect(keywordMismatch('Egg; hard-boiled', 'Egg, whole, cooked, hard-boiled')).toBeNull();
  });

  it('ИСПЫТАНИЕ: дубль name_ru_normalized («мёд» рядом с «мед») находится', () => {
    const withDuplicate = [...SEED_ROWS, { name_ru: 'мёд', food_item_source_id: '169640', expect_en: 'Honey', curated_by: 'test' }];
    expect(findDuplicateNormalizedNames(withDuplicate)).toEqual(['мед']);
  });

  // Вторая половина: фикстура обязана быть ВЫБОРКОЙ настоящего дампа, а не сочинением. Дамп —
  // 8 МБ чужих данных, в репозиторий не кладётся; путь даётся переменной окружения.
  const dumpDir = process.env.FDC_DUMP_DIR;
  it.skipIf(dumpDir === undefined || dumpDir.trim() === '')('фикстура FDC совпадает с настоящим дампом по fdc_id → description (FDC_DUMP_DIR)', () => {
    const dumpFood = `${(dumpDir as string).replace(/\/$/, '')}/food.csv`;
    // Переменная задана, а файла нет — это ОТКАЗ, а не пропуск: проверку просили и она не выполнена.
    expect(existsSync(dumpFood), `FDC_DUMP_DIR задан, но ${dumpFood} не найден`).toBe(true);
    const real = readFoodNames(dumpFood);
    const diverged: string[] = [];
    for (const [id, description] of names) {
      if (Number(id) >= SYNTHETIC_ID_FROM) continue;
      if (real.get(id) !== description) diverged.push(`${id}: фикстура «${description}», дамп «${real.get(id) ?? 'НЕТ'}»`);
    }
    expect(diverged).toEqual([]);
  });
});
