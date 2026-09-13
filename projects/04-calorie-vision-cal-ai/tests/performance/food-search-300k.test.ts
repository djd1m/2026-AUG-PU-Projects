// NFR-source-and-correct-1 / AC-source-and-correct-25: поиск ≤ 200 мс p95 на 300 000
// синтетических строк `food_item` и 300 строк `food_synonym`. Прогон ДОЛГИЙ (вставка +
// 200 поисков) — отдельная команда, не часть обычного `npm test`.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { searchFoodCandidates } from '@n4/db';
import { migratedPool, truncateAll } from '../helpers/db.js';

const TOTAL_FOOD_ITEMS = 300_000;
const TOTAL_SYNONYMS = 300;
const BATCH_SIZE = 5_000;
const SEARCH_COUNT = 200;
const P95_BUDGET_MS = 200;

function randomName(seed: number): string {
  return `Synthetic food item number ${seed} variant ${seed % 97}`;
}

async function seedSyntheticFoodItems(pool: Awaited<ReturnType<typeof migratedPool>>): Promise<void> {
  for (let batchStart = 0; batchStart < TOTAL_FOOD_ITEMS; batchStart += BATCH_SIZE) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < BATCH_SIZE && batchStart + i < TOTAL_FOOD_ITEMS; i += 1) {
      const seed = batchStart + i;
      const base = params.length;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
      params.push(`synthetic-${seed}`, randomName(seed), 100 + (seed % 400), 5 + (seed % 20), 2 + (seed % 10), 10 + (seed % 50), '2026-04-01');
    }
    await pool.query(
      `INSERT INTO food_item (source_id, name_en, kcal_per_100g, protein_per_100g, fat_per_100g, carb_per_100g, import_snapshot_date)
       SELECT * FROM (VALUES ${values.join(',')}) AS v(source_id, name_en, kcal, protein, fat, carb, snapshot_date)`,
      params,
    );
  }

  const foodItems = await pool.query<{ id: string }>('SELECT id FROM food_item LIMIT $1', [TOTAL_SYNONYMS]);
  const synonymValues: string[] = [];
  const synonymParams: unknown[] = [];
  foodItems.rows.forEach((row, index) => {
    const base = synonymParams.length;
    synonymValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    synonymParams.push(`синоним ${index}`, `синоним ${index}`, row.id, 'perf-test');
  });
  if (synonymValues.length > 0) {
    await pool.query(
      `INSERT INTO food_synonym (name_ru, name_ru_normalized, food_item_id, curated_by) VALUES ${synonymValues.join(',')}`,
      synonymParams,
    );
  }
}

describe('NFR-source-and-correct-1 / AC-source-and-correct-25: поиск на 300 000 записей (integration, ДОЛГИЙ)', () => {
  it('p95 одного автоматического поиска ≤ 200 мс на синтетическом наполнении', async () => {
    const pool = await migratedPool('n4-tests-perf-food-search');
    await truncateAll(pool);
    await seedSyntheticFoodItems(pool);

    const durations: number[] = [];
    for (let i = 0; i < SEARCH_COUNT; i += 1) {
      // Каждый третий — заведомый промах (случайная строка), чтобы измерить и худший
      // случай (все три стратегии исчерпаны), а не только быстрый путь точного совпадения.
      const query = i % 3 === 0 ? `совершенно случайная строка ${randomUUID()}` : `синоним ${i % TOTAL_SYNONYMS}`;
      const start = performance.now();
      await searchFoodCandidates(pool, { query, mode: 'auto', modelCandidateSourceIds: [`synthetic-${i}`] });
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95 = durations[p95Index] ?? durations[durations.length - 1];
    // Число — ЛИТЕРАЛ теста (NFR-source-and-correct-1); прогон помечен integration и
    // выполняется на настоящем PostgreSQL, а не на моке.
    expect(p95, `p95=${p95}мс по ${durations.length} измерениям`).toBeLessThanOrEqual(P95_BUDGET_MS);
  }, 300_000);
});
