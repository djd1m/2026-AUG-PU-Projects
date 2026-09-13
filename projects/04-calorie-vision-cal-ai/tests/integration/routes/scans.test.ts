// `POST /api/v1/scans` и `GET /api/v1/scans/{id}` (EnqueueScanForFeature/GetScanStatus).
// AC-scan-pipeline-1/3/4/5/7/9/18/20/24/30.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';
import { buildMultipartBody } from '../../helpers/multipart.js';
import { makeJpegFixture, makeOversizedJpegFixture, makeTooSmallJpegFixture } from '../../helpers/image-fixtures.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-scans-routes');
  app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function seedCookieSession(): Promise<string> {
  const token = generateSessionToken();
  await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
    hashSessionToken(token),
    '203.0.113.0/24',
  ]);
  return token;
}

/** Сессия, связанная с аккаунтом заданного статуса (по умолчанию `active`) — для проверки
 * пост-мерж дефекта №2 (`merge-consent.md`, DEC-A-036): удаление аккаунта обязано закрывать
 * создание новых сканов. */
async function seedLinkedSession(status: 'active' | 'erasing' | 'erased' = 'active'): Promise<{ token: string; accountId: string }> {
  const token = generateSessionToken();
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, status, consent_at) VALUES ($1, $2, now()) RETURNING id`,
    [randomUUID(), status],
  );
  const accountId = account.rows[0]!.id;
  await pool.query(
    `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days')`,
    [accountId, hashSessionToken(token), '203.0.113.0/24'],
  );
  return { token, accountId };
}

async function postScan(cookie: string, file: Buffer, options: { contentType?: string; idempotencyKey?: string; filename?: string } = {}) {
  const { body, contentType } = buildMultipartBody([
    { fieldName: 'file', filename: options.filename ?? 'plate.jpg', contentType: options.contentType ?? 'image/jpeg', data: file },
  ]);
  const headers: Record<string, string> = { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType };
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
  return app.inject({ method: 'POST', url: '/api/v1/scans', headers, payload: body });
}

describe('POST /api/v1/scans', () => {
  it('AC-1: невалидная сигнатура — 422 invalid_image, ничего не создано, квота не тронута', async () => {
    const cookie = await seedCookieSession();
    const response = await postScan(cookie, Buffer.from('это не изображение вовсе, просто текстовые байты'), {
      idempotencyKey: randomUUID(),
    });
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe('invalid_image');
    const rows = await pool.query('SELECT count(*)::int AS n FROM recognition');
    expect(rows.rows[0]?.n).toBe(0);
    const quota = await pool.query('SELECT count(*)::int AS n FROM scan_quota_counter');
    expect(quota.rows[0]?.n).toBe(0);
  });

  it('AC-3: файл сверх 12 МБ — 413, квота не списана', async () => {
    const cookie = await seedCookieSession();
    const oversized = await makeOversizedJpegFixture();
    if (oversized.byteLength <= 12_582_912) {
      // Фикстура обязана реально превышать порог — иначе тест доказывает не то, что заявлено.
      throw new Error(`фикстура ${oversized.byteLength} байт не превышает порог 12 582 912`);
    }
    const response = await postScan(cookie, oversized, { idempotencyKey: randomUUID() });
    expect(response.statusCode).toBe(413);
    const quota = await pool.query('SELECT count(*)::int AS n FROM scan_quota_counter');
    expect(quota.rows[0]?.n).toBe(0);
  }, 30_000);

  it('AC-3: разрешение меньше 320×320 — 422, квота не списана', async () => {
    const cookie = await seedCookieSession();
    const small = await makeTooSmallJpegFixture();
    const response = await postScan(cookie, small, { idempotencyKey: randomUUID() });
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe('image_too_small');
  });

  it('AC-4: без Idempotency-Key — 422, квота не проверяется', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const response = await postScan(cookie, jpeg, {});
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe('idempotency_key_required');
  });

  it('AC-4: Idempotency-Key = "not-a-uuid" — 422', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const response = await postScan(cookie, jpeg, { idempotencyKey: 'not-a-uuid' });
    expect(response.statusCode).toBe(422);
  });

  it('AC-5: валидный запрос — 202 queued, строка recognition создана атомарно с photo и квотой', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const key = randomUUID();
    const response = await postScan(cookie, jpeg, { idempotencyKey: key });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.data.status).toBe('queued');
    expect(typeof body.data.scan_id).toBe('string');

    const row = await pool.query('SELECT status, photo_id, idempotency_key FROM recognition WHERE id = $1', [body.data.scan_id]);
    expect(row.rows[0]?.status).toBe('queued');
    expect(row.rows[0]?.photo_id).not.toBeNull();
    expect(row.rows[0]?.idempotency_key).toBe(key);

    const quota = await pool.query("SELECT used FROM scan_quota_counter WHERE scope = 'global'");
    expect(quota.rows[0]?.used).toBe(1);
  }, 20_000);

  it('AC-5/6: повтор с ТЕМ ЖЕ Idempotency-Key возвращает ТОТ ЖЕ scan_id, квота не увеличивается повторно', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const key = randomUUID();

    const first = await postScan(cookie, jpeg, { idempotencyKey: key });
    const second = await postScan(cookie, jpeg, { idempotencyKey: key });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(JSON.parse(second.body).data.scan_id).toBe(JSON.parse(first.body).data.scan_id);

    const count = await pool.query('SELECT count(*)::int AS n FROM recognition');
    expect(count.rows[0]?.n).toBe(1);
    const quota = await pool.query("SELECT used FROM scan_quota_counter WHERE scope = 'global'");
    expect(quota.rows[0]?.used).toBe(1);
  }, 20_000);

  it('RV-scan-pipeline-15: growth_event(install) пишется РОВНО один раз на сессию, а не на каждый скан', async () => {
    // ПРЕЖНИЙ SELECT_ANY_PRIOR_SCAN (`WHERE device_session_id = $1 LIMIT 1`, БЕЗ
    // `AND id != $2`) находил СВОЮ ЖЕ только что закоммиченную строку и потому давал
    // `rowCount === 1` на КАЖДОМ скане — `install` писался на каждый скан этой сессии, не
    // только на первый, искажая ростовые метрики.
    const cookie = await seedCookieSession();
    const first = await postScan(cookie, await makeJpegFixture(), { idempotencyKey: randomUUID() });
    expect(first.statusCode).toBe(202);
    const second = await postScan(cookie, await makeJpegFixture(), { idempotencyKey: randomUUID() });
    expect(second.statusCode).toBe(202);
    const third = await postScan(cookie, await makeJpegFixture(), { idempotencyKey: randomUUID() });
    expect(third.statusCode).toBe(202);

    const scans = await pool.query('SELECT count(*)::int AS n FROM recognition');
    expect(scans.rows[0]?.n).toBe(3); // три РАЗНЫХ скана этой сессии — не идемпотентный повтор

    const installs = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'install'");
    expect(installs.rows[0]?.n).toBe(1);
  }, 30_000);

  it('AC-7/20: квота исчерпана — 429 с scope, ни recognition, ни photo не сохраняются', async () => {
    const smallLimitApp = buildServer({
      config: testScanApiConfig({ quota: { scanLimitUser: 1, scanLimitDay: 3000, escalationLimitDay: 600 } }),
      pool,
      logger: createLogger({ service: 'api-test', sink: () => {} }),
    });
    await smallLimitApp.ready();
    try {
      const cookie = await seedCookieSession();
      const jpeg = await makeJpegFixture();
      const { body, contentType } = buildMultipartBody([{ fieldName: 'file', filename: 'a.jpg', contentType: 'image/jpeg', data: jpeg }]);

      const first = await smallLimitApp.inject({
        method: 'POST',
        url: '/api/v1/scans',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType, 'idempotency-key': randomUUID() },
        payload: body,
      });
      expect(first.statusCode).toBe(202);

      const second = await smallLimitApp.inject({
        method: 'POST',
        url: '/api/v1/scans',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType, 'idempotency-key': randomUUID() },
        payload: body,
      });
      expect(second.statusCode).toBe(429);
      const errorBody = JSON.parse(second.body);
      expect(errorBody.error.code).toBe('quota_exhausted');
      expect(errorBody.error.details.scope).toBe('user');

      const count = await pool.query('SELECT count(*)::int AS n FROM recognition');
      expect(count.rows[0]?.n).toBe(1); // только ПЕРВЫЙ, принятый скан
    } finally {
      await smallLimitApp.close();
    }
  }, 30_000);

  it('пост-мерж дефект №2 (merge-consent.md, DEC-A-036): запрос на удаление закрывает создание новых сканов', async () => {
    // Воспроизводится РЕАЛЬНОЙ последовательностью запросов, не прямой правкой БД: запрос на
    // удаление → попытка создать скан ТОЙ ЖЕ сессией → отказ. `DELETE /api/v1/account` со
    // scope=erase_all переводит аккаунт в `status = 'erasing'` (`account-delete.ts`); без
    // починки `POST /scans` продолжал бы принимать сканы всё время фоновой эразуры (до 72 ч).
    const { token } = await seedLinkedSession('active');

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { confirm: true, scope: 'erase_all' },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(JSON.parse(deleteResponse.body).data.erase_deadline).not.toBeNull();

    const jpeg = await makeJpegFixture();
    const response = await postScan(token, jpeg, { idempotencyKey: randomUUID() });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('account_erasing');

    const count = await pool.query('SELECT count(*)::int AS n FROM recognition');
    expect(count.rows[0]?.n).toBe(0); // ни один скан не создан после запроса на удаление
  });

  it('дефект №2, fail-closed: аккаунт erased (не только erasing) тоже отказывает в создании скана', async () => {
    const { token } = await seedLinkedSession('erased');
    const response = await postScan(token, await makeJpegFixture(), { idempotencyKey: randomUUID() });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('account_erasing');
  });

  it('дефект №2, контроль: активный связанный аккаунт продолжает создавать сканы как обычно', async () => {
    const { token } = await seedLinkedSession('active');
    const response = await postScan(token, await makeJpegFixture(), { idempotencyKey: randomUUID() });
    expect(response.statusCode).toBe(202);
  });
});

describe('GET /api/v1/scans/{id}', () => {
  it('AC-18: чужой и несуществующий id дают ОДИН и тот же 404', async () => {
    const ownerCookie = await seedCookieSession();
    const strangerCookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const created = await postScan(ownerCookie, jpeg, { idempotencyKey: randomUUID() });
    const scanId = JSON.parse(created.body).data.scan_id;

    const foreign = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${strangerCookie}` } });
    const missing = await app.inject({ method: 'GET', url: `/api/v1/scans/${randomUUID()}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${strangerCookie}` } });

    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(foreign.body).toBe(missing.body);
  }, 20_000);

  it('владелец получает свой скан со статусом queued', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture();
    const created = await postScan(cookie, jpeg, { idempotencyKey: randomUUID() });
    const scanId = JSON.parse(created.body).data.scan_id;

    const response = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanId}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.status).toBe('queued');
    expect(body.data.items).toEqual([]);
  }, 20_000);
});
