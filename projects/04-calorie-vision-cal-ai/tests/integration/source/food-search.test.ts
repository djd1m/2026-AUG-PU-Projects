// `SearchFoodCandidates` на настоящем PostgreSQL (AC-source-and-correct-6/7).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { SeedSynonymRow } from '@n4/shared';
import { loadFoodSynonyms, searchFoodCandidates, AUTO_CANDIDATE_LIMIT } from '@n4/db';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';
import pg from 'pg';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));
const SEED_PATH = fileURLToPath(new URL('../../../packages/db/seed/food-synonym.ru.json', import.meta.url));
const SEED_ROWS: SeedSynonymRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

describe('searchFoodCandidates (AC-source-and-correct-6/7)', () => {
  it('AC-6: точное совпадение выигрывает у триграммного — вторая стратегия НЕ выполняется (счётчик обращений)', async () => {
    const pool = await migratedPool('n4-tests-food-search-1');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);
    // Дополнительный БЛИЗКИЙ, но НЕ точный синоним — второй стратегии есть что найти,
    // если первая (точная) не остановит поиск.
    const foodItem = await pool.query<{ id: string }>('SELECT id FROM food_item LIMIT 1');
    await pool.query(
      `INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, curated_by)
       VALUES ('гречка вареная с маслом', 'гречка вареная с маслом', $1, 'test')`,
      [foodItem.rows[0]?.id],
    );

    const querySpy = vi.spyOn(pg.Pool.prototype, 'query');
    const found = await searchFoodCandidates(pool, { query: 'гречка варёная', mode: 'auto' });
    // Ровно ОДИН запрос к базе: точное совпадение нашло результат, вторая стратегия
    // (триграммы) не выполняется вовсе.
    expect(querySpy).toHaveBeenCalledTimes(1);
    querySpy.mockRestore();

    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('item');
  }, 30_000);

  it('AC-7: порог 0,45 — опечатка находит совпадение, случайная строка — нет; не более 5 кандидатов', async () => {
    const pool = await migratedPool('n4-tests-food-search-2');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const typo = await searchFoodCandidates(pool, { query: 'гречк вареная', mode: 'auto' });
    expect(typo.length).toBeGreaterThan(0);

    const nonsense = await searchFoodCandidates(pool, { query: 'автомобильное колесо', mode: 'auto' });
    expect(nonsense).toHaveLength(0);

    const manual = await searchFoodCandidates(pool, { query: 'мясо', mode: 'manual' });
    expect(manual.length).toBeLessThanOrEqual(20);
    const auto = await searchFoodCandidates(pool, { query: 'мясо', mode: 'auto' });
    expect(auto.length).toBeLessThanOrEqual(AUTO_CANDIDATE_LIMIT);
  }, 30_000);

  it('пустой запрос — пустой список, а НЕ «любое совпадение»', async () => {
    const pool = await migratedPool('n4-tests-food-search-3');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);
    expect(await searchFoodCandidates(pool, { query: '   ', mode: 'auto' })).toEqual([]);
  }, 30_000);
});
