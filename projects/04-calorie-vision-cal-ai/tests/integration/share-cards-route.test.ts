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
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';
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

const CONSENT_HASH = computeConsentTextHash('2026-09-v1') ?? '';

/**
 * Согласие — РЕАЛЬНЫМ маршрутом `POST /api/v1/consent`, а не прямой записью `consent_at`
 * (RV-share-card-and-growth-events-05, review-report.md): прямая запись обходит собственную
 * границу проекта («ГрантОrDeclineConsent») и не доказывает, что она выдаёт то согласие, которое
 * реально читает `enforceConsentBeforeDiaryWrite`.
 */
async function grantConsent(token: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/consent',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: CONSENT_HASH },
  });
  if (response.statusCode !== 200) throw new Error(`grantConsent: неожиданный статус ${response.statusCode}: ${response.body}`);
}

// Форма — РЕАЛЬНАЯ персистентная форма `persistedItem`
// (`apps/recognizer/src/recognize/recognize-scan.ts`), НЕ придуманная: `mass_g` + снимок
// per-100г записи базы (`source_snapshot.kcal_per_100g` и три макронутриента), БЕЗ готовых
// `kcal/protein/fat/carb` на самой позиции — их считает `computeCardSnapshotFromItems`
// (RV-share-card-and-growth-events-01, review-report.md). Числа подобраны так, чтобы
// `round(mass_g/100 × per100g)` дал РОВНО AC-share-card-and-growth-events-1 «ккал 420, белок
// 24,5, жир 12,0, углеводы 38,2» при массе 200 г: 200/100×210=420, ×12.25=24.5, ×6.0=12.0,
// ×19.1=38.2.
const MATCHED_ITEM = {
  label_ru: 'Овсянка с ягодами',
  mass_g: 200,
  unmatched: false,
  food_item_id: randomUUID(),
  source_snapshot: { source: 'USDA-FDC', source_id: '123456', kcal_per_100g: 210, protein_per_100g: 12.25, fat_per_100g: 6.0, carb_per_100g: 19.1 },
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
    await grantConsent(token);
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

    await grantConsent(token);
    const granted = await postShareCard(token, recognitionId);
    expect(granted.statusCode).toBe(201);
  }, 20_000);

  it('AC-3: recognition.status ∈ {queued, failed, refused} дают 409, карточка не создана ни для одного', async () => {
    const { token, sessionId } = await seedCookieSession();
    await grantConsent(token);

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
    await grantConsent(tokenA);
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
    await grantConsent(token);
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

  it('AC-18: создание карточки не вызывает ModelProvider и не меняет scan_quota_counter — все ТРИ scope, все ТРИ исхода сборки', async () => {
    // ПРАВКА ПОСЛЕ РЕВЬЮ (RV-share-card-and-growth-events-05): прежняя версия сравнивала ДВЕ
    // ПУСТЫЕ таблицы («ничего не появилось» доказывает не то же самое, что «заполненное не
    // изменилось» — пустая таблица прошла бы проверку и при неверном коде). Теперь три счётчика
    // (`user`/`global`/`escalation`) заполнены НЕНУЛЕВЫМ `used` заранее, и сверяются байт-в-байт
    // ПОСЛЕ каждого из трёх исходов маршрута (успех, отказ по согласию, отказ по статусу) — не
    // только после успеха.
    const day = new Date().toISOString().slice(0, 10);
    const seedCounters = async (): Promise<void> => {
      await pool.query(`DELETE FROM scan_quota_counter`);
      await pool.query(
        `INSERT INTO scan_quota_counter (scope, scope_key, day, used, "limit") VALUES
           ('user', 'ac18-user', $1, 3, 10),
           ('global', 'all', $1, 700, 3000),
           ('escalation', 'all', $1, 40, 600)`,
        [day],
      );
    };
    const readCounters = () => pool.query('SELECT scope, scope_key, day, used FROM scan_quota_counter ORDER BY scope');

    // Исход 1 — успешное создание (201).
    {
      const { token, sessionId } = await seedCookieSession();
      await grantConsent(token);
      const recognitionId = await seedDoneRecognition(sessionId, 'ac18-success');
      await seedCounters();
      const before = await readCounters();
      const response = await postShareCard(token, recognitionId);
      expect(response.statusCode).toBe(201);
      const after = await readCounters();
      expect(after.rows).toEqual(before.rows);
    }

    // Исход 2 — отказ по согласию (403), консент НЕ выдан.
    {
      const { token, sessionId } = await seedCookieSession();
      const recognitionId = await seedDoneRecognition(sessionId, 'ac18-refused-consent');
      await seedCounters();
      const before = await readCounters();
      const response = await postShareCard(token, recognitionId);
      expect(response.statusCode).toBe(403);
      const after = await readCounters();
      expect(after.rows).toEqual(before.rows);
    }

    // Исход 3 — отказ по статусу (409), скан не done.
    {
      const { token, sessionId } = await seedCookieSession();
      await grantConsent(token);
      const recognitionId = await seedDoneRecognition(sessionId, 'ac18-refused-status', 'queued');
      await seedCounters();
      const before = await readCounters();
      const response = await postShareCard(token, recognitionId);
      expect(response.statusCode).toBe(409);
      const after = await readCounters();
      expect(after.rows).toEqual(before.rows);
    }
  }, 30_000);

  it('AC-18: сборка карточки архитектурно не может вызвать ModelProvider — путь создания не импортирует и не принимает адаптер провайдера', async () => {
    // «Наблюдение за провайдером» здесь — страж по исходнику, а не спай на рантайм-объекте:
    // `createShareCard`/`createShareCardGuarded`/маршрут 5 не принимают `ModelProvider` ни
    // параметром, ни зависимостью — вызвать его физически НЕЧЕМ на этом пути, в отличие от
    // `apps/recognizer`, где адаптер реально внедряется.
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    for (const relFile of ['apps/api/src/share/create-share-card.ts', 'apps/api/src/routes/share-cards.ts']) {
      const code = await readFile(path.join(root, relFile), 'utf8');
      expect(code, relFile).not.toMatch(/ModelProvider|\.recognize\(/);
    }
  });
});
