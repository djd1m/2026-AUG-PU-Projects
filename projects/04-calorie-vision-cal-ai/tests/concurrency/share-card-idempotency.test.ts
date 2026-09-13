// AC-share-card-and-growth-events-17 — 20 одновременных создателей на ОДИН recognition_id:
// ровно одна строка share_card, все ответы с одним card_id, ни один вызов не завершается
// неучтённой ошибкой (конфликт `ON CONFLICT DO NOTHING` обработан как «уже создано»).
//
// ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-05, review-report.md): прежняя версия
// проверяла ТОЛЬКО `createShareCardGuarded` (репозиторий) — критерий буквально требует 20
// ОДНОВРЕМЕННЫХ HTTP-запросов `POST /api/v1/share-cards` С рендером и загрузкой файла, а не
// только гонку за строку. Основной тест ниже — теперь ПОЛНЫЙ HTTP-путь на РЕАЛЬНОМ MinIO
// (20 конкурентных `app.inject`, каждый реально рендерит `sharp` и кладёт файл в бакет).
// Репозиторный тест ОСТАВЛЕН ВТОРЫМ, отдельным сценарием — он проверяет УЖЕ ДРУГОЕ: что
// `ON CONFLICT DO NOTHING` в БАЗЕ (NFR-1, «разделяемый ресурс проверяется конкурентно на
// настоящем PostgreSQL») держит гарантию даже БЕЗ дорогого рендера, то есть изолирует именно
// СЛОЙ БАЗЫ от слоя HTTP/рендера — оба слоя стоит проверять, и они ловят РАЗНЫЕ классы регрессий
// (испортить `ON CONFLICT` в SQL vs испортить идемпотентность на уровне маршрута/оркестратора).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createPhotoStorage } from '../../apps/api/src/photo/store-original.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';
import { makeJpegFixture } from '../helpers/image-fixtures.js';
import { createShareCardGuarded, type CreateShareCardResult } from '../../apps/api/src/share/share-card-repository.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-share-card-idempotency');
  const storage = createPhotoStorage(testScanApiConfig().storage);
  app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }), storage });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

const CONSENT_HASH = computeConsentTextHash('2026-09-v1') ?? '';
const CONCURRENT = 20;

describe('AC-17 (HTTP): 20 одновременных POST /api/v1/share-cards на один recognition_id, реальный рендер и загрузка', () => {
  it('ровно одна строка share_card, все 20 ответов несут ОДИН card_id, ни один не завершается 5xx/необработанной ошибкой', async () => {
    const token = generateSessionToken();
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, '203.0.113.0/24', now() + interval '7 days') RETURNING id`,
      [hashSessionToken(token)],
    );
    const sessionId = session.rows[0]!.id;

    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: CONSENT_HASH },
    });
    expect(grant.statusCode).toBe(200);

    const storage = createPhotoStorage(testScanApiConfig().storage);
    const objectKey = 'photos/ac17-http.jpg';
    await storage.putOriginal(objectKey, await makeJpegFixture(), 'image/jpeg');
    const photo = await pool.query<{ id: string }>(
      `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on) VALUES ($1, $2, 'image/jpeg', 1024, 800, 600, current_date + 30) RETURNING id`,
      [sessionId, objectKey],
    );
    const item = {
      label_ru: 'Суп',
      mass_g: 250,
      unmatched: false,
      food_item_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      source_snapshot: { source: 'USDA-FDC', source_id: '1', kcal_per_100g: 40, protein_per_100g: 2.0, fat_per_100g: 1.0, carb_per_100g: 5.0 },
    };
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, photo_id, status, items) VALUES ($1, $2, 'done', $3::jsonb) RETURNING id`,
      [sessionId, photo.rows[0]!.id, JSON.stringify([item])],
    );
    const recognitionId = recognition.rows[0]!.id;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/share-cards',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
          payload: { recognition_id: recognitionId },
        }),
      ),
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.map((r) => r.reason)).toEqual([]); // ни один вызов не бросил необработанное исключение

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof app.inject>>> => r.status === 'fulfilled').map((r) => r.value);
    expect(fulfilled).toHaveLength(CONCURRENT);
    const statuses = fulfilled.map((r) => r.statusCode);
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true); // ни одного 5xx/4xx на 20 легитимных вызовах

    const cardIds = new Set(fulfilled.map((r) => (r.json() as { data: { card_id: string } }).data.card_id));
    expect(cardIds.size).toBe(1); // ОДИН и тот же card_id у всех 20 HTTP-ответов

    const rows = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rowCount).toBe(1); // РОВНО одна строка в базе — рендер и загрузка не породили дублей
  }, 60_000);
});

describe('AC-17 (слой базы, NFR-1): 20 одновременных createShareCardGuarded на один recognition_id', () => {
  it('ровно одна строка share_card, все 20 результатов несут ОДИН card_id, ни один не бросает исключение', async () => {
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at, consent_at)
       VALUES ($1, '203.0.113.0/24', now() + interval '7 days', now()) RETURNING id`,
      [hashSessionToken(generateSessionToken())],
    );
    const sessionId = session.rows[0]!.id;
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
      [sessionId],
    );
    const recognitionId = recognition.rows[0]!.id;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        createShareCardGuarded(pool, {
          owner: { table: 'device_session', id: sessionId },
          recognitionId,
          objectKey: `share-cards/${recognitionId}.jpg`,
          badgeRendered: true,
        }),
      ),
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.map((r) => r.reason)).toEqual([]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<CreateShareCardResult> => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(CONCURRENT);

    const withId = fulfilled.filter((r): r is PromiseFulfilledResult<Extract<CreateShareCardResult, { outcome: 'created' | 'existing' }>> => r.value.outcome !== 'refused');
    expect(withId).toHaveLength(CONCURRENT);

    const cardIds = new Set(withId.map((r) => r.value.id));
    expect(cardIds.size).toBe(1);

    const outcomes = new Set(withId.map((r) => r.value.outcome));
    expect(outcomes.has('created')).toBe(true);
    for (const outcome of outcomes) expect(['created', 'existing']).toContain(outcome);

    const rows = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rowCount).toBe(1);
  }, 30_000);
});
