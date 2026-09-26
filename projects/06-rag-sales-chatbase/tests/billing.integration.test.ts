// tariffs-and-interest на НАСТОЯЩЕМ Postgres 16: маршруты оплаты по боевой связке createBillingDependencies. Подменены только
// провайдер (НАСТОЯЩИЙ адаптер ЮKassa N4 на подменном HTTP-сервере, либо фейк N4) и ограничитель двери.
// AC-1…AC-11 плана (docs/features/tariffs-and-interest/01_plan.md); incoming-webhooks: подделка, повтор (одно событие дважды
// и 20 одновременных доставок), перестановка; security-operation-order: недоступность ЮKassa → 503 без записи → повтор
// проходит полным путём; SC-US-011-1/2.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createPool, expirePaidPlans, setPlanByOperator, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createBillingDependencies } from '../apps/web/src/server/billing-deps';
import { createCheckoutHandler, createCheckoutStatusHandler, createInterestHandler, createPaymentWebhookHandler } from '../apps/web/src/server/billing-handler';
import { createYooKassaProvider } from '../apps/web/src/server/payments/yookassa';
import { createFakePaymentProvider } from '../apps/web/src/server/payments/fake';
import type { PaymentProvider } from '../apps/web/src/server/payments/provider';
import { createWidgetDependencies } from '../apps/web/src/server/widget-deps';
import { createWidgetConfigHandler } from '../apps/web/src/server/widget-handler';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { SECRET, SHOP_ID, startFakeYooKassa, type FakeYooKassa } from './fixtures/fake-yookassa-server';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const YOOKASSA_IP = '185.71.76.10';
const DAY = 86_400_000;
type Json = { data?: Record<string, unknown>; error?: { code: string; message: string } };

describe.skipIf(!databaseUrl)('оплата ЮKassa и интерес на настоящем Postgres', () => {
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
    const deps = createBillingDependencies({ pool, publicOrigin: PUBLIC, provider, allowMutation: async () => true,
      authenticate: async (token) => (sessions.has(token) ? { account_id: sessions.get(token)! } : null), log: () => {} });
    const call = async (handler: (r: Request) => Promise<Response>, url: string, init: RequestInit) => {
      const r = await handler(new Request(url, init));
      return { status: r.status, body: await r.json() as Json };
    };
    return {
      deps,
      checkout: (token: string, payload: unknown) => call(createCheckoutHandler(deps), `${PUBLIC}/api/checkout`, { method: 'POST',
        headers: { origin: PUBLIC, cookie: `__Host-n6_session=${token}`, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify(payload) }),
      interest: (token: string, payload: unknown) => call(createInterestHandler(deps), `${PUBLIC}/api/interest`, { method: 'POST',
        headers: { origin: PUBLIC, cookie: `__Host-n6_session=${token}`, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: JSON.stringify(payload) }),
      status: async (token: string, intent: string) => {
        const r = await createCheckoutStatusHandler(deps)(new Request(`${PUBLIC}/api/checkout/${intent}`, { headers: { cookie: `__Host-n6_session=${token}` } }), intent);
        return { status: r.status, body: await r.json() as Json };
      },
      notify: (raw: string, ip = YOOKASSA_IP) => call(createPaymentWebhookHandler(deps), `${PUBLIC}/api/webhooks/yookassa`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: raw }),
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
  // Оформить план и «оплатить» у подменной ЮKassa: id платежа у провайдера и id намерения.
  async function paid(a: { token: string }, plan: 'nobadge' | 'studio', w = wire()) {
    const r = await w.checkout(a.token, { plan, idempotency_key: key() });
    expect(r.status).toBe(201);
    const intent = r.body.data!.intent_id as string;
    const payment = yk.byOrder(intent)!;
    yk.pay(payment.id);
    return { intent, paymentId: payment.id };
  }

  it('AC-1 / SC-US-011-1: оплата выключена — оформление 409 payments_off без намерения; «Сообщите мне» пишет pro_interest и событие interest, повтор и 10 одновременных — одна строка', async () => {
    const w = wire(null);
    const a = await account();
    const refused = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: key() });
    expect([refused.status, refused.body.error?.code]).toEqual([409, 'payments_off']);
    expect(await count('SELECT count(*)::int AS n FROM payment_intent WHERE account_id = $1', [a.id])).toBe(0);
    expect((await w.interest(a.token, { plan: 'nobadge', origin_screen: 'upgrade' })).body.data).toEqual({ status: 'recorded' });
    expect((await w.interest(a.token, { plan: 'nobadge', origin_screen: 'upgrade' })).body.data).toEqual({ status: 'already_recorded' });
    const b = await account();
    const burst = await Promise.all(Array.from({ length: 10 }, () => w.interest(b.token, { plan: 'studio', origin_screen: 'pricing' })));
    expect(burst.filter((r) => r.body.data?.status === 'recorded')).toHaveLength(1);
    expect(await count(`SELECT count(*)::int AS n FROM pro_interest WHERE account_id = $1`, [b.id])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM growth_event WHERE account_id = $1 AND type = 'interest'`, [b.id])).toBe(1);
    // Закрытые наборы: неизвестный экран и не-платный план — 422 без записи.
    expect((await w.interest(a.token, { plan: 'studio', origin_screen: 'evil' })).status).toBe(422);
    expect((await w.interest(a.token, { plan: 'free', origin_screen: 'pricing' })).status).toBe(422);
    // Вебхук при выключенной оплате не существует.
    expect((await w.notify('{}')).status).toBe(404);
  });

  it('AC-2: намерение создаётся ДО провайдера; повтор с тем же ключом — то же намерение и ОДИН платёж у ЮKassa; ключ для другого плана — 409', async () => {
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
    const first = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: k });
    expect(first.status).toBe(201);
    expect(seenBeforeProvider).toBe(1);
    expect(String(first.body.data!.redirect_url)).toMatch(/^https:\/\/yoomoney\.example\//);
    const second = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: k });
    expect(second.body.data!.intent_id).toBe(first.body.data!.intent_id);
    expect(second.body.data!.redirect_url).toBe(first.body.data!.redirect_url);
    expect(yk.created - before).toBe(1);
    expect((await w.checkout(a.token, { plan: 'studio', idempotency_key: k })).body.error?.code).toBe('idempotency_conflict');
    // Строгое равенство плана (ADR-004) и формат ключа — 422 до провайдера.
    for (const plan of ['NOBADGE', ' nobadge', 'free', null]) expect((await w.checkout(a.token, { plan, idempotency_key: key() })).status, String(plan)).toBe(422);
    expect((await w.checkout(a.token, { plan: 'nobadge', idempotency_key: 'short' })).status).toBe(422);
  });

  it('AC-3 / SC-US-011-2: уведомление об успехе → план nobadge на 30 дней, намерение succeeded, следующий /w/v1/config — badge_required=false', async () => {
    const w = wire();
    const a = await account();
    const key16 = randomBytes(16).toString('base64url');
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact) VALUES ($1, 'active', $2, 'Колос', '+7 900 000-00-00') RETURNING id`,
      [a.id, key16])).rows[0]!.id;
    await pool.query(`INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, 'https://shop.example')`, [bot]);
    const config = async () => ((await (await createWidgetConfigHandler(createWidgetDependencies({ pool, publicOrigin: PUBLIC, secret: 'x'.repeat(64), allowMutation: async () => true, log: () => {} }))(
      new Request(`${PUBLIC}/w/v1/config?bot=${key16}`, { headers: { origin: 'https://shop.example', 'x-forwarded-for': '198.51.100.23' } }))).json()) as { data: { badge_required: boolean } }).data;
    expect((await config()).badge_required).toBe(true);
    const { intent, paymentId } = await paid(a, 'nobadge', w);
    const r = await w.notify(yk.notification(paymentId));
    expect(r.body.data).toMatchObject({ applied: true, plan: 'nobadge' });
    const b = await billing(a.id);
    expect([b.plan, b.plan_source]).toEqual(['nobadge', 'payment']);
    expect(Math.abs(b.plan_paid_until!.getTime() - b.now.getTime() - 30 * DAY)).toBeLessThan(60_000);
    expect((await config()).badge_required).toBe(false);
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'succeeded', account_plan: 'nobadge' });
    // Чужое намерение — 404, как несуществующее.
    const other = await account();
    expect((await w.status(other.token, intent)).status).toBe(404);
  });

  it('AC-4 повтор: одно событие дважды — срок +30, не +60; 20 одновременных доставок — ОДНО применение и одна строка payment_event', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    const raw = yk.notification(paymentId);
    expect((await w.notify(raw)).body.data).toMatchObject({ applied: true });
    const once = (await billing(a.id)).plan_paid_until!.getTime();
    expect((await w.notify(raw)).body.data).toEqual({ applied: false, reason: 'duplicate' });
    expect((await billing(a.id)).plan_paid_until!.getTime()).toBe(once);
    const c = await account();
    const second = await paid(c, 'studio', w);
    const burst = await Promise.all(Array.from({ length: 20 }, () => w.notify(yk.notification(second.paymentId))));
    expect(burst.every((r) => r.status === 200)).toBe(true);
    expect(burst.filter((r) => r.body.data?.applied === true)).toHaveLength(1);
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${second.paymentId}`])).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM payment WHERE provider_payment_id = $1`, [second.paymentId])).toBe(1);
    const cb = await billing(c.id);
    expect(Math.abs(cb.plan_paid_until!.getTime() - cb.now.getTime() - 30 * DAY)).toBeLessThan(60_000);
  });

  it('AC-5 подделка: чужой IP, цепочка XFF, неоплаченный платёж, сумма перезапроса ≠ заявленной — 400 и ни одной записи', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    const raw = yk.notification(paymentId);
    expect((await w.notify(raw, '203.0.113.9')).body.error?.code).toBe('verification_failed');
    expect((await w.notify(raw, `203.0.113.9, ${YOOKASSA_IP}`)).body.error?.code).toBe('no_source_ip');
    yk.readAmountOverride = '1.00';
    try { expect((await w.notify(raw)).body.error?.code).toBe('verification_failed'); } finally { yk.readAmountOverride = null; }
    // Подделка «оплачено» по НЕоплаченному платежу: перезапрос видит pending.
    const b = await account();
    const r = await w.checkout(b.token, { plan: 'studio', idempotency_key: key() });
    const pending = yk.byOrder(r.body.data!.intent_id as string)!;
    const forged = JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { ...pending, status: 'succeeded', paid: true, captured_at: '2026-09-26T10:00:00.000Z' } });
    expect((await w.notify(forged)).body.error?.code).toBe('verification_failed');
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id IN ($1, $2)`, [`payment_succeeded:${paymentId}`, `payment_succeeded:${pending.id}`])).toBe(0);
    expect((await billing(a.id)).plan).toBe('free');
    expect((await billing(b.id)).plan).toBe('free');
    // Мусор и пустота — 400, не 500.
    expect((await w.notify('not json')).status).toBe(400);
    expect((await w.notify('')).status).toBe(400);
  });

  it('AC-6 недоступность (урок N1): ЮKassa 500 при перезапросе → 503 без единой записи; после восстановления та же доставка применяется полным путём', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    const raw = yk.notification(paymentId);
    yk.failReads = true;
    try { expect((await w.notify(raw)).status).toBe(503); } finally { yk.failReads = false; }
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${paymentId}`])).toBe(0);
    expect((await w.notify(raw)).body.data).toMatchObject({ applied: true, plan: 'nobadge' });
  });

  it('AC-7 перестановка: две оплаты (nobadge, studio) в любом порядке — план studio и срок +60 от старта', async () => {
    const w = wire();
    const results: Array<{ plan: string; days: number }> = [];
    for (const order of [['nobadge', 'studio'], ['studio', 'nobadge']] as const) {
      const a = await account();
      const first = await paid(a, order[0], w);
      const second = await paid(a, order[1], w);
      for (const p of [second, first]) expect((await w.notify(yk.notification(p.paymentId))).status).toBe(200);
      const b = await billing(a.id);
      results.push({ plan: b.plan, days: Math.round((b.plan_paid_until!.getTime() - b.now.getTime()) / DAY) });
    }
    expect(results).toEqual([{ plan: 'studio', days: 60 }, { plan: 'studio', days: 60 }]);
  });

  it('AC-8 сумма ≠ цене намерения: платёж записан needs_review amount_mismatch, план НЕ выдан, намерение не «успех»', async () => {
    const provider = createFakePaymentProvider();
    const w = wire(provider);
    const a = await account();
    const r = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: key() });
    const intent = r.body.data!.intent_id as string;
    const payment = await provider.getPaymentByOrder(intent);
    // Фейк N4 читает сценарий через замыкание на ТОТ ЖЕ объект script — меняется он, а не ссылка.
    (provider.script as { remoteAmountOverrideMinor?: number }).remoteAmountOverrideMinor = 50_000;
    const out = await w.notify(Buffer.from(provider.notificationFor(payment.id, 'payment_succeeded')).toString('utf8'));
    expect(out.body.data).toEqual({ applied: false, reason: 'amount_mismatch' });
    expect((await billing(a.id)).plan).toBe('free');
    const row = (await pool.query('SELECT needs_review, review_reason, amount_minor FROM payment WHERE provider_payment_id = $1', [payment.id])).rows[0];
    expect(row).toEqual({ needs_review: true, review_reason: 'amount_mismatch', amount_minor: 50_000 });
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'pending' });
  });

  it('возврат (решение владельца): refund.succeeded — платёж refunded + needs_review, план остаётся до решения оператора', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    await w.notify(yk.notification(paymentId));
    const refundId = yk.refund(paymentId);
    expect((await w.notify(yk.refundNotification(refundId))).body.data).toEqual({ applied: false, reason: 'refund_recorded' });
    expect((await pool.query('SELECT status, needs_review, review_reason FROM payment WHERE provider_payment_id = $1', [paymentId])).rows[0])
      .toEqual({ status: 'refunded', needs_review: true, review_reason: 'refund' });
    expect((await billing(a.id)).plan).toBe('nobadge');
  });

  it('отказ у провайдера: платёж отменён → опрос экрана возврата отвечает canceled', async () => {
    const w = wire();
    const a = await account();
    const r = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: key() });
    const intent = r.body.data!.intent_id as string;
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'pending' });
    yk.cancel(yk.byOrder(intent)!.id);
    expect((await w.status(a.token, intent)).body.data).toMatchObject({ status: 'canceled' });
  });

  it('ревью, находка 1 (перестановка оплата/возврат): возврат ПРЕЖДЕ оплаты — платёж записан refunded на разбор, оплата после него план не выдаёт', async () => {
    const w = wire();
    const a = await account();
    const { intent, paymentId } = await paid(a, 'nobadge', w);
    const refundId = yk.refund(paymentId);
    expect((await w.notify(yk.refundNotification(refundId))).body.data).toEqual({ applied: false, reason: 'refund_recorded' });
    expect((await w.notify(yk.notification(paymentId))).body.data).toEqual({ applied: false, reason: 'refunded' });
    expect((await billing(a.id)).plan).toBe('free');
    expect((await pool.query('SELECT status, needs_review, review_reason, intent_id FROM payment WHERE provider_payment_id = $1', [paymentId])).rows[0])
      .toEqual({ status: 'refunded', needs_review: true, review_reason: 'refund', intent_id: intent });
    // Одновременно: 10 доставок оплаты и 10 возврата одного платежа — в ЛЮБОМ порядке строка платежа одна и она refunded
    // (оплата, успевшая первой, законно выдаёт план — возврат затем разбирает оператор), событий ровно два.
    const b = await account();
    const p2 = await paid(b, 'studio', w);
    const r2 = yk.refund(p2.paymentId);
    await Promise.all([...Array.from({ length: 10 }, () => w.notify(yk.notification(p2.paymentId))), ...Array.from({ length: 10 }, () => w.notify(yk.refundNotification(r2)))]);
    expect((await pool.query('SELECT status, needs_review FROM payment WHERE provider_payment_id = $1', [p2.paymentId])).rows).toEqual([{ status: 'refunded', needs_review: true }]);
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id IN ($1, $2)`, [`payment_succeeded:${p2.paymentId}`, `refund_succeeded:${r2}`])).toBe(2);
  });

  it('ревью, находка 2: повтор оформления после суток (ключ у ЮKassa забыт) — тот же платёж, второго нет; отменённый — намерение canceled', async () => {
    const w = wire();
    const a = await account();
    const k = key();
    const before = yk.created;
    const first = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: k });
    yk.forgetIdempotence();
    const again = await w.checkout(a.token, { plan: 'nobadge', idempotency_key: k });
    expect(again.body.data!.redirect_url).toBe(first.body.data!.redirect_url);
    expect(yk.created - before).toBe(1);
    yk.cancel(yk.byOrder(first.body.data!.intent_id as string)!.id);
    expect((await w.checkout(a.token, { plan: 'nobadge', idempotency_key: k })).body.data).toMatchObject({ status: 'canceled', redirect_url: null });
    expect(yk.created - before).toBe(1);
  });

  it('исключение ВНУТРИ транзакции оплаты (урок N1): ключ откатывается, ответ 503, повтор той же доставки применяет полным путём', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    await pool.query(`CREATE FUNCTION ${schema}.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'сбой записи'; END $$`);
    await pool.query(`CREATE TRIGGER boom BEFORE INSERT ON ${schema}.payment FOR EACH ROW EXECUTE FUNCTION ${schema}.boom()`);
    try { expect((await w.notify(yk.notification(paymentId))).status).toBe(503); }
    finally { await pool.query(`DROP TRIGGER boom ON ${schema}.payment`); await pool.query(`DROP FUNCTION ${schema}.boom()`); }
    expect(await count(`SELECT count(*)::int AS n FROM payment_event WHERE provider_event_id = $1`, [`payment_succeeded:${paymentId}`])).toBe(0);
    expect((await w.notify(yk.notification(paymentId))).body.data).toMatchObject({ applied: true, plan: 'nobadge' });
  });

  it('ревью, находка 3: оператор снял план (free) — оплаченный остаток стёрт; новая оплата даёт ровно 30 дней', async () => {
    const w = wire();
    const a = await account();
    const first = await paid(a, 'nobadge', w);
    await w.notify(yk.notification(first.paymentId));
    const email = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [a.id])).rows[0]!.email;
    await setPlanByOperator(pool, { email, plan: 'free', operator: 'ops', reason: 'возврат по заявке клиента' });
    expect(await billing(a.id)).toMatchObject({ plan: 'free', plan_source: 'none', plan_paid_until: null });
    const second = await paid(a, 'nobadge', w);
    await w.notify(yk.notification(second.paymentId));
    const b = await billing(a.id);
    expect(Math.round((b.plan_paid_until!.getTime() - b.now.getTime()) / DAY)).toBe(30);
  });

  it('план до миграции 006 (plan_source none): оплата старшего плана — план оплаты; младшего — старший не понижается', async () => {
    const w = wire();
    const legacy = await account('nobadge');
    const up = await paid(legacy, 'studio', w);
    await w.notify(yk.notification(up.paymentId));
    expect(await billing(legacy.id)).toMatchObject({ plan: 'studio', plan_source: 'payment' });
    const legacyStudio = await account('studio');
    const down = await paid(legacyStudio, 'nobadge', w);
    await w.notify(yk.notification(down.paymentId));
    expect(await billing(legacyStudio.id)).toMatchObject({ plan: 'studio', plan_source: 'none' });
  });

  it('AC-10 оператор: план + журнал + атрибуция converted; без причины, неизвестный план и почта — отказ без изменений', async () => {
    const a = await account();
    const email = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [a.id])).rows[0]!.email;
    const code = (await pool.query<{ id: string }>(`INSERT INTO partner_code (code, "group") VALUES ($1, 'studio') RETURNING id`, [`S${randomBytes(4).toString('hex')}`])).rows[0]!.id;
    await pool.query(`INSERT INTO attribution (account_id, partner_code_id, source) VALUES ($1, $2, 'code')`, [a.id, code]);
    expect(await setPlanByOperator(pool, { email, plan: 'studio', operator: 'ops', reason: '' })).toEqual({ kind: 'invalid', field: 'reason' });
    expect(await setPlanByOperator(pool, { email, plan: 'STUDIO', operator: 'ops', reason: 'пилот' })).toEqual({ kind: 'invalid', field: 'plan' });
    expect(await setPlanByOperator(pool, { email: 'nobody@example.ru', plan: 'studio', operator: 'ops', reason: 'пилот' })).toEqual({ kind: 'not_found' });
    expect((await billing(a.id)).plan).toBe('free');
    expect(await setPlanByOperator(pool, { email: ` ${email.toUpperCase()} `, plan: 'studio', operator: 'ops', reason: 'пилотная студия' })).toEqual({ kind: 'updated', before: 'free', after: 'studio' });
    expect(await billing(a.id)).toMatchObject({ plan: 'studio', plan_source: 'operator' });
    expect((await pool.query(`SELECT status FROM attribution WHERE account_id = $1`, [a.id])).rows[0]!.status).toBe('converted');
    expect((await pool.query(`SELECT operator, plan_before, plan_after FROM operator_action WHERE account_id = $1`, [a.id])).rows).toEqual([{ operator: 'ops', plan_before: 'free', plan_after: 'studio' }]);
  });

  it('AC-11 истечение: оплаченный план с прошедшим сроком → free сторожем; план оператора не истекает; оплата поверх плана оператора его не понижает', async () => {
    const w = wire();
    const a = await account();
    const { paymentId } = await paid(a, 'nobadge', w);
    await w.notify(yk.notification(paymentId));
    await pool.query(`UPDATE account SET plan_paid_until = now() - interval '1 minute' WHERE id = $1`, [a.id]);
    const op = await account();
    const email = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [op.id])).rows[0]!.email;
    await setPlanByOperator(pool, { email, plan: 'studio', operator: 'ops', reason: 'пилотная студия' });
    expect(await expirePaidPlans(pool, 100)).toBeGreaterThanOrEqual(1);
    expect(await billing(a.id)).toMatchObject({ plan: 'free', plan_source: 'none' });
    expect(await billing(op.id)).toMatchObject({ plan: 'studio', plan_source: 'operator' });
    const lower = await paid(op, 'nobadge', w);
    await w.notify(yk.notification(lower.paymentId));
    expect(await billing(op.id)).toMatchObject({ plan: 'studio', plan_source: 'operator' });
  });
});
