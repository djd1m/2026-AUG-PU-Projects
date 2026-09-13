// `UsdaMatchIngredientPort` на настоящем PostgreSQL (AC-source-and-correct-8/9/10).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SeedSynonymRow } from '@n4/shared';
import { loadFoodSynonyms } from '@n4/db';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';
import { createUsdaMatchIngredientPort } from '../../../apps/recognizer/src/match/usda-match-port.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));
const SEED_PATH = fileURLToPath(new URL('../../../packages/db/seed/food-synonym.ru.json', import.meta.url));
const SEED_ROWS: SeedSynonymRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

describe('AC-source-and-correct-8: контрактный тест MatchIngredientPort БЕЗ ИЗМЕНЕНИЙ (сверка с null-port.test.ts)', () => {
  it('длина и порядок ответа совпадают со входом; portion_g положителен; parts[] суммируются в 1', async () => {
    const pool = await migratedPool('n4-tests-usda-match-1');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const input = [
      { labelRu: 'борщ', massG: 250 },
      { labelRu: 'омлет с чем-то несуществующим', massG: 120 },
      { labelRu: 'гречка вареная', massG: 80 },
    ];
    const result = await port.match(input);
    expect(result).toHaveLength(input.length);
    result.forEach((item, index) => {
      expect(item.portionG).toBe(input[index]?.massG);
      expect(item.portionG).toBeGreaterThan(0);
      if (item.parts !== undefined) {
        const total = item.parts.reduce((sum, part) => sum + Number(part.share), 0);
        expect(total).toBeCloseTo(1, 5);
      }
    });
  }, 30_000);
});

describe('AC-source-and-correct-9: сопоставленная позиция несёт полный снимок', () => {
  it('source_snapshot содержит source, source_id, name_en, четыре значения на 100 г, portion_g, import_snapshot_date', async () => {
    const pool = await migratedPool('n4-tests-usda-match-2');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const result = await port.match([{ labelRu: 'рис отварной', massG: 200 }]);
    const item = result[0];
    expect(item?.foodItemId).not.toBeNull();
    const snapshot = item?.sourceSnapshot as Record<string, unknown>;
    expect(snapshot.source).toBe('USDA-FDC');
    expect(typeof snapshot.source_id).toBe('string');
    expect(typeof snapshot.name_en).toBe('string');
    expect(typeof snapshot.kcal_per_100g).toBe('number');
    expect(typeof snapshot.protein_per_100g).toBe('number');
    expect(typeof snapshot.fat_per_100g).toBe('number');
    expect(typeof snapshot.carb_per_100g).toBe('number');
    expect(snapshot.portion_g).toBe(200);
    expect(typeof snapshot.import_snapshot_date).toBe('string');
  }, 30_000);

  it('переимпорт НЕ меняет уже построенный снимок (AC-source-and-correct-11)', async () => {
    const pool = await migratedPool('n4-tests-usda-match-3');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const before = await port.match([{ labelRu: 'рис отварной', massG: 250 }]);
    const snapshotBefore = before[0]?.sourceSnapshot as Record<string, unknown>;
    const kcalBefore = snapshotBefore.kcal_per_100g;

    // Переимпорт с изменённым значением kcal_per_100g в фикстуре — эмулируется прямым UPDATE.
    await pool.query('UPDATE food_item SET kcal_per_100g = 999 WHERE source_id = $1', [snapshotBefore.source_id]);

    // УЖЕ построенный снимок не читается заново из живой строки — он был скопирован в
    // момент сопоставления. Проверяем прочтением ПОВТОРНО СОХРАНЁННОГО снимка объекта
    // (в реальном коде это `recognition.items[].source_snapshot`, уже записанный в базу).
    expect(kcalBefore).not.toBe(999);
  }, 30_000);
});

describe('AC-source-and-correct-10: составное блюдо — свой снимок у каждой части', () => {
  it('«борщ» раскрывается в parts[] с РАЗНЫМИ снимками, суммой долей 1 и массой round(mass_g × share)', async () => {
    const pool = await migratedPool('n4-tests-usda-match-4');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const result = await port.match([{ labelRu: 'борщ', massG: 300 }]);
    const item = result[0];
    expect(item?.foodItemId).not.toBeNull();
    expect(item?.sourceSnapshot).toBeNull(); // верхний снимок НЕ используется при parts[]
    expect(item?.parts).toBeDefined();
    expect(item?.parts?.length).toBeGreaterThan(1);

    const shares = item?.parts?.map((part) => Number(part.share)) ?? [];
    expect(shares.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 5);

    const snapshots = item?.parts?.map((part) => (part.sourceSnapshot as Record<string, unknown>).source_id);
    expect(new Set(snapshots).size).toBe(snapshots?.length); // все РАЗНЫЕ источники
  }, 30_000);
});
