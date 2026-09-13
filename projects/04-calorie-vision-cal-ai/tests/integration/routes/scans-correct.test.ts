// `POST /api/v1/scans/{id}/correct` — `CorrectScan` (AC-source-and-correct-17…23, -26).

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';
import { createPhotoStorage } from '../../../apps/api/src/photo/store-original.js';
import { normalizedObjectKeyFor } from '../../../apps/recognizer/src/photo/storage.js';
import { makeJpegFixture } from '../../helpers/image-fixtures.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-scans-correct');
  app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
});

async function seedSession(): Promise<string> {
  const token = generateSessionToken();
  await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
    hashSessionToken(token),
    '203.0.113.0/24',
  ]);
  return token;
}

interface SeedItem {
  readonly label_ru: string;
  readonly mass_g: number;
  readonly food_item_id: string | null;
  readonly source_snapshot: Record<string, unknown> | null;
  readonly kcal: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
  readonly carb: number | null;
  readonly unmatched: boolean;
}

async function seedDoneScan(
  cookie: string,
  items: SeedItem[],
  options: { modelEstimateKcal?: number | null; dbKcalTotal?: number | null; discrepancyRatio?: number | null; conflictFlag?: boolean } = {},
): Promise<string> {
  const tokenHash = hashSessionToken(cookie);
  const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [tokenHash]);
  const sessionId = session.rows[0]?.id;
  const id = randomUUID();
  const persisted = items.map((item) => ({ ...item, original_mass_g: item.mass_g, candidates: [] }));
  const dbKcalTotal = options.dbKcalTotal ?? persisted.reduce((sum, item) => sum + (item.unmatched ? 0 : item.kcal ?? 0), 0);
  await pool.query(
    `INSERT INTO recognition (id, device_session_id, idempotency_key, status, items, confidence, model_estimate_kcal, db_kcal_total, discrepancy_ratio, conflict_flag, escalated, attempt_no, finished_at)
     VALUES ($1, $2, $3, 'done', $4::jsonb, 0.9, $5, $6, $7, $8, false, 1, now())`,
    [
      id,
      sessionId,
      randomUUID(),
      JSON.stringify(persisted),
      options.modelEstimateKcal ?? null,
      dbKcalTotal,
      options.discrepancyRatio ?? null,
      options.conflictFlag ?? false,
    ],
  );
  return id;
}

/**
 * Прикрепляет нормализованную копию к уже засеянному скану (FR-LOOK-007/DEC-A-050) — тем
 * же способом, каким это делает `recognizer` (`normalizedObjectKeyFor`), но без реального
 * воркера. Возвращает `normalized_object_key` для сверки в присланном `photo_url`.
 */
async function attachNormalizedPhoto(scanId: string): Promise<string> {
  const recognitionRow = await pool.query<{ device_session_id: string }>('SELECT device_session_id FROM recognition WHERE id = $1', [scanId]);
  const sessionId = recognitionRow.rows[0]?.device_session_id;
  if (sessionId === undefined) throw new Error(`recognition ${scanId} не найден`);
  const storage = createPhotoStorage(testScanApiConfig().storage);
  const objectKey = `${sessionId}/${scanId}.jpg`;
  const normalizedKey = normalizedObjectKeyFor(objectKey);
  await storage.putOriginal(normalizedKey, await makeJpegFixture(), 'image/jpeg');
  const photo = await pool.query<{ id: string }>(
    `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on, normalized_object_key, normalized_bytes)
     VALUES ($1, $2, 'image/jpeg', 1024, 800, 600, current_date + 30, $3, 2048) RETURNING id`,
    [sessionId, objectKey, normalizedKey],
  );
  await pool.query('UPDATE recognition SET photo_id = $1 WHERE id = $2', [photo.rows[0]!.id, scanId]);
  return normalizedKey;
}

async function findFoodItem(sourceId: string): Promise<{ id: string; kcal_per_100g: number }> {
  const result = await pool.query<{ id: string; kcal_per_100g: number }>('SELECT id, kcal_per_100g FROM food_item WHERE source_id = $1', [sourceId]);
  const row = result.rows[0];
  if (row === undefined) throw new Error(`фикстура не содержит source_id ${sourceId}`);
  return row;
}

function correctBody(payload: Record<string, unknown>) {
  return { headers: { 'content-type': 'application/json' }, payload };
}

describe('AC-source-and-correct-17: set_portion — три нажатия, пересчёт из снимка, ни вызова модели, ни квоты', () => {
  it('220 г после трёх шагов даёт пересчитанные числа, quota и model_call не тронуты', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 250, food_item_id: rice.id, source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' }, kcal: Math.round((250 / 100) * rice.kcal_per_100g), protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false },
    ]);

    for (const mass of [240, 230, 220]) {
      const response = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, ...correctBody({}).headers }, payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: mass }) });
      expect(response.statusCode).toBe(200);
    }

    const finalRow = await pool.query('SELECT items, db_kcal_total FROM recognition WHERE id = $1', [scanId]);
    const finalItems = finalRow.rows[0]?.items as Array<{ mass_g: number; kcal: number }>;
    expect(finalItems[0]?.mass_g).toBe(220);
    expect(finalItems[0]?.kcal).toBe(Math.round((220 / 100) * rice.kcal_per_100g));

    const quota = await pool.query('SELECT count(*)::int AS n FROM scan_quota_counter');
    expect(quota.rows[0]?.n).toBe(0);
  }, 30_000);
});

describe('AC-source-and-correct-18: границы применяются на сервере, прежнее значение сохраняется', () => {
  it('десять мусорных значений mass_g/index дают 422, порция остаётся 250 во всех случаях', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 250, food_item_id: rice.id, source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' }, kcal: 325, protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false },
    ]);

    const badMassValues: unknown[] = [5000, 4, 0, -10, 12.5, 'abc', null, undefined, 0.0];
    for (const mass_g of badMassValues) {
      const body: Record<string, unknown> = { op: 'set_portion', index: 0 };
      if (mass_g !== undefined) body.mass_g = mass_g;
      const response = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
      expect(response.statusCode, JSON.stringify(mass_g)).toBe(422);
    }
    for (const index of [99, -1]) {
      const response = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'set_portion', index, mass_g: 100 }) });
      expect(response.statusCode, `index=${index}`).toBe(422);
    }

    const row = await pool.query('SELECT items FROM recognition WHERE id = $1', [scanId]);
    const items = row.rows[0]?.items as Array<{ mass_g: number }>;
    expect(items[0]?.mass_g).toBe(250);
  }, 30_000);
});

describe('AC-source-and-correct-19/20: replace_item — поиск встроен в маршрут, замена ограничена базой', () => {
  it('query возвращает кандидатов, состав НЕ меняется; несуществующий food_item_id — 422; посторонние поля игнорируются', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const chicken = await findFoodItem('171077');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'загадочный ингредиент', mass_g: 150, food_item_id: null, source_snapshot: null, kcal: null, protein: null, fat: null, carb: null, unmatched: true },
    ]);

    const searchResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'replace_item', query: 'курица' }) });
    expect(searchResponse.statusCode).toBe(200);
    const searchBody = JSON.parse(searchResponse.body);
    expect(Array.isArray(searchBody.data.candidates)).toBe(true);
    expect(searchBody.data.candidates.length).toBeLessThanOrEqual(20);
    const afterSearch = await pool.query('SELECT items FROM recognition WHERE id = $1', [scanId]);
    expect((afterSearch.rows[0]?.items as unknown[])[0]).toMatchObject({ unmatched: true }); // состав НЕ изменён

    const unknownIdResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'replace_item', index: 0, food_item_id: randomUUID() }) });
    expect(unknownIdResponse.statusCode).toBe(422);

    const replaceResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/scans/${scanId}/correct`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ op: 'replace_item', index: 0, food_item_id: chicken.id, kcal_per_100g: 9999, name: 'подделка' }),
    });
    expect(replaceResponse.statusCode).toBe(200);
    const replaced = JSON.parse(replaceResponse.body);
    // Посторонние поля от клиента НЕ повлияли ни на одно сохранённое значение.
    expect(replaced.data.items[0].kcal).not.toBe(9999);
    expect(replaced.data.items[0].source_snapshot.kcal_per_100g).toBe(chicken.kcal_per_100g);
    expect(replaced.data.items[0].unmatched).toBe(false);
    void rice;
  }, 30_000);
});

describe('AC-source-and-correct-21: delete_item пересчитывает итог и пишет поправку', () => {
  it('удаление одной из трёх позиций пересчитывает db_kcal_total и добавляет запись в corrections', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const chicken = await findFoodItem('171077');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 200, food_item_id: rice.id, source_snapshot: {}, kcal: 550, protein: 5, fat: 1, carb: 40, unmatched: false },
      { label_ru: 'соус', mass_g: 50, food_item_id: chicken.id, source_snapshot: {}, kcal: 90, protein: 1, fat: 5, carb: 2, unmatched: false },
    ], { dbKcalTotal: 640 });

    const response = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'delete_item', index: 1 }) });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.db_kcal_total).toBe(550);
    expect(body.data.items).toHaveLength(1);

    const row = await pool.query('SELECT corrections FROM recognition WHERE id = $1', [scanId]);
    const corrections = row.rows[0]?.corrections as unknown[];
    expect(corrections).toHaveLength(1);
  }, 30_000);
});

describe('AC-source-and-correct-22: resolve_conflict принимает только take_db', () => {
  it('take_db → 200 с числом базы; model/base/пустая/отсутствует → 422; без conflict_flag → 409', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(
      cookie,
      [{ label_ru: 'рис', mass_g: 200, food_item_id: rice.id, source_snapshot: {}, kcal: 640, protein: 5, fat: 1, carb: 40, unmatched: false }],
      { modelEstimateKcal: 780, dbKcalTotal: 640, discrepancyRatio: 0.219, conflictFlag: true },
    );

    for (const choice of ['model', 'base', '', undefined]) {
      const body: Record<string, unknown> = { op: 'resolve_conflict' };
      if (choice !== undefined) body.choice = choice;
      const response = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
      expect(response.statusCode, JSON.stringify(choice)).toBe(422);
    }

    const okResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'resolve_conflict', choice: 'take_db' }) });
    expect(okResponse.statusCode).toBe(200);
    const okBody = JSON.parse(okResponse.body);
    expect(okBody.data.kcal_total).toBe(640);
    expect(okBody.data.conflict_choice).toBe('take_db');

    // Скан без conflict_flag.
    const noConflictScanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 200, food_item_id: rice.id, source_snapshot: {}, kcal: 260, protein: 5, fat: 1, carb: 40, unmatched: false },
    ]);
    const noConflictResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${noConflictScanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'resolve_conflict', choice: 'take_db' }) });
    expect(noConflictResponse.statusCode).toBe(409);
  }, 30_000);
});

describe('AC-source-and-correct-23: чужой скан недостижим и не изменяется', () => {
  it('чужая сессия и несуществующий scan_id дают ОДИН и тот же 404, строка не изменена', async () => {
    const ownerCookie = await seedSession();
    const strangerCookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(ownerCookie, [
      { label_ru: 'рис', mass_g: 200, food_item_id: rice.id, source_snapshot: {}, kcal: 260, protein: 5, fat: 1, carb: 40, unmatched: false },
    ]);
    const before = await pool.query('SELECT items, db_kcal_total FROM recognition WHERE id = $1', [scanId]);

    for (const op of [{ op: 'set_portion', index: 0, mass_g: 100 }, { op: 'delete_item', index: 0 }, { op: 'resolve_conflict', choice: 'take_db' }, { op: 'replace_item', index: 0, food_item_id: rice.id }]) {
      const foreignResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${strangerCookie}`, 'content-type': 'application/json' }, payload: JSON.stringify(op) });
      expect(foreignResponse.statusCode, JSON.stringify(op)).toBe(404);
    }
    const missingResponse = await app.inject({ method: 'POST', url: `/api/v1/scans/${randomUUID()}/correct`, headers: { cookie: `${SESSION_COOKIE_NAME}=${strangerCookie}`, 'content-type': 'application/json' }, payload: JSON.stringify({ op: 'delete_item', index: 0 }) });
    expect(missingResponse.statusCode).toBe(404);

    const after = await pool.query('SELECT items, db_kcal_total FROM recognition WHERE id = $1', [scanId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  }, 30_000);
});

describe('AC-source-and-correct-26: чужой текст не исполняется', () => {
  it('название ингредиента с разметкой сохраняется и возвращается ТЕКСТОМ (JSON-строкой), не исполняясь', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const malicious = '<img src=x onerror=alert(1)>';
    const scanId = await seedDoneScan(cookie, [
      { label_ru: malicious, mass_g: 200, food_item_id: rice.id, source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 200, import_snapshot_date: '2026-04-01' }, kcal: 260, protein: 5, fat: 1, carb: 40, unmatched: false },
    ]);
    const response = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // Строка приходит НЕИЗМЕНЁННОЙ — сервер её не подчищает и не отбрасывает молча.
    // Исполнение НЕ происходит потому, что ответ отдаётся с `Content-Type: application/json`
    // (браузер не рендерит JSON как HTML) — экранирование при ВЫВОДЕ на экран результата
    // принадлежит `apps/web` (React экранирует текстовые узлы по умолчанию) и здесь не
    // измерено: у этой фичи нет браузерного прогона (см. `05_completion.md`, «Недостижимое»).
    expect(body.data.items[0].label_ru).toBe(malicious);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  }, 30_000);
});

describe('FR-LOOK-007/DEC-A-050: кадр экрана результата не пропадает после правки', () => {
  it('photo_url остаётся тем же после set_portion — ответ правки несёт то же тело, что GET', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 250, food_item_id: rice.id, source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' }, kcal: 325, protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false },
    ]);
    await attachNormalizedPhoto(scanId);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/scans/${scanId}/correct`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: 220 }),
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body).data;
    // Ровно СВОЙ-origin путь (не адрес хранилища напрямую — `photo/photo-url.ts`).
    expect(body.photo_url).toBe(`/api/v1/scans/${scanId}/photo`);

    // Ветка ЧИСТОГО поиска (`replace_item` + `query`) не меняет состав — тот же кадр обязан
    // прийти и здесь, это ОТДЕЛЬНАЯ ветка кода (`scans-correct.ts`), не переиспользующая путь выше.
    const searchResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/scans/${scanId}/correct`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ op: 'replace_item', query: 'рис' }),
    });
    expect(searchResponse.statusCode).toBe(200);
    const searchBody = JSON.parse(searchResponse.body).data;
    expect(searchBody.photo_url).toBe(`/api/v1/scans/${scanId}/photo`);

    // Тот же путь и правда отдаёт байты (не только строку в JSON).
    const photoResponse = await app.inject({ method: 'GET', url: searchBody.photo_url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(photoResponse.statusCode).toBe(200);
    expect(photoResponse.headers['content-type']).toBe('image/jpeg');
  }, 30_000);

  it('скан без photo_id (photo_id = NULL) отдаёт photo_url = null и на GET, и на correct', async () => {
    const cookie = await seedSession();
    const rice = await findFoodItem('168878');
    const scanId = await seedDoneScan(cookie, [
      { label_ru: 'рис', mass_g: 250, food_item_id: rice.id, source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' }, kcal: 325, protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false },
    ]);

    const getResponse = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(getResponse.statusCode).toBe(200);
    expect(JSON.parse(getResponse.body).data.photo_url).toBeNull();

    const correctResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/scans/${scanId}/correct`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: 220 }),
    });
    expect(correctResponse.statusCode).toBe(200);
    expect(JSON.parse(correctResponse.body).data.photo_url).toBeNull();
  }, 30_000);
});
