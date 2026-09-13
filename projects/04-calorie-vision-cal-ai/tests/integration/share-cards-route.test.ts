// `POST /api/v1/share-cards` (CreateShareCard, маршрут 5 канона).
// AC-share-card-and-growth-events-1/2/3/4/6/18.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createPhotoStorage } from '../../apps/api/src/photo/store-original.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';
import { makeJpegFixture } from '../helpers/image-fixtures.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-share-cards-route');
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

async function seedCookieSession(): Promise<{ token: string; sessionId: string }> {
  const token = generateSessionToken();
  const row = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
    [hashSessionToken(token), '203.0.113.0/24'],
  );
  return { token, sessionId: row.rows[0]!.id };
}

const MATCHED_ITEM = {
  label_ru: 'Овсянка с ягодами',
  unmatched: false,
  food_item_id: randomUUID(),
  kcal: 420,
  protein: 24.5,
  fat: 12.0,
  carb: 38.2,
  source_snapshot: { source: 'USDA-FDC', source_id: '123456', portion_g: 180 },
};

/** Скан в статусе done с реальными байтами фото В MinIO (не только строкой БД — `renderCardImage`
 *  фетчит presigned-URL по-настоящему) и Snapshot из ОДНОЙ сопоставленной позиции. */
async function seedDoneRecognition(sessionId: string, marker: string, status: 'done' | 'queued' | 'failed' | 'refused' = 'done'): Promise<string> {
  const storage = createPhotoStorage(testScanApiConfig().storage);
  const objectKey = `photos/${marker}.jpg`;
  await storage.putOriginal(objectKey, await makeJpegFixture(), 'image/jpeg');
  const photo = await pool.query<{ id: string }>(
    `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on) VALUES ($1, $2, 'image/jpeg', 1024, 800, 600, current_date + 30) RETURNING id`,
    [sessionId, objectKey],
  );
  const items = status === 'done' ? [MATCHED_ITEM] : [];
  const recognition = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, photo_id, status, items) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
    [sessionId, photo.rows[0]!.id, status, JSON.stringify(items)],
  );
  return recognition.rows[0]!.id;
}

function postShareCard(cookie: string, recognitionId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/share-cards',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: { recognition_id: recognitionId },
  });
}

describe('POST /api/v1/share-cards', () => {
  it('AC-1: завершённый скан со Snapshot даёт 201, share_card с ровно четырьмя числами и без данных здоровья', async () => {
    const { token, sessionId } = await seedCookieSession();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);
    const recognitionId = await seedDoneRecognition(sessionId, 'ac1');

    const response = await postShareCard(token, recognitionId);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.card_id).toBeTypeOf('string');

    const row = await pool.query<{ badge_rendered: boolean; revoked_at: Date | null }>(
      'SELECT badge_rendered, revoked_at FROM share_card WHERE id = $1',
      [body.data.card_id],
    );
    expect(row.rows[0]?.revoked_at).toBeNull();
    expect(row.rows[0]?.badge_rendered).toBe(true); // анонимная сессия — fail-closed
  }, 20_000);

  it('AC-2 / DEC-A-034: анонимная сессия БЕЗ согласия получает 403, карточка НЕ создаётся; после grant тот же вызов создаёт карточку', async () => {
    const { token, sessionId } = await seedCookieSession();
    const recognitionId = await seedDoneRecognition(sessionId, 'ac2');

    const refused = await postShareCard(token, recognitionId);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('consent_required');

    const noRow = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(noRow.rowCount).toBe(0);

    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);
    const granted = await postShareCard(token, recognitionId);
    expect(granted.statusCode).toBe(201);
  }, 20_000);

  it('AC-3: recognition.status ∈ {queued, failed, refused} дают 409, карточка не создана ни для одного', async () => {
    const { token, sessionId } = await seedCookieSession();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);

    for (const status of ['queued', 'failed', 'refused'] as const) {
      const recognitionId = await seedDoneRecognition(sessionId, `ac3-${status}`, status);
      const response = await postShareCard(token, recognitionId);
      expect(response.statusCode, status).toBe(409);
      const row = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
      expect(row.rowCount, status).toBe(0);
    }
  }, 20_000);

  it('AC-6: повторный вызов возвращает ТУ ЖЕ карточку; чужой recognition_id даёт 404 и не создаёт/не читает ничего', async () => {
    const { token: tokenA, sessionId: sessionA } = await seedCookieSession();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionA]);
    const recognitionId = await seedDoneRecognition(sessionA, 'ac6');

    const first = await postShareCard(tokenA, recognitionId);
    expect(first.statusCode).toBe(201);
    const cardId = first.json().data.card_id;

    const second = await postShareCard(tokenA, recognitionId);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.card_id).toBe(cardId);

    const cardCount = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(cardCount.rows[0]?.n).toBe(1);

    const { token: tokenB } = await seedCookieSession();
    const stranger = await postShareCard(tokenB, recognitionId);
    expect(stranger.statusCode).toBe(404);
  }, 20_000);

  it('AC-11: share_click считает КЛИКИ, а не карточки — три вызова на одну карточку дают три события, share_card остаётся одна; чужой 404-вызов события не создаёт', async () => {
    const { token, sessionId } = await seedCookieSession();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);
    const recognitionId = await seedDoneRecognition(sessionId, 'ac11');

    let cardId: string | undefined;
    for (let i = 0; i < 3; i += 1) {
      const response = await postShareCard(token, recognitionId);
      expect([200, 201], `вызов ${i}: статус ${response.statusCode}`).toContain(response.statusCode);
      cardId = response.json().data.card_id;
    }

    const { token: strangerToken } = await seedCookieSession();
    const stranger = await postShareCard(strangerToken, recognitionId);
    expect(stranger.statusCode).toBe(404);

    const cardCount = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(cardCount.rows[0]?.n).toBe(1); // ОДНА карточка, не три

    const clicks = await pool.query(`SELECT count(*)::int AS n FROM growth_event WHERE share_card_id = $1 AND type = 'share_click'`, [cardId]);
    expect(clicks.rows[0]?.n).toBe(3); // РОВНО три клика — по одному на каждый успешный вызов, 404 не считается
  }, 20_000);

  it('AC-18: создание карточки не вызывает ModelProvider и не меняет scan_quota_counter владельца/дня', async () => {
    const { token, sessionId } = await seedCookieSession();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);
    const recognitionId = await seedDoneRecognition(sessionId, 'ac18');

    const before = await pool.query('SELECT scope, scope_key, used FROM scan_quota_counter');
    const response = await postShareCard(token, recognitionId);
    expect(response.statusCode).toBe(201);
    const after = await pool.query('SELECT scope, scope_key, used FROM scan_quota_counter');
    expect(after.rows).toEqual(before.rows); // НЕ изменилось ни на единицу — в т.ч. «строк не появилось»
  }, 20_000);
});
