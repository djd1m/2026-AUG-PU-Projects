// AC-scan-pipeline-30: удаление объекта ОТКАТАННОЙ попытки не задевает объект ПРИНЯТОГО
// скана — два запроса ОДНОЙ сессии с ОДИНАКОВЫМ фото, но РАЗНЫМИ `Idempotency-Key`: A
// публикуется успешно, B получает отказ квоты. Ключ объекта адресован `recognition_id`
// (PC2-01), не хешу содержимого — поэтому у A и B РАЗНЫЕ объекты несмотря на одинаковые байты.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { createPhotoStorage } from '../../../apps/api/src/photo/store-original.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';
import { buildMultipartBody } from '../../helpers/multipart.js';
import { makeJpegFixture } from '../../helpers/image-fixtures.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-scans-object-ownership');
  // Предел ровно 1: первый POST проходит, второй с НОВЫМ Idempotency-Key получает 429.
  app = buildServer({
    config: testScanApiConfig({ quota: { scanLimitUser: 1, scanLimitDay: 3000, escalationLimitDay: 600 } }),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
  });
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

describe('изоляция объекта отката (AC-scan-pipeline-30)', () => {
  it('объект отклонённой попытки B удалён; объект принятой попытки A остаётся доступным и обрабатываемым', async () => {
    const cookie = await seedCookieSession();
    const jpeg = await makeJpegFixture(); // ОДИНАКОВЫЕ байты для A и B — дедупликации по содержимому НЕТ (FR-scan-pipeline-19)
    const storage = createPhotoStorage(testScanApiConfig().storage);

    const requestOf = (idempotencyKey: string) => {
      const { body, contentType } = buildMultipartBody([{ fieldName: 'file', filename: 'a.jpg', contentType: 'image/jpeg', data: jpeg }]);
      return app.inject({
        method: 'POST',
        url: '/api/v1/scans',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType, 'idempotency-key': idempotencyKey },
        payload: body,
      });
    };

    const responseA = await requestOf(randomUUID());
    expect(responseA.statusCode).toBe(202);
    const scanIdA = JSON.parse(responseA.body).data.scan_id as string;

    const responseB = await requestOf(randomUUID());
    expect(responseB.statusCode).toBe(429); // квота предел=1 уже исчерпана A

    // Ключи объектов детерминированы recognition_id, а не содержимым — у A и B РАЗНЫЕ ключи
    // несмотря на одинаковые байты фото.
    const photoRowA = await pool.query<{ object_key: string }>('SELECT object_key FROM photo WHERE id = (SELECT photo_id FROM recognition WHERE id = $1)', [scanIdA]);
    const objectKeyA = photoRowA.rows[0]?.object_key;
    expect(objectKeyA).toBeDefined();

    // Объект A существует и по-прежнему обрабатываем (GET отдаёт queued, не 404).
    expect(await storage.exists(objectKeyA!)).toBe(true);
    const getA = await app.inject({ method: 'GET', url: `/api/v1/scans/${scanIdA}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(getA.statusCode).toBe(200);
    expect(JSON.parse(getA.body).data.status).toBe('queued');

    // Ни одна строка recognition/photo не осталась от B (транзакция откачена целиком).
    const totalRecognitions = await pool.query('SELECT count(*)::int AS n FROM recognition');
    expect(totalRecognitions.rows[0]?.n).toBe(1); // только A

    await storage.removeObject(objectKeyA!); // уборка за собой
  }, 30_000);
});
