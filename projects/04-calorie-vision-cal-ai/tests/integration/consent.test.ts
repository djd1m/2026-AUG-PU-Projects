// POST /api/v1/consent — GrantOrDeclineConsent (AC-consent-and-telegram-auth-8/9).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { computeConsentTextHash } from '../../apps/api/src/consent/known-versions.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-consent');
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

const HASH = computeConsentTextHash('2026-09-v1') ?? '';

describe('POST /api/v1/consent', () => {
  it('AC-8: анонимная сессия — grant записывается на device_session', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.30' } });
    const token = cookieValue(device.headers['set-cookie']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: HASH },
    });

    expect(response.statusCode).toBe(200);
    const session = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM device_session LIMIT 1');
    expect(session.rows[0]?.consent_at).not.toBeNull();
  });

  it('AC-8: сессия, связанная с аккаунтом — grant записывается на account', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.31' } });
    const token = cookieValue(device.headers['set-cookie']);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('910001') },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: '2026-09-v1', consent_text_hash: HASH },
    });

    expect(response.statusCode).toBe(200);
    const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account LIMIT 1');
    expect(account.rows[0]?.consent_at).not.toBeNull();
  });

  it('AC-9: decline не блокирует чтение результата, только запись дневника остаётся закрытой', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.32' } });
    const token = cookieValue(device.headers['set-cookie']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'decline', consent_version: '2026-09-v1', consent_text_hash: HASH },
    });

    expect(response.statusCode).toBe(200);
    const session = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM device_session LIMIT 1');
    expect(session.rows[0]?.consent_at).toBeNull();
  });

  it('AC-10: неизвестная версия текста отклоняется 422, account.consent_version не меняется', async () => {
    const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.33' } });
    const token = cookieValue(device.headers['set-cookie']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/consent',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
      payload: { decision: 'grant', consent_version: 'v99-does-not-exist', consent_text_hash: 'x' },
    });

    expect(response.statusCode).toBe(422);
    const session = await pool.query<{ consent_version: string | null }>('SELECT consent_version FROM device_session LIMIT 1');
    expect(session.rows[0]?.consent_version).toBeNull();
  });
});
