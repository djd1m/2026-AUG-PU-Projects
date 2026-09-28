// Фича 30 payments на НАСТОЯЩЕМ PostgreSQL 16 (донор — N6 tests/billing.integration.test.ts, адаптировано): маршруты оплаты
// по боевой связке createBillingDependencies. Подменены только провайдер (НАСТОЯЩИЙ адаптер ЮKassa на подменном
// HTTP-сервере, либо фейк) и ограничители. AC-1…AC-9 плана docs/features/payments/01_plan.md; incoming-webhooks: подделка,
// повтор (дважды и 20 одновременных), перестановка; security-operation-order: недоступность ЮKassa → 503 без записи →
// повтор проходит полным путём.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createBillingDependencies } from '../apps/web/src/server/billing-deps';
import { createCheckoutHandler, createCheckoutStatusHandler, createPaymentWebhookHandler } from '../apps/web/src/server/billing-handler';
import { createYooKassaProvider } from '../apps/web/src/server/payments/yookassa';
import { createFakePaymentProvider } from '../apps/web/src/server/payments/fake';
import type { PaymentProvider } from '../apps/web/src/server/payments/provider';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { SECRET, SHOP_ID, startFakeYooKassa, type FakeYooKassa } from './fixtures/fake-yookassa-server';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://clipmkr.test.invalid';
const YOOKASSA_IP = '185.71.76.10';
// Цепочка, как её видит web на стенде: клиент, внешний прокси машины, Caddy проекта (N5_TRUSTED_PROXY_HOPS=2).
const xff = (ip: string) => `${ip}, 10.0.0.2, 10.0.0.3`;
const DAY = 86_400_000;
type Json = { data?: Record<string, unknown>; error?: { code: string; message: string } };

describe.skipIf(!databaseUrl)('оплата ЮKassa на настоящем PostgreSQL', () => {
  let pool: Pool;
  let yk: FakeYooKassa;
  const schema = `billing_${randomBytes(8).toString('hex')}`;
  const sessions = new Map<string, string>();
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    yk = await startFakeYooKassa();
  }, 60_000);
  afterAll(async () => { await yk?.close(); if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const yookassa = () => createYooKassaProvider({ shopId: SHOP_ID, secretKey: SECRET, testMode: true, apiBase: yk.apiBase });
  function wire(provider: PaymentProvider | null = yookassa()) {
    const deps = createBillingDependencies({ pool, publicOrigin: PUBLIC, trustedProxyHops: 2, provider, allowMutation: async () => true,
      allowRead: async () => true, authenticate: async (token) => (sessions.has(token) ? { account_id: sessions.get(token)! } : null), log: () => {} });
    const call = async (handler: (r: Request) => Promise<Response>, url: string, init: RequestInit) => {
      const r = await handler(new Request(url, init));
      return { status: r.status, body: await r.json() as Json };
    };
    return {
      checkout: (token: string, payload: unknown) => call(createCheckoutHandler(deps), `${PUBLIC}/api/checkout`, { method: 'POST',
        headers: { origin: PUBLIC, cookie: `__Host-n5_session=${token}`, 'content-type': 'application/json', 'x-forwarded-for': xff('198.51.100.7') }, body: JSON.stringify(payload) }),
      status: async (token: string, intent: string) => {
        const r = await createCheckoutStatusHandler(deps)(new Request(`${PUBLIC}/api/checkout/${intent}`, { headers: { cookie: `__Host-n5_session=${token}`, 'x-forwarded-for': xff('198.51.100.7') } }), intent);
        return { status: r.status, body: await r.json() as Json };
      },
      notify: (raw: string, ip = YOOKASSA_IP) => call(createPaymentWebhookHandler(deps), `${PUBLIC}/api/webhooks/yookassa`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': xff(ip) }, body: raw }),
    };
  }
  async function account(plan = 'free') {
    const id = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
      [`b${randomBytes(6).toString('hex')}@example.ru`, plan])).rows[0]!.id;
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, id);
    return { id, token };
  }
  const billing = async (id: string) => (await pool.query<{ plan: string; plan_source: string; plan_paid_until: Date | null; now: Date }>(
    'SELECT plan, plan_source, plan_paid_until, now() AS now FROM account WHERE id = $1', [id])).rows[0]!;
  const count = async (sql: string, params: unknown[] = []) => Number((await pool.query<{ n: number }>(sql, params)).rows[0]!.n);
  const key = () => randomBytes(12).toString('base64url');
  const days = (b: { plan_paid_until: Date | null; now: Date }) => Math.round((b.plan_paid_until!.getTime() - b.now.getTime()) / DAY);
  // Оформить и «оплатить» у подменной ЮKassa: id платежа у провайдера и id намерения.
  async function paid(a: { token: string }, w = wire()) {
    const r = await w.checkout(a.token, { idempotency_key: key() });
    expect(r.status).toBe(201);
    const intent = r.body.data!.intent_id as string;
    const payment = yk.byOrder(intent)!;
    yk.pay(payment.id);
    return { intent, paymentId: payment.id };
  }

  it('AC-1: оплата выключена — оформление, опрос и вебхук 404, намерений нет', async () => {
    const w = wire(null);
    const a = await account();
    expect((await w.checkout(a.token, { idempotency_key: key() })).status).toBe(404);
    expect((await w.notify('{}')).status).toBe(404);
    expect(await count('SELECT count(*)::int AS n FROM payment_intent WHERE account_id = $1', [a.id])).toBe(0);
  });

  it('AC-2: намерение создаётся ДО провайдера; повтор с тем же ключом — то же намерение и ОДИН платёж у ЮKassa; цена из кода', async () => {
    const a = await account();
    let seenBeforeProvider = -1;
    const real = yookassa();
    const spy: PaymentProvider = { ...real, name: real.name, createPayment: async (input) => {
      seenBeforeProvider = await count('SELECT count(*)::int AS n FROM payment_intent WHERE id = $1', [input.orderId]);
      return real.createPayment(input);
    } };
    const w = wire(spy);
    const k = key();
    const before = yk.created;
    const first = await w.checkout(a.token, { idempotency_key: k });
    expect(first.status).toBe(201);
    expect(seenBeforeProvider).toBe(1);
    expect(String(first.body.data!.redirect_url)).toMatch(/^https:\/\/yoomoney\.example\//);
    const second = await w.checkout(a.token, { idempotency_key: k });
    expect(second.body.data!.intent_id).toBe(first.body.data!.intent_id);
    expect(second.body.data!.redirect_url).toBe(first.body.data!.redirect_url);
    expect(yk.created - before).toBe(1);
    expect(yk.byOrder(first.body.data!.intent_id as string)!.amount.value).toBe('990.00');
    expect((await w.checkout(a.token, { idempotency_key: 'short' })).status).toBe(422);
    // Стирающийся аккаунт намерения не получает (AC-9, сторона оформления).
    await pool.query(`UPDATE account SET status = 'erasing' WHERE id = $1`, [a.id]);
    expect((await w.checkout(a.token, { idempotency_key: key() })).body.error?.code).toBe('unauthorized');
    expect(await count(`SELECT count(*)::int AS n FROM payment_intent WHERE account_id = $1`, [a.id])).toBe(1);
  });

  it('AC-3: уведомление об успехе → paid, источник payment, срок now()+30 сут, намерение succeeded; чужое намерение — 404', async () => {
    const w = wire();
    const a = await account();
    const { intent, paymentId } = await paid(a, w);
    const r = await w.notify(yk.notification(paymentId));
    expect(r.body.data).toMatchObject({ applied: true, plan: 'paid' });
    const b = await billing(a.id);
    expect([b.plan, b.plan_source]).toEqual(['paid', 'payment']);
    expect(Math.abs(b.plan_paid_until!.getTime() - b.now.getTime() - 30 * DAY)).toBeLessThan(60_000);
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'succeeded', account_plan: 'paid' });
    const other = await account();
    expect((await w.status(other.token, intent)).status).toBe(404);
  });

  it('AC-4 повтор: одно событие дважды — срок +30, не +60; 20 одновременных доставок — ОДНО применение, одна строка payment', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    const raw = yk.notification(paymentId);
    expect((await w.notify(raw)).body.data).toMatchObject({ applied: true });
    const once = (await billing(a.id)).plan_paid_until!.getTime();
    expect((await w.notify(raw)).body.data).toEqual({ applied: false, reason: 'duplicate' });
    expect((await billing(a.id)).plan_paid_until!.getTime()).toBe(once);
    const c = await account();
    const second = await paid(c, w);
    const burst = await Promise.all(Array.from({ length: 20 }, () => w.notify(yk.notification(second.paymentId))));
    expect(burst.every((r) => r.status === 200)).toBe(true);
    expect(burst.filter((r) => r.body.data?.applied === true)).toHaveLength(1);
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${second.paymentId}`])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM payment WHERE provider_payment_id = $1`, [second.paymentId])).toBe(1);
    expect(days(await billing(c.id))).toBe(30);
  });

  it('AC-5 подделка: чужой IP, неоплаченный платёж, сумма перезапроса ≠ заявленной — 400 и ни одной записи; настоящее уведомление после подделки применяется', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    const raw = yk.notification(paymentId);
    expect((await w.notify(raw, '203.0.113.9')).body.error?.code).toBe('verification_failed');
    yk.readAmountOverride = '1.00';
    try { expect((await w.notify(raw)).body.error?.code).toBe('verification_failed'); } finally { yk.readAmountOverride = null; }
    const b = await account();
    const r = await w.checkout(b.token, { idempotency_key: key() });
    const pending = yk.byOrder(r.body.data!.intent_id as string)!;
    const forged = JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { ...pending, status: 'succeeded', paid: true, captured_at: '2026-09-28T10:00:00.000Z' } });
    expect((await w.notify(forged)).body.error?.code).toBe('verification_failed');
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id IN ($1, $2)`, [`payment_succeeded:${paymentId}`, `payment_succeeded:${pending.id}`])).toBe(0);
    expect((await billing(a.id)).plan).toBe('free');
    expect((await billing(b.id)).plan).toBe('free');
    expect((await w.notify('not json')).status).toBe(400);
    expect((await w.notify('')).status).toBe(400);
    // Подделка с угаданным object.id НЕ заняла ключ: настоящая доставка того же платежа применяется.
    expect((await w.notify(raw)).body.data).toMatchObject({ applied: true, plan: 'paid' });
  });

  it('AC-6 недоступность (урок N1): ЮKassa 500 при перезапросе → 503 без единой записи; после восстановления та же доставка применяется', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    const raw = yk.notification(paymentId);
    yk.failReads = true;
    try { expect((await w.notify(raw)).status).toBe(503); } finally { yk.failReads = false; }
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${paymentId}`])).toBe(0);
    expect((await w.notify(raw)).body.data).toMatchObject({ applied: true, plan: 'paid' });
  });

  it('исключение ВНУТРИ транзакции оплаты: ключ откатывается, ответ 503, повтор той же доставки применяет полным путём', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    await pool.query(`CREATE FUNCTION ${schema}.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'сбой записи'; END $$`);
    await pool.query(`CREATE TRIGGER boom BEFORE INSERT ON ${schema}.payment FOR EACH ROW EXECUTE FUNCTION ${schema}.boom()`);
    try { expect((await w.notify(yk.notification(paymentId))).status).toBe(503); }
    finally { await pool.query(`DROP TRIGGER boom ON ${schema}.payment`); await pool.query(`DROP FUNCTION ${schema}.boom()`); }
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${paymentId}`])).toBe(0);
    expect((await w.notify(yk.notification(paymentId))).body.data).toMatchObject({ applied: true, plan: 'paid' });
  });

  it('AC-7 перестановка: две оплаты в любом порядке — срок +60 от старта', async () => {
    const w = wire();
    const a = await account();
    const first = await paid(a, w);
    const second = await paid(a, w);
    for (const p of [second, first]) expect((await w.notify(yk.notification(p.paymentId))).status).toBe(200);
    expect(days(await billing(a.id))).toBe(60);
  });

  it('AC-7 возврат (OWN-019 п.3): refund.succeeded → refunded + needs_review, план НЕ снимается автоматически', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    await w.notify(yk.notification(paymentId));
    const refundId = yk.refund(paymentId);
    expect((await w.notify(yk.refundNotification(refundId))).body.data).toEqual({ applied: false, reason: 'refund_recorded' });
    expect((await pool.query('SELECT status, needs_review, review_reason FROM payment WHERE provider_payment_id = $1', [paymentId])).rows[0])
      .toEqual({ status: 'refunded', needs_review: true, review_reason: 'refund' });
    expect((await billing(a.id)).plan).toBe('paid');
  });

  it('AC-7 возврат ПРЕЖДЕ оплаты — план не выдаётся; 10+10 одновременных оплата/возврат — одна строка refunded, два события', async () => {
    const w = wire();
    const a = await account();
    const { intent, paymentId } = await paid(a, w);
    const refundId = yk.refund(paymentId);
    expect((await w.notify(yk.refundNotification(refundId))).body.data).toEqual({ applied: false, reason: 'refund_recorded' });
    expect((await w.notify(yk.notification(paymentId))).body.data).toEqual({ applied: false, reason: 'refunded' });
    expect((await billing(a.id)).plan).toBe('free');
    expect((await pool.query('SELECT status, needs_review, review_reason, intent_id FROM payment WHERE provider_payment_id = $1', [paymentId])).rows[0])
      .toEqual({ status: 'refunded', needs_review: true, review_reason: 'refund', intent_id: intent });
    const b = await account();
    const p2 = await paid(b, w);
    const r2 = yk.refund(p2.paymentId);
    await Promise.all([...Array.from({ length: 10 }, () => w.notify(yk.notification(p2.paymentId))), ...Array.from({ length: 10 }, () => w.notify(yk.refundNotification(r2)))]);
    expect((await pool.query('SELECT status, needs_review FROM payment WHERE provider_payment_id = $1', [p2.paymentId])).rows).toEqual([{ status: 'refunded', needs_review: true }]);
    // Итоговый тариф зависит от того, кто успел первым (контракт, «перестановочен»): paid — только если оплата применилась
    // ДО возврата, и тогда платёж всё равно помечен на разбор; срок — ровно одна оплата, не две.
    const b2 = await billing(b.id);
    expect(['paid', 'free']).toContain(b2.plan);
    if (b2.plan === 'paid') expect(days(b2)).toBe(30); else expect(b2.plan_paid_until).toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id IN ($1, $2)`, [`payment_succeeded:${p2.paymentId}`, `refund_succeeded:${r2}`])).toBe(2);
  });

  it('AC-7 блокировка платежа: возврат держит блокировку и ещё не закоммичен — оплата ЖДЁТ и видит возврат, план не выдаётся', async () => {
    const w = wire();
    const a = await account();
    const { intent, paymentId } = await paid(a, w);
    const holder = await pool.connect();
    let pay: Promise<{ status: number; body: Json }> | undefined;
    try {
      await holder.query('BEGIN');
      // Ровно то, что делает recordVerifiedRefund до коммита: блокировка платежа и строка refunded.
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`payment:yookassa:${paymentId}`]);
      await holder.query(`INSERT INTO payment (intent_id, account_id, provider, provider_payment_id, amount_minor, status, needs_review, review_reason, paid_at)
        VALUES ($1, $2, 'yookassa', $3, 99000, 'refunded', true, 'refund', now())`, [intent, a.id, paymentId]);
      pay = w.notify(yk.notification(paymentId));
      await new Promise(resolve => setTimeout(resolve, 400));
      await holder.query('COMMIT');
    } catch (error) { await holder.query('ROLLBACK'); throw error; } finally { holder.release(); }
    expect((await pay!).body.data).toEqual({ applied: false, reason: 'refunded' });
    expect((await billing(a.id)).plan).toBe('free');
  });

  it('AC-8 сумма ≠ цене намерения: платёж needs_review amount_mismatch, план НЕ выдан, опрос — pending (не «успех»)', async () => {
    const provider = createFakePaymentProvider();
    const w = wire(provider);
    const a = await account();
    const r = await w.checkout(a.token, { idempotency_key: key() });
    const intent = r.body.data!.intent_id as string;
    const payment = await provider.getPaymentByOrder(intent);
    (provider.script as { remoteAmountOverrideMinor?: number }).remoteAmountOverrideMinor = 50_000;
    const out = await w.notify(Buffer.from(provider.notificationFor(payment.id, 'payment_succeeded')).toString('utf8'));
    expect(out.body.data).toEqual({ applied: false, reason: 'amount_mismatch' });
    expect((await billing(a.id)).plan).toBe('free');
    expect((await pool.query('SELECT needs_review, review_reason, amount_minor FROM payment WHERE provider_payment_id = $1', [payment.id])).rows[0])
      .toEqual({ needs_review: true, review_reason: 'amount_mismatch', amount_minor: 50_000 });
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'pending' });
  });

  it('AC-9 оплата от аккаунта в статусе erasing: needs_review account_erasing, план не выдан', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, w);
    await pool.query(`UPDATE account SET status = 'erasing', deletion_requested_at = now(), erase_deadline = now() + interval '72 hours' WHERE id = $1`, [a.id]);
    expect((await w.notify(yk.notification(paymentId))).body.data).toEqual({ applied: false, reason: 'account_erasing' });
    expect((await billing(a.id)).plan).toBe('free');
    expect((await pool.query('SELECT review_reason, account_id FROM payment WHERE provider_payment_id = $1', [paymentId])).rows[0])
      .toEqual({ review_reason: 'account_erasing', account_id: a.id });
  });

  it('отказ у провайдера: платёж отменён → опрос экрана возврата отвечает canceled; повтор оформления после суток — тот же платёж', async () => {
    const w = wire();
    const a = await account();
    const k = key();
    const before = yk.created;
    const r = await w.checkout(a.token, { idempotency_key: k });
    const intent = r.body.data!.intent_id as string;
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'pending' });
    yk.forgetIdempotence();
    expect((await w.checkout(a.token, { idempotency_key: k })).body.data!.redirect_url).toBe(r.body.data!.redirect_url);
    expect(yk.created - before).toBe(1);
    yk.cancel(yk.byOrder(intent)!.id);
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'canceled' });
    expect((await w.checkout(a.token, { idempotency_key: k })).body.data).toMatchObject({ status: 'canceled', redirect_url: null });
  });

  it('опрос возврата отдаёт ДЕЙСТВУЮЩИЙ план: успешное намерение при истёкшем сроке — account_plan free', async () => {
    const w = wire();
    const a = await account();
    const { intent, paymentId } = await paid(a, w);
    await w.notify(yk.notification(paymentId));
    await pool.query(`UPDATE account SET plan_paid_until = now() - interval '1 minute' WHERE id = $1`, [a.id]);
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'succeeded', account_plan: 'free', plan_paid_until: null });
  });

  it('план оператора сильнее оплаты: оплата поверх него не превращает бессрочный план в истекающий', async () => {
    const w = wire();
    const a = await account('paid');
    await pool.query(`UPDATE account SET plan_source = 'operator' WHERE id = $1`, [a.id]);
    const { paymentId } = await paid(a, w);
    expect((await w.notify(yk.notification(paymentId))).body.data).toMatchObject({ applied: true });
    expect(await billing(a.id)).toMatchObject({ plan: 'paid', plan_source: 'operator' });
  });
});
