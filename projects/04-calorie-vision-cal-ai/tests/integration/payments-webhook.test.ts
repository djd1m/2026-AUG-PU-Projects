// `POST /api/v1/webhooks/payments/{provider}` — AC-2, AC-4, AC-6, AC-7, AC-10, AC-19.
//
// На НАСТОЯЩЕЙ базе (`n4_test`, DEC-A-056): проверяются уникальный индекс, транзакция и
// поведение под повтором — ровно то, чего у мока нет.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { createFakePaymentProvider, type FakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testScanApiConfig } from '../helpers/scan-config.js';

let pool: DbPool;
let app: FastifyInstance;
let payments: FakePaymentProvider;

const YOOKASSA_IP = '185.71.76.5';

function buildApp(provider: FakePaymentProvider): FastifyInstance {
  return buildServer({
    config: testScanApiConfig(),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
    payments: provider,
  });
}

beforeAll(async () => {
  pool = await migratedPool('n4-tests-payments-webhook');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  await app?.close();
  payments = createFakePaymentProvider({ feeBp: 300 });
  app = buildApp(payments);
  await app.ready();
});

interface Seeded {
  readonly token: string;
  readonly accountId: string;
  readonly partnerId: string;
}

/** Аккаунт с активированной атрибуцией к партнёру — минимум, при котором комиссия возможна. */
async function seedPayer(options: { readonly selfReferral?: boolean } = {}): Promise<Seeded> {
  const token = generateSessionToken();
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, status) VALUES ($1, 'active') RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)],
  );
  const accountId = account.rows[0]!.id;
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, account_id, anonymous_diary_expires_at)
     VALUES ($1, '203.0.113.0/24', $2, now() + interval '7 days') RETURNING id`,
    [hashSessionToken(token), accountId],
  );
  const partnerAccountId = options.selfReferral === true ? accountId : null;
  const partner = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact, account_id) VALUES ('Блогер', 'tg:@blogger', $1) RETURNING id`,
    [partnerAccountId],
  );
  const partnerId = partner.rows[0]!.id;
  const code = await pool.query<{ id: string }>(
    `INSERT INTO partner_code (partner_id, code, status) VALUES ($1, $2, 'active') RETURNING id`,
    [partnerId, `CODE${Math.floor(Math.random() * 100000)}`],
  );
  await pool.query(
    `INSERT INTO attribution (device_session_id, partner_code_id, status, source)
     VALUES ($1, $2, 'activated', 'explicit')`,
    [session.rows[0]!.id, code.rows[0]!.id],
  );
  return { token, accountId, partnerId };
}

async function checkout(token: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/subscription/checkout',
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { idempotency_key: randomUUID() },
  });
  expect(response.statusCode).toBe(201);
  return JSON.parse(response.body).data.intent_id as string;
}

async function deliver(body: Uint8Array): Promise<{ statusCode: number; body: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payments/fake',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': YOOKASSA_IP },
    payload: Buffer.from(body),
    remoteAddress: YOOKASSA_IP,
  });
  return { statusCode: response.statusCode, body: response.body };
}

async function counts(): Promise<{ payments: number; accruals: number; balance: number }> {
  const p = await pool.query<{ c: string }>(`SELECT count(*) c FROM payment`);
  const a = await pool.query<{ c: string }>(`SELECT count(*) c FROM commission_entry WHERE kind = 'accrual'`);
  const b = await pool.query<{ s: string | null }>(`SELECT sum(amount_minor) s FROM commission_entry`);
  return { payments: Number(p.rows[0]!.c), accruals: Number(a.rows[0]!.c), balance: Number(b.rows[0]!.s ?? 0) };
}

describe('вебхук оплаты', () => {
  it('успешный платёж создаёт подписку, платёж и начисление 50 % от ПОЛУЧЕННОГО', async () => {
    const payer = await seedPayer();
    const intentId = await checkout(payer.token);
    const payment = await payments.getPaymentByOrder(intentId);

    const response = await deliver(payments.notificationFor(payment.id, 'payment_succeeded'));
    expect(response.statusCode).toBe(200);

    const state = await counts();
    expect(state.payments).toBe(1);
    expect(state.accruals).toBe(1);
    // 100 000 копеек, удержание 3 % = 3000 → получено 97 000, комиссия 48 500.
    expect(state.balance).toBe(48_500);

    const subscription = await pool.query<{ status: string }>(`SELECT status::text AS status FROM subscription`);
    expect(subscription.rows[0]!.status).toBe('active');
  });

  it('ПОВТОРНАЯ доставка того же события даёт ОДИН платёж и ОДНО начисление (AC-2)', async () => {
    const payer = await seedPayer();
    const intentId = await checkout(payer.token);
    const payment = await payments.getPaymentByOrder(intentId);
    const body = payments.notificationFor(payment.id, 'payment_succeeded');

    expect((await deliver(body)).statusCode).toBe(200);
    expect((await deliver(body)).statusCode).toBe(200);
    expect((await deliver(body)).statusCode).toBe(200);

    const state = await counts();
    expect(state.payments).toBe(1);
    expect(state.accruals).toBe(1);
    expect(state.balance).toBe(48_500);
  });

  it('возврат порождает компенсирующую запись, баланс обнуляется, история цела (AC-7)', async () => {
    const payer = await seedPayer();
    const intentId = await checkout(payer.token);
    const payment = await payments.getPaymentByOrder(intentId);
    await deliver(payments.notificationFor(payment.id, 'payment_succeeded'));

    payments.refund(payment.id);
    expect((await deliver(payments.notificationFor(payment.id, 'refund_succeeded'))).statusCode).toBe(200);

    const state = await counts();
    expect(state.balance).toBe(0);
    const entries = await pool.query<{ kind: string }>(`SELECT kind::text AS kind FROM commission_entry ORDER BY created_at`);
    // ДВЕ записи, а не изменённая одна: леджер только дополняется (ADR-013).
    expect(entries.rows.map((r) => r.kind)).toEqual(['accrual', 'clawback']);

    const subscription = await pool.query<{ status: string }>(`SELECT status::text AS status FROM subscription`);
    expect(subscription.rows[0]!.status).toBe('expired');
  });

  it('самореферал не получает комиссии, но платёж принимается (AC-10)', async () => {
    const payer = await seedPayer({ selfReferral: true });
    const intentId = await checkout(payer.token);
    const payment = await payments.getPaymentByOrder(intentId);
    await deliver(payments.notificationFor(payment.id, 'payment_succeeded'));

    const state = await counts();
    expect(state.payments).toBe(1);
    expect(state.accruals).toBe(0);
  });

  it('уведомление о неизвестном платеже отвергается 400 и НИЧЕГО не пишет', async () => {
    await seedPayer();
    const forged = Buffer.from(JSON.stringify({
      type: 'notification', event: 'payment.succeeded',
      object: { id: 'pay99999999-0000-4000-8000-000000000000' },
    }), 'utf8');
    expect((await deliver(forged)).statusCode).toBe(400);
    expect(await counts()).toEqual({ payments: 0, accruals: 0, balance: 0 });
  });

  it('недоступность провайдера даёт РЕТРАИБЕЛЬНЫЙ 503 и не занимает ключ повторности (AC-6)', async () => {
    const payer = await seedPayer();
    const intentId = await checkout(payer.token);
    const payment = await payments.getPaymentByOrder(intentId);
    const body = payments.notificationFor(payment.id, 'payment_succeeded');

    // Провайдер падает на перезапросе.
    await app.close();
    const broken = createFakePaymentProvider({ feeBp: 300, unavailable: true });
    broken.adoptStateFrom(payments);
    app = buildApp(broken);
    await app.ready();
    expect((await deliver(body)).statusCode).toBe(503);
    expect(await counts()).toEqual({ payments: 0, accruals: 0, balance: 0 });
    const claimed = await pool.query<{ c: string }>(`SELECT count(*) c FROM payment_event`);
    expect(Number(claimed.rows[0]!.c)).toBe(0);

    // Провайдер вернулся — ПОВТОР обязан пройти по ПОЛНОМУ пути, а не упереться в занятый ключ.
    await app.close();
    app = buildApp(payments);
    await app.ready();
    expect((await deliver(body)).statusCode).toBe(200);
    const state = await counts();
    expect(state.payments).toBe(1);
    expect(state.accruals).toBe(1);
  });
});
