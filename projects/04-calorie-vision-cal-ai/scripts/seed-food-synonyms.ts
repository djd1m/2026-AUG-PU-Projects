#!/usr/bin/env tsx
// CLI-обёртка `loadFoodSynonyms` (`packages/db/src/seed/load-food-synonyms.ts`) —
// применяет `packages/db/seed/food-synonym.ru.json` к базе, на которую указывает
// `DATABASE_URL`. Требует, чтобы `food_item` уже был наполнен импортом (`npm run import:fdc`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SeedSynonymRow } from '@n4/shared';
import { createPool, loadFoodSynonyms } from '@n4/db';

const SEED_PATH = fileURLToPath(new URL('../packages/db/seed/food-synonym.ru.json', import.meta.url));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('DATABASE_URL не задан: загрузка seed не может писать в базу');
    process.exitCode = 1;
    return;
  }
  const rows = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedSynonymRow[];
  const pool = createPool({ databaseUrl, applicationName: 'n4-seed-food-synonyms' });
  try {
    const result = await loadFoodSynonyms(pool, rows);
    if (result.rejected.length > 0) {
      console.error(`seed отвергнут: ${result.rejected.length} строк не прошли проверку`);
      for (const rejection of result.rejected) console.error(`  ${rejection.nameRu}: ${rejection.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`seed применён: ${result.inserted} строк food_synonym`);
  } finally {
    await pool.end();
  }
}

void main();
