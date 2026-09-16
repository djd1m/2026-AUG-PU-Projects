// Кабинеты: деньги партнёра (FR-CAB-1) и кабинет владельца (FR-CAB-2/3), AC-9, AC-18, AC-19.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createFakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';

const OWNER_TELEGRAM_ID = 777_000_111;

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-cabinets');
  app = buildServer({
    config: testScanApiConfig(),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
    payments: createFakePaymentProvider(),
    ownerTelegramUserIds: [OWNER_TELEGRAM_ID],
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

async function seedAccount(telegramUserId: number): Promise<{ token: string; accountId: string }> {
  const token = generateSessionToken();
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, status) VALUES ($1, 'active') RETURNING id`,
    [telegramUserId],
  );
  await pool.query(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, account_id, anonymous_diary_expires_at)
     VALUES ($1, '203.0.113.0/24', $2, now() + interval '7 days')`,
    [hashSessionToken(token), account.rows[0]!.id],
  );
  return { token, accountId: account.rows[0]!.id };
}

async function seedPartnerWithEntries(accountId: string | null): Promise<string> {
  const partner = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact, account_id) VALUES ('Блогер', 'tg:@b', $1) RETURNING id`,
    [accountId],
  );
  const partnerId = partner.rows[0]!.id;
  // Зрелое начисление и незрелое: кабинет обязан различать их ДО даты выплаты.
  await pool.query(
    `INSERT INTO commission_entry (partner_id, kind, amount_minor, available_at)
     VALUES ($1, 'accrual', 48500, now() - interval '1 day'),
            ($1, 'accrual', 32500, now() + interval '60 days')`,
    [partnerId],
  );
  return partnerId;
}

describe('кабинет партнёра', () => {
  it('показывает баланс, доступное и ПЕРЕНЕСЁННОЕ отдельно (ADR-014)', async () => {
    const { token, accountId } = await seedAccount(1001);
    await seedPartnerWithEntries(accountId);

    const response = await app.inject({ method: 'GET', url: '/api/v1/partner/earnings', cookies: { [SESSION_COOKIE_NAME]: token } });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body).data;

    expect(data.balance_minor).toBe(81_000);
    expect(data.due_next_payout_minor).toBe(48_500);
    expect(data.deferred_to_following_minor).toBe(32_500);
    // Ничего не исчезло: показанные суммы в сумме дают баланс.
    expect(data.due_next_payout_minor + data.deferred_to_following_minor).toBe(data.balance_minor);
    expect(new Date(data.next_payout_date).getUTCDate()).toBeGreaterThanOrEqual(4);
  });

  it('не раскрывает, КТО заплатил: в записях нет ни аккаунта, ни платежа', async () => {
    const { token, accountId } = await seedAccount(1002);
    await seedPartnerWithEntries(accountId);
    const response = await app.inject({ method: 'GET', url: '/api/v1/partner/earnings', cookies: { [SESSION_COOKIE_NAME]: token } });
    const body = response.body;
    expect(body).not.toMatch(/account_id|payment_id|telegram_user_id/);
  });

  it('не-партнёр получает 403, а не чужие деньги', async () => {
    const { token } = await seedAccount(1003);
    await seedPartnerWithEntries(null);
    const response = await app.inject({ method: 'GET', url: '/api/v1/partner/earnings', cookies: { [SESSION_COOKIE_NAME]: token } });
    expect(response.statusCode).toBe(403);
  });
});

describe('кабинет владельца', () => {
  it('ПУСТОЙ список владельцев закрывает кабинет ВСЕМ, а не открывает всем', async () => {
    // Боевое значение списка — ПУСТОЕ (владельцы вносятся вручную). Значит именно этот путь
    // и работает в проде, и именно он обязан быть проверен: пустой список, прочитанный как
    // «ограничений нет», отдал бы кабинет с деньгами первому вошедшему.
    const closed = buildServer({
      config: testScanApiConfig(),
      pool,
      logger: createLogger({ service: 'api-test', sink: () => {} }),
      payments: createFakePaymentProvider(),
      ownerTelegramUserIds: [],
    });
    await closed.ready();
    try {
      const { token } = await seedAccount(3001);
      const response = await closed.inject({ method: 'GET', url: '/api/v1/admin/overview', cookies: { [SESSION_COOKIE_NAME]: token } });
      expect(response.statusCode).toBe(404);
    } finally {
      await closed.close();
    }
  });

  it('обычный аккаунт получает 404, а не 403: существование кабинета не подтверждается (AC-18)', async () => {
    const { token } = await seedAccount(2001);
    for (const url of ['/api/v1/admin/overview', '/api/v1/admin/payouts']) {
      const response = await app.inject({ method: url.endsWith('payouts') ? 'POST' : 'GET', url, cookies: { [SESSION_COOKIE_NAME]: token }, payload: {} });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it('владелец видит выручку, подписки и балансы партнёров', async () => {
    const { token } = await seedAccount(OWNER_TELEGRAM_ID);
    await seedPartnerWithEntries(null);
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/overview', cookies: { [SESSION_COOKIE_NAME]: token } });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body).data;
    expect(data.partners).toHaveLength(1);
    expect(data.partners[0].balance_minor).toBe(81_000);
    expect(data.partners[0].available_minor).toBe(48_500);
  });

  it('выплата сверх доступного отвергается с НАЗВАННОЙ доступной суммой (AC-9)', async () => {
    const { token } = await seedAccount(OWNER_TELEGRAM_ID);
    const partnerId = await seedPartnerWithEntries(null);
    const response = await app.inject({
      method: 'POST', url: '/api/v1/admin/payouts', cookies: { [SESSION_COOKIE_NAME]: token },
      payload: { partner_id: partnerId, amount_minor: 81_000, payout_key: '2026-10-05' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toMatch(/48500/);
  });

  it('выплата записывается и уменьшает доступное; повтор того же ключа не платит дважды', async () => {
    const { token } = await seedAccount(OWNER_TELEGRAM_ID);
    const partnerId = await seedPartnerWithEntries(null);
    const payload = { partner_id: partnerId, amount_minor: 48_500, payout_key: '2026-10-05' };

    const first = await app.inject({ method: 'POST', url: '/api/v1/admin/payouts', cookies: { [SESSION_COOKIE_NAME]: token }, payload });
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.body).data.available_after_minor).toBe(0);

    const second = await app.inject({ method: 'POST', url: '/api/v1/admin/payouts', cookies: { [SESSION_COOKIE_NAME]: token }, payload });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).data.recorded).toBe(false);

    const payouts = await pool.query<{ c: string }>(`SELECT count(*) c FROM commission_entry WHERE kind = 'payout'`);
    expect(Number(payouts.rows[0]!.c)).toBe(1);
  });
});
