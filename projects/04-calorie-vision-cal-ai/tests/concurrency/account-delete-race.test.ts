// Два параллельных erase_all (AC-consent-and-telegram-auth-14, shared-resource-verification).
// Последовательный тест на «второй erase_all получает 409» зеленеет и при реализации без
// блокировки строки — гонка обязана быть создана НАМЕРЕННО, конкурентным Promise.all.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-account-delete-race');
  app = buildServer({ config: testApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function cookieValue(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (raw === undefined) throw new Error('Set-Cookie отсутствует');
  return raw.split(';')[0]?.split('=')[1] ?? '';
}

describe('два конкурентных erase_all от одного аккаунта', () => {
  it('ровно один переход active → erasing, второй получает 409, дедлайн один', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.50' } });
    const token = cookieValue(device.headers['set-cookie']);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('940001') },
    });

    const [responseA, responseB] = await Promise.all([
      app.inject({
        method: 'DELETE',
        url: '/api/v1/account',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
        payload: { confirm: true, scope: 'erase_all' },
      }),
      app.inject({
        method: 'DELETE',
        url: '/api/v1/account',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
        payload: { confirm: true, scope: 'erase_all' },
      }),
    ]);

    const statuses = [responseA.statusCode, responseB.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const account = await pool.query<{ status: string }>(
      `SELECT status FROM account WHERE telegram_user_id = $1`,
      ['940001'],
    );
    expect(account.rows[0]?.status).toBe('erasing');
  }, 30_000);
});
