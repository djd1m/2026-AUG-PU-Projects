// PartnerDashboard (AC-partner-codes-and-cabinet-15/16/18/19). Агрегация и честные нули —
// на функции `queryPartnerDashboard` напрямую (быстрее и точнее для чисел); аутентификация
// и `403` — на маршруте `GET /api/v1/partner/dashboard` через `app.inject` (реальный вход
// через Telegram, тот же приём, что `account-delete.test.ts`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { queryPartnerDashboard } from '../../../apps/api/src/partner/dashboard-query.js';
import { buildServer } from '../../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { testApiConfig } from '../../helpers/config.js';
import { buildInitData } from '../../helpers/telegram.js';
import { seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-dashboard');
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

/** Вход через Telegram — тот же приём, что `account-delete.test.ts`: реальный accountId и cookie. */
async function loggedInAccount(telegramUserId: string): Promise<{ token: string; accountId: string }> {
  const device = await app.inject({ method: 'POST', url: '/api/v1/auth/device', headers: { 'x-forwarded-for': '203.0.113.40' } });
  const token = cookieValue(device.headers['set-cookie']);
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/telegram',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json' },
    payload: { init_data: buildInitData(telegramUserId) },
  });
  const accountId = (login.json() as { data: { account_id: string } }).data.account_id;
  return { token, accountId };
}

async function seedEvents(pool: DbPool, partnerCodeId: string, counts: { card_view: number; install: number; activation: number; share_click: number }): Promise<void> {
  for (const [type, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i += 1) {
      const session = await seedDeviceSession(pool, `dash-${type}-${i}-${Math.random().toString(36).slice(2)}`);
      await pool.query('INSERT INTO growth_event (type, device_session_id, partner_code_id) VALUES ($1, $2, $3)', [type, session.id, partnerCodeId]);
    }
  }
}

describe('AC-partner-codes-and-cabinet-15: счётчики совпадают с посеянными growth_event', () => {
  it('window=day: РОВНО 5 card_view, 3 install, 2 activation, 1 share_click', async () => {
    const accountId = 'a0000000-0000-0000-0000-000000000015';
    await pool.query('INSERT INTO account (id, telegram_user_id) VALUES ($1, $2)', [accountId, '915000']);
    const partner = await seedPartner(pool, 'liza', accountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'DASH1111');
    await seedEvents(pool, code.id, { card_view: 5, install: 3, activation: 2, share_click: 1 });

    const outcome = await queryPartnerDashboard(pool, { accountId, window: 'day' });

    expect(outcome.outcome).toBe('ok');
    if (outcome.outcome !== 'ok') throw new Error('unreachable');
    expect(outcome.data.transitions).toBe(5);
    expect(outcome.data.installs).toBe(3);
    expect(outcome.data.activations).toBe(2);
    expect(outcome.data.shares).toBe(1);
    expect(outcome.data.no_data).toBe(false);
    expect(typeof outcome.data.updated_at).toBe('string');
  });
});

describe('AC-partner-codes-and-cabinet-16: не-партнёр получает 403 без утечки чужих счётчиков', () => {
  it('GET /api/v1/partner/dashboard: 403, тело не содержит числовых счётчиков', async () => {
    const { token } = await loggedInAccount('916000');
    // Вызывающий вошёл, но НЕ является партнёром — строки partner с его account_id нет.

    const response = await app.inject({ method: 'GET', url: '/api/v1/partner/dashboard', headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });

    expect(response.statusCode).toBe(403);
    const body = response.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(/"transitions"|"installs"|"activations"|"shares"/);
  });

  it('без входа — 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/partner/dashboard' });
    expect(response.statusCode).toBe(401);
  });

  it('через функцию напрямую: not_partner для неизвестного accountId', async () => {
    const outcome = await queryPartnerDashboard(pool, { accountId: '00000000-0000-0000-0000-000000000000', window: 'day' });
    expect(outcome).toEqual({ outcome: 'not_partner' });
  });
});

describe('AC-partner-codes-and-cabinet-18: честные нули и раздельные метрики', () => {
  it('ноль наблюдений по коду → явные нули с no_data=true', async () => {
    const accountId = 'a0000000-0000-0000-0000-000000000018';
    await pool.query('INSERT INTO account (id, telegram_user_id) VALUES ($1, $2)', [accountId, '918000']);
    const partner = await seedPartner(pool, 'liza', accountId);
    await seedPartnerCode(pool, partner.partnerId, 'EMPTY111');

    const outcome = await queryPartnerDashboard(pool, { accountId, window: 'day' });
    expect(outcome.outcome).toBe('ok');
    if (outcome.outcome !== 'ok') throw new Error('unreachable');
    expect(outcome.data).toMatchObject({ transitions: 0, installs: 0, activations: 0, shares: 0, no_data: true });
    expect(outcome.data.i).toEqual({ insufficient_data: [0, 30] });
    expect(outcome.data.conv).toEqual({ insufficient_data: [0, 30] });
  });

  it('число наблюдений 12 (< 30) → строка "недостаточно данных", i и conv раздельные поля без произведения', async () => {
    const accountId = 'a0000000-0000-0000-0000-000000000019';
    await pool.query('INSERT INTO account (id, telegram_user_id) VALUES ($1, $2)', [accountId, '919000']);
    const partner = await seedPartner(pool, 'liza', accountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'PARTIAL1');
    await seedEvents(pool, code.id, { card_view: 12, install: 4, activation: 12, share_click: 2 });

    const outcome = await queryPartnerDashboard(pool, { accountId, window: 'day' });
    expect(outcome.outcome).toBe('ok');
    if (outcome.outcome !== 'ok') throw new Error('unreachable');
    // activations=12 < 30 → i недостаточно данных; transitions=12 < 30 → conv недостаточно данных.
    expect(outcome.data.i).toEqual({ insufficient_data: [12, 30] });
    expect(outcome.data.conv).toEqual({ insufficient_data: [12, 30] });
  });
});

describe('AC-partner-codes-and-cabinet-19: в ответе кабинета нет денежных полей', () => {
  it('ни одно из закрытого списка имён (payout, rate, price, earnings, balance, commission) не встречается в JSON-дереве ответа', async () => {
    const accountId = 'a0000000-0000-0000-0000-000000000020';
    await pool.query('INSERT INTO account (id, telegram_user_id) VALUES ($1, $2)', [accountId, '920000']);
    const partner = await seedPartner(pool, 'liza', accountId);
    const code = await seedPartnerCode(pool, partner.partnerId, 'MONEY111');
    await seedEvents(pool, code.id, { card_view: 40, install: 40, activation: 40, share_click: 40 });

    const outcome = await queryPartnerDashboard(pool, { accountId, window: 'all' });
    expect(outcome.outcome).toBe('ok');
    const serialized = JSON.stringify(outcome);
    for (const forbidden of ['payout', 'rate', 'price', 'earnings', 'balance', 'commission']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
