// Конкурентные прогоны `POST /api/v1/scans` — AC-scan-pipeline-6 (идемпотентность) и
// AC-scan-pipeline-8 (потолок пользователя, 20 при пределе 10). Последовательный тест
// зеленеет при обеих реализациях; различает их только конкурентный прогон
// (`shared-resource-verification.md`).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';
import { buildMultipartBody } from '../helpers/multipart.js';
import { makeJpegFixture } from '../helpers/image-fixtures.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-scans-concurrency');
}, 60_000);

afterAll(async () => {
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

describe('конкурентная идемпотентность (AC-scan-pipeline-6)', () => {
  it('два одновременных POST с одним Idempotency-Key дают ОДИН и тот же scan_id, ровно одна строка в базе', async () => {
    const app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
    await app.ready();
    try {
      const cookie = await seedCookieSession();
      const jpeg = await makeJpegFixture();
      const key = randomUUID();
      const { body, contentType } = buildMultipartBody([{ fieldName: 'file', filename: 'a.jpg', contentType: 'image/jpeg', data: jpeg }]);
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType, 'idempotency-key': key };

      const [first, second] = await Promise.all([
        app.inject({ method: 'POST', url: '/api/v1/scans', headers, payload: body }),
        app.inject({ method: 'POST', url: '/api/v1/scans', headers, payload: body }),
      ]);

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      const scanIds = new Set([JSON.parse(first.body).data.scan_id, JSON.parse(second.body).data.scan_id]);
      expect(scanIds.size).toBe(1);

      const rows = await pool.query('SELECT count(*)::int AS n FROM recognition WHERE idempotency_key = $1', [key]);
      expect(rows.rows[0]?.n).toBe(1);

      const quota = await pool.query("SELECT used FROM scan_quota_counter WHERE scope = 'global'");
      expect(quota.rows[0]?.used).toBe(1); // ровно ОДИН оплаченный вызов, не два
    } finally {
      await app.close();
    }
  }, 30_000);
});

describe('конкурентный потолок пользователя (AC-scan-pipeline-8: 20 при пределе 10)', () => {
  it('ровно 10 получают 202, ровно 10 получают 429(scope=user), used = 10', async () => {
    const app = buildServer({
      config: testScanApiConfig({ quota: { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 } }),
      pool,
      logger: createLogger({ service: 'api-test', sink: () => {} }),
    });
    await app.ready();
    try {
      const cookie = await seedCookieSession();
      const jpeg = await makeJpegFixture();

      const requests = Array.from({ length: 20 }, () => {
        const { body, contentType } = buildMultipartBody([{ fieldName: 'file', filename: 'a.jpg', contentType: 'image/jpeg', data: jpeg }]);
        return app.inject({
          method: 'POST',
          url: '/api/v1/scans',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': contentType, 'idempotency-key': randomUUID() },
          payload: body,
        });
      });

      const responses = await Promise.all(requests);
      const accepted = responses.filter((r) => r.statusCode === 202);
      const refused = responses.filter((r) => r.statusCode === 429);

      expect(accepted).toHaveLength(10);
      expect(refused).toHaveLength(10);
      // Ни одна попытка не потеряна и не посчитана дважды: 10 + 10 = 20.
      expect(accepted.length + refused.length).toBe(20);

      // Оба ключа scope='user' (сессия И ip_prefix, `quotaKeys`) несут used = 10 — ровно
      // предел, ни больше и ни меньше; ни один посчитан отдельно от другого.
      const quota = await pool.query("SELECT used FROM scan_quota_counter WHERE scope = 'user'");
      expect(quota.rows).toHaveLength(2);
      for (const row of quota.rows as Array<{ used: number }>) expect(row.used).toBe(10);

      const rows = await pool.query('SELECT count(*)::int AS n FROM recognition');
      expect(rows.rows[0]?.n).toBe(10);
      for (const response of refused) {
        expect(JSON.parse(response.body).error.details.scope).toBe('user');
      }
    } finally {
      await app.close();
    }
  }, 60_000);
});
