#!/usr/bin/env tsx
// `ImportFdcDump` (`02_pseudocode.md`, FR-source-and-correct-1, AC-source-and-correct-1/2).
//
// Скрипт принимает КАТАЛОГ с распакованными дампами, не URL: скачивание — отдельный шаг
// оператора (`docs/operations/import-fdc.md`), делать сборку зависимой от доступности
// чужого сервиса незачем. Идемпотентен: `UNIQUE (source, source_id)` + `ON CONFLICT DO
// UPDATE`, `id` уже существующих строк не меняется — на него ссылаются `food_synonym` и
// снимки в `recognition`.

import type { DbPool } from '@n4/db';
import { createPool, withTransaction } from '@n4/db';
import { requireFile, streamCsvRows } from './fdc/parse-csv.js';
import { buildNutrientMap, type NutrientMap } from './fdc/nutrient-map.js';

export interface ImportReport {
  readonly accepted: number;
  readonly rejected: ReadonlyArray<{ fdcId: string; reason: string }>;
  readonly snapshotDate: string;
  readonly totalInTable: number;
}

const REQUIRED_FILES = ['food.csv', 'food_nutrient.csv', 'nutrient.csv', 'food_portion.csv'];
const BATCH_SIZE = 1000;

function parseSnapshotDate(raw: string | undefined): string {
  // Шаг 2: подстановка «сегодня» ЗАПРЕЩЕНА — снимок описывает ДАННЫЕ, а не момент заливки.
  if (raw === undefined || raw.trim() === '') {
    throw new Error('--snapshot-date обязателен: снимок описывает данные, а не момент запуска импорта');
  }
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error(`--snapshot-date не разбирается как дата (ожидается YYYY-MM-DD): ${raw}`);
  }
  return trimmed;
}

async function buildNutrientsByFdc(directory: string, map: NutrientMap): Promise<Map<string, { kcal?: number; protein?: number; fat?: number; carb?: number }>> {
  const result = new Map<string, { kcal?: number; protein?: number; fat?: number; carb?: number }>();
  for await (const row of streamCsvRows(requireFile(directory, 'food_nutrient.csv'))) {
    const fdcId = row.fdc_id;
    const nutrientId = row.nutrient_id;
    const amount = Number.parseFloat(row.amount ?? '');
    if (fdcId === undefined || nutrientId === undefined || Number.isNaN(amount)) continue;
    const entry = result.get(fdcId) ?? {};
    if (nutrientId === map.energyId) entry.kcal = amount;
    else if (nutrientId === map.proteinId) entry.protein = amount;
    else if (nutrientId === map.fatId) entry.fat = amount;
    else if (nutrientId === map.carbId) entry.carb = amount;
    result.set(fdcId, entry);
  }
  return result;
}

async function buildPortionByFdc(directory: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for await (const row of streamCsvRows(requireFile(directory, 'food_portion.csv'))) {
    const fdcId = row.fdc_id;
    const gramWeight = Number.parseFloat(row.gram_weight ?? '');
    if (fdcId === undefined || Number.isNaN(gramWeight) || gramWeight <= 0) continue;
    // Первая встреченная порция этой записи — FNDDS упорядочивает `seq_num` от 1.
    //
    // ОКРУГЛЕНИЕ ЗДЕСЬ, а не в базе: `food_item.default_portion_g` объявлен `integer`
    // (миграция 001), а USDA отдаёт дробные граммы — «28.35» у унции встречается в SR
    // Legacy буквально. Без округления импорт падал на первой же такой строке с
    // «invalid input syntax for type integer» и НЕ импортировал ничего (проверено на
    // настоящем дампе 2026-09-13). Порция — подсказка размера, а не измерение: доли
    // грамма в ней не несут смысла, который стоил бы смены типа колонки.
    if (!result.has(fdcId)) result.set(fdcId, Math.max(1, Math.round(gramWeight)));
  }
  return result;
}

const UPSERT_FOOD_ITEM = `
  INSERT INTO food_item (source, source_id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g, default_portion_g, import_snapshot_date)
  VALUES ('USDA-FDC', $1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (source, source_id) DO UPDATE SET
    name_en = EXCLUDED.name_en,
    kcal_per_100g = EXCLUDED.kcal_per_100g,
    protein_per_100g = EXCLUDED.protein_per_100g,
    fat_per_100g = EXCLUDED.fat_per_100g,
    carb_per_100g = EXCLUDED.carb_per_100g,
    default_portion_g = EXCLUDED.default_portion_g,
    import_snapshot_date = EXCLUDED.import_snapshot_date
`;

export async function importFdcDump(pool: DbPool, directory: string, snapshotDateRaw: string | undefined): Promise<ImportReport> {
  // Шаг 1: каталог и все четыре файла обязаны существовать.
  for (const file of REQUIRED_FILES) requireFile(directory, file);
  const snapshotDate = parseSnapshotDate(snapshotDateRaw);

  const nutrientRows: Array<Record<string, string>> = [];
  for await (const row of streamCsvRows(requireFile(directory, 'nutrient.csv'))) nutrientRows.push(row);
  const nutrientMap = buildNutrientMap(nutrientRows);

  const nutrientsByFdc = await buildNutrientsByFdc(directory, nutrientMap);
  const portionByFdc = await buildPortionByFdc(directory);

  const rejected: Array<{ fdcId: string; reason: string }> = [];
  let accepted = 0;
  let batch: Array<[string, string, number, number, number, number, number | null, string]> = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const toInsert = batch;
    batch = [];
    await withTransaction(pool, async (client) => {
      for (const row of toInsert) await client.query(UPSERT_FOOD_ITEM, row);
    });
  };

  for await (const row of streamCsvRows(requireFile(directory, 'food.csv'))) {
    const fdcId = row.fdc_id;
    const description = row.description;
    if (fdcId === undefined || description === undefined) {
      rejected.push({ fdcId: fdcId ?? 'unknown', reason: 'missing_fdc_id_or_description' });
      continue;
    }
    const nutrients = nutrientsByFdc.get(fdcId);
    // Шаг 4.1: отсутствует ХОТЯ БЫ одно из четырёх значений — строка ОТВЕРГАЕТСЯ. Ноль не
    // подставляется: строка с нулём неотличима от настоящего нулевого продукта.
    if (nutrients === undefined || nutrients.kcal === undefined || nutrients.protein === undefined || nutrients.fat === undefined || nutrients.carb === undefined) {
      const missingField = nutrients === undefined
        ? 'all'
        : (['kcal', 'protein', 'fat', 'carb'] as const).find((key) => nutrients[key] === undefined) ?? 'unknown';
      rejected.push({ fdcId, reason: `missing_nutrient:${missingField}` });
      continue;
    }
    // Шаг 4.2: отсутствующая порция FNDDS — NULL, а не «100 г по умолчанию».
    const defaultPortionG = portionByFdc.get(fdcId) ?? null;

    batch.push([fdcId, description, Math.round(nutrients.kcal), nutrients.protein, nutrients.fat, nutrients.carb, defaultPortionG, snapshotDate]);
    accepted += 1;
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  const totalResult = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM food_item WHERE source = 'USDA-FDC'`);
  const totalInTable = Number.parseInt(totalResult.rows[0]?.count ?? '0', 10);

  return { accepted, rejected, snapshotDate, totalInTable };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const directory = args.find((arg) => !arg.startsWith('--'));
  const snapshotDateArg = args.find((arg) => arg.startsWith('--snapshot-date'));
  const snapshotDate = snapshotDateArg?.includes('=') ? snapshotDateArg.split('=')[1] : args[args.indexOf('--snapshot-date') + 1];

  if (directory === undefined) {
    console.error('использование: npm run import:fdc -- <каталог с дампами> --snapshot-date YYYY-MM-DD');
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('DATABASE_URL не задан: импорт не может писать в базу');
    process.exitCode = 1;
    return;
  }
  const pool = createPool({ databaseUrl, applicationName: 'n4-import-fdc' });
  try {
    const report = await importFdcDump(pool, directory, snapshotDate);
    console.log(`импорт завершён: принято ${report.accepted}, отвергнуто ${report.rejected.length}, снимок ${report.snapshotDate}, в таблице ${report.totalInTable}`);
    if (report.rejected.length > 0) {
      console.log('отвергнутые записи:');
      for (const item of report.rejected) console.log(`  ${item.fdcId}: ${item.reason}`);
    }
  } catch (error) {
    console.error(`импорт остановлен: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// ESM-эквивалент `require.main === module`: скрипт запущен напрямую, а не импортирован
// тестом (`importFdcDump` экспортирована отдельно именно для интеграционных тестов).
if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], 'file://').href) {
  void main();
}
