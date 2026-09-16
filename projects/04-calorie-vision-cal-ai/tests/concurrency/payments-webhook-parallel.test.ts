// AC-3: ДВЕ ОДНОВРЕМЕННЫЕ доставки одного события дают ОДИН платёж и ОДНО начисление.
//
// Почему отдельно от последовательного повтора, который уже зелёный: последовательный тест
// зеленеет при ОБЕИХ реализациях — и при атомарной вставке, и при «прочитать, потом
// записать». Различает их только параллельный прогон, потому что обе попытки не находят
// ключа и обе пишут (`shared-resource-verification.md`). Платёжные системы доставляют
// событие несколько раз ПО ПОСТРОЕНИЮ, и две попытки приезжают одновременно штатно.

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

const PARALLEL_DELIVERIES = 20;
const YOOKASSA_IP = '185.71.76.5';

let pool: DbPool;
let app: FastifyInstance;
let payments: FakePaymentProvider;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-webhook-parallel');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  await app?.close();
  payments = createFakePaymentProvider({ feeBp: 300 });
  app = buildServer({
    config: testScanApiConfig(),
    pool,
    logger: createLogger({ service: 'api-test', sink: () => {} }),
    payments,
  });
  await app.ready();
});

async function seedPayerAndPay(): Promise<Uint8Array> {
  const token = generateSessionToken();
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, status) VALUES ($1, 'active') RETURNING id`,
    [Math.floor(Math.random() * 1_000_000_000)],
  );
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, account_id, anonymous_diary_expires_at)
     VALUES ($1, '203.0.113.0/24', $2, now() + interval '7 days') RETURNING id`,
    [hashSessionToken(token), account.rows[0]!.id],
  );
  const partner = await pool.query<{ id: string }>(
    `INSERT INTO partner (display_name, contact) VALUES ('Блогер', 'tg:@blogger') RETURNING id`,
  );
  const code = await pool.query<{ id: string }>(
    `INSERT INTO partner_code (partner_id, code) VALUES ($1, $2) RETURNING id`,
    [partner.rows[0]!.id, `CODE${Math.floor(Math.random() * 100000)}`],
  );
  await pool.query(
    `INSERT INTO attribution (device_session_id, partner_code_id, status, source)
     VALUES ($1, $2, 'activated', 'explicit')`,
    [session.rows[0]!.id, code.rows[0]!.id],
  );

  const checkout = await app.inject({
    method: 'POST',
    url: '/api/v1/subscription/checkout',
    cookies: { [SESSION_COOKIE_NAME]: token },
    payload: { idempotency_key: randomUUID() },
  });
  const intentId = JSON.parse(checkout.body).data.intent_id as string;
  const payment = await payments.getPaymentByOrder(intentId);
  return payments.notificationFor(payment.id, 'payment_succeeded');
}

describe('одновременная доставка одного события (AC-3)', () => {
  it(`${PARALLEL_DELIVERIES} одновременных доставок → ОДИН платёж, ОДНО начисление, баланс не умножен`, async () => {
    const body = await seedPayerAndPay();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL_DELIVERIES }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/payments/fake',
          headers: { 'content-type': 'application/json' },
          payload: Buffer.from(body),
          remoteAddress: YOOKASSA_IP,
        }),
      ),
    );

    // Ни одна доставка не завершается неучтённой ошибкой: повтор — это 200, а не 500.
    // Провайдер, получивший 500, будет ретраить, и «дубль» превратится в бесконечный цикл.
    expect(responses.map((r) => r.statusCode)).toEqual(Array(PARALLEL_DELIVERIES).fill(200));

    const payments_ = await pool.query<{ c: string }>(`SELECT count(*) c FROM payment`);
    const accruals = await pool.query<{ c: string }>(`SELECT count(*) c FROM commission_entry WHERE kind = 'accrual'`);
    const events = await pool.query<{ c: string }>(`SELECT count(*) c FROM payment_event`);
    const balance = await pool.query<{ s: string | null }>(`SELECT sum(amount_minor) s FROM commission_entry`);

    expect(Number(payments_.rows[0]!.c)).toBe(1);
    expect(Number(accruals.rows[0]!.c)).toBe(1);
    expect(Number(events.rows[0]!.c)).toBe(1);
    expect(Number(balance.rows[0]!.s ?? 0)).toBe(48_500);

    // Подписка продлена ОДИН раз, а не двадцать: иначе человек получил бы 600 дней за одну оплату.
    const subscription = await pool.query<{ days: string }>(
      `SELECT round(extract(epoch FROM (current_period_end - current_period_start)) / 86400) AS days FROM subscription`,
    );
    expect(Number(subscription.rows[0]!.days)).toBe(30);
  }, 60_000);
});
