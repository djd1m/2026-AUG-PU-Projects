// Защита от повтора initData (FR-consent-and-telegram-auth-3, AC-consent-and-telegram-auth-5,
// DEC-A-016). Файл ОБЯЗАТЕЛЕН по имени — `04_refinement.md`, Testing Strategy.

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
  pool = await migratedPool('n4-tests-initdata-replay');
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

describe('повтор initData', () => {
  it('AC-5: повтор ТОЙ ЖЕ строки initData в пределах 24 ч отклоняется 401 initdata_replayed', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.20' } });
    const token = cookieValue(device.headers['set-cookie']);
    const initData = buildInitData('800001');

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });
    expect(first.statusCode).toBe(200);
    const accountId = (first.json() as { data: { account_id: string } }).data.account_id;

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    expect(second.statusCode).toBe(401);
    expect((second.json() as { error: { code: string } }).error.code).toBe('initdata_replayed');

    const accounts = await pool.query('SELECT count(*)::int AS n FROM account WHERE id = $1', [accountId]);
    expect(accounts.rows[0]?.n).toBe(1);
  });

  it('НОВАЯ initData того же telegram_user_id проходит как обычный вход, не блокируется', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.21' } });
    const token = cookieValue(device.headers['set-cookie']);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('800002') },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('800002', { authDateSecondsAgo: 5, queryId: 'second-login' }) },
    });

    expect(second.statusCode).toBe(200);
  });

  it('RV-03: A→B→A — повтор A ПОСЛЕ легитимного B тоже отклоняется (единственный слот раньше пропускал это)', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.22' } });
    const token = cookieValue(device.headers['set-cookie']);
    const initDataA = buildInitData('800003', { authDateSecondsAgo: 20, queryId: 'A' });
    const initDataB = buildInitData('800003', { authDateSecondsAgo: 10, queryId: 'B' });

    const loginA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initDataA },
    });
    expect(loginA.statusCode).toBe(200);

    const loginB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initDataB },
    });
    expect(loginB.statusCode).toBe(200);

    // Повтор A ПОСЛЕ B — раньше единственный слот last_telegram_auth_hash хранил только B, и
    // этот повтор A проходил бы как «новый» вход.
    const replayA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initDataA },
    });
    expect(replayA.statusCode).toBe(401);
    expect((replayA.json() as { error: { code: string } }).error.code).toBe('initdata_replayed');
  });

  it('RV-04: 401 (повтор) НЕ меняет БД — снимок device_session до и после совпадает', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.23' } });
    const token = cookieValue(device.headers['set-cookie']);
    const initData = buildInitData('800004');
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });

    const before = await pool.query('SELECT id, last_seen_at, account_id FROM device_session ORDER BY id');

    // Повтор С cookie — не должен обновлять last_seen_at существующей сессии.
    const replayWithCookie = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: initData },
    });
    expect(replayWithCookie.statusCode).toBe(401);

    // Повтор БЕЗ cookie (двадцать раз, имитация массового обстрела) — не должен создавать НИ
    // ОДНОЙ дополнительной строки device_session: заявка на повтор — ПЕРВАЯ мутация, раньше
    // создания/поиска сессии.
    await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/telegram',
          headers: { 'content-type': 'application/json' },
          payload: { init_data: initData },
        }),
      ),
    );

    const after = await pool.query('SELECT id, last_seen_at, account_id FROM device_session ORDER BY id');
    expect(after.rows).toEqual(before.rows);
  }, 30_000);
});
