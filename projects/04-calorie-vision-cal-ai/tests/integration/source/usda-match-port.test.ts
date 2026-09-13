// `UsdaMatchIngredientPort` на настоящем PostgreSQL (AC-source-and-correct-8/9/10).
//
// RV-source-and-correct-04 (слепое ревью, 2026-09-13): AC-8 здесь был СВОЕЙ КОПИЕЙ
// контракта с другими входами и другим заголовком — требование FR-source-and-correct-4
// («контрактный тест прогоняется БЕЗ ИЗМЕНЕНИЙ его текста») не выполнялось. Теперь вызывает
// ТУ ЖЕ функцию с ТЕМ ЖЕ входом и заголовком, что и `tests/unit/match/null-port.test.ts`
// (`tests/contract/match-ingredient-port.contract.ts`).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SeedSynonymRow } from '@n4/shared';
import { createLogger } from '@n4/shared';
import { loadFoodSynonyms } from '@n4/db';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';
import { createUsdaMatchIngredientPort } from '../../../apps/recognizer/src/match/usda-match-port.js';
import { assertMatchIngredientPortContract, CONTRACT_TITLE } from '../../contract/match-ingredient-port.contract.js';
import { buildServer } from '../../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));
const SEED_PATH = fileURLToPath(new URL('../../../packages/db/seed/food-synonym.ru.json', import.meta.url));
const SEED_ROWS: SeedSynonymRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

describe('AC-source-and-correct-8: контрактный тест MatchIngredientPort БЕЗ ИЗМЕНЕНИЙ (сверка с null-port.test.ts)', () => {
  it(CONTRACT_TITLE, async () => {
    const pool = await migratedPool('n4-tests-usda-match-1');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    await assertMatchIngredientPortContract(createUsdaMatchIngredientPort(pool));
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

  it('переимпорт НЕ меняет уже показанное число: запись → изменение базы → повторное чтение скана (AC-source-and-correct-11)', async () => {
    // RV-source-and-correct-04 (слепое ревью, 2026-09-13): прежняя версия утверждала
    // лишь `kcalBefore !== 999` — локальная JS-переменная, прочитанная ДО UPDATE, физически
    // не могла бы измениться сама по себе; тест оставался бы зелёным при ЛЮБОМ ошибочном
    // повторном чтении снимка. Здесь — реальная последовательность «записать в
    // recognition.items → изменить food_item → GET /scans/{id}» с НЕЗАВИСИМО вычисленным
    // ожидаемым значением (не тем, что вернул сам порт, а посчитанным заново по формуле
    // FR-source-and-correct-6 из snapshot'а).
    const pool = await migratedPool('n4-tests-usda-match-3');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const massG = 250;
    const matched = (await port.match([{ labelRu: 'рис отварной', massG }]))[0];
    const snapshot = matched?.sourceSnapshot as { kcal_per_100g: number; source_id: string };
    // Независимое ожидаемое значение — формула FR-source-and-correct-6, а не значение,
    // которое построил сам проверяемый порт.
    const expectedKcal = Math.round((massG / 100) * snapshot.kcal_per_100g);
    expect(snapshot.kcal_per_100g).not.toBe(999); // фикстура не содержит 999 сама по себе

    const cookie = generateSessionToken();
    await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
      hashSessionToken(cookie),
      '203.0.113.0/24',
    ]);
    const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [hashSessionToken(cookie)]);
    const sessionId = session.rows[0]?.id;
    const scanId = randomUUID();
    const item = { label_ru: 'рис отварной', mass_g: massG, original_mass_g: massG, candidates: [], food_item_id: matched?.foodItemId, source_snapshot: matched?.sourceSnapshot, unmatched: false, kcal: expectedKcal, protein: 6.8, fat: 0.8, carb: 70.5 };
    await pool.query(
      `INSERT INTO recognition (id, device_session_id, idempotency_key, status, items, confidence, db_kcal_total, attempt_no, escalated, finished_at)
       VALUES ($1, $2, $3, 'done', $4::jsonb, 0.9, $5, 1, false, now())`,
      [scanId, sessionId, randomUUID(), JSON.stringify([item]), expectedKcal],
    );

    // Переимпорт с изменённым значением kcal_per_100g — эмулируется прямым UPDATE.
    await pool.query('UPDATE food_item SET kcal_per_100g = 999 WHERE source_id = $1', [snapshot.source_id]);
    const wrongKcalIfReadLive = Math.round((massG / 100) * 999);
    expect(wrongKcalIfReadLive).not.toBe(expectedKcal); // предпосылка: 999 дало бы ДРУГОЕ число

    const app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
    await app.ready();
    try {
      const response = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: { db_kcal_total: number; items: Array<{ kcal: number }> } };
      // Показанное число — ИЗ СНИМКА (expectedKcal), НЕ пересчитано по живой (испорченной
      // переимпортом) строке food_item (wrongKcalIfReadLive).
      expect(body.data.items[0]?.kcal).toBe(expectedKcal);
      expect(body.data.db_kcal_total).toBe(expectedKcal);
      expect(body.data.items[0]?.kcal).not.toBe(wrongKcalIfReadLive);
    } finally {
      await app.close();
    }
  }, 30_000);
});

describe('AC-source-and-correct-10: составное блюдо — свой снимок у каждой части', () => {
  it('«борщ» раскрывается в parts[] с РАЗНЫМИ снимками, суммой долей 1 и массой round(mass_g × share)', async () => {
    // RV-source-and-correct-04 (слепое ревью, 2026-09-13): seed «борщ» несёт РОВНО ПЯТЬ
    // компонентов (packages/db/seed/food-synonym.ru.json, доли 0.35/0.25/0.2/0.15/0.05) —
    // прежняя проверка `length > 1` пропустила бы и 2 части, и 4, и 6; масса каждой части
    // не проверялась вовсе. Здесь — ТОЧНАЯ длина и ТОЧНАЯ масса round(300 × share) на
    // КАЖДУЮ долю, независимо посчитанная в тесте, а не взятая из ответа порта.
    const EXPECTED_SHARES = [0.35, 0.25, 0.2, 0.15, 0.05];
    const pool = await migratedPool('n4-tests-usda-match-4');
    await truncateAll(pool);
    await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
    await loadFoodSynonyms(pool, SEED_ROWS);

    const port = createUsdaMatchIngredientPort(pool);
    const massG = 300;
    const result = await port.match([{ labelRu: 'борщ', massG }]);
    const item = result[0];
    expect(item?.foodItemId).not.toBeNull();
    expect(item?.sourceSnapshot).toBeNull(); // верхний снимок НЕ используется при parts[]
    expect(item?.parts).toBeDefined();
    expect(item?.parts).toHaveLength(EXPECTED_SHARES.length); // ТОЧНО пять, не «больше одной»

    const shares = item?.parts?.map((part) => Number(part.share)) ?? [];
    expect(shares.sort((a, b) => b - a)).toEqual(EXPECTED_SHARES);
    expect(shares.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 5);

    // Масса КАЖДОЙ части — round(300 × её_доли), независимо посчитанная здесь.
    item?.parts?.forEach((part) => {
      const expectedPartMassG = Math.round(massG * Number(part.share));
      expect((part.sourceSnapshot as Record<string, unknown>).portion_g).toBe(expectedPartMassG);
    });

    const snapshots = item?.parts?.map((part) => (part.sourceSnapshot as Record<string, unknown>).source_id);
    expect(new Set(snapshots).size).toBe(snapshots?.length); // все РАЗНЫЕ источники
  }, 30_000);
});
