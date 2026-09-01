// Оплата: порядок операций вебхука — это и есть защита (ADR-009, дефект проекта 01).
// Все тесты — на живой БД под ролью app_owner; ЮKassa подменена fetch-заглушкой.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL_OWNER = process.env.TEST_DATABASE_URL ?? '';
process.env.YOOKASSA_SHOP_ID = 'test-shop';
process.env.YOOKASSA_SECRET_KEY = 'test-key';

const { closePool, pool } = await import('../src/db.js');
const { register } = await import('../src/auth.js');
const { createPlace } = await import('../src/places.js');
const { handleYookassaWebhook, ipInAnyCidr, pricePointRub, YOOKASSA_NETWORKS } = await import('../src/payment.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

afterAll(async () => { await pgAdmin.end(); await closePool(); });

const uniq = (() => { let n = 0; return (p: string) => `${p}-${process.pid}-${++n}`; })();
const YK_IP = '185.71.76.5';   // из зашитого списка сетей

/** Заглушка провайдера: id → статус; 'DOWN' — сеть упала; нет ключа — 404. */
function ykStub(statusById: Record<string, string>): typeof fetch {
  return (async (url: unknown) => {
    const m = String(url).match(/\/payments\/([^/?]+)$/);
    if (!m) throw new Error(`неожиданный вызов: ${String(url)}`);
    const st = statusById[m[1]!];
    if (st === undefined) return new Response('{"type":"error"}', { status: 404 });
    if (st === 'DOWN') throw new Error('ECONNREFUSED');
    return new Response(JSON.stringify({ id: m[1], status: st }), { status: 200 });
  }) as typeof fetch;
}

async function ownerWithPlaces(n = 1) {
  const r = await register(`${uniq('pay')}@test.ru`, 'пароль-восемь', 'Тест');
  if (!r.ok) throw new Error(r.error);
  const slugs: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await createPlace(r.accountId, `Точка ${uniq('n')}`);
    if (!p.ok) throw new Error(p.error);
    slugs.push(p.slug);
  }
  return { accountId: r.accountId, slugs };
}

async function checkout(accountId: string): Promise<string> {
  const pid = uniq('yk-pay');
  await pool.query(`insert into checkout_sessions (account_id, provider_session_id) values ($1,$2)`,
    [accountId, pid]);
  return pid;
}

function ev(type: 'succeeded' | 'canceled', id: string): string {
  return JSON.stringify({ event: `payment.${type}`, object: { id, status: type } });
}

async function whCount(eventKey: string): Promise<number> {
  const r = await pgAdmin.query(`select count(*)::int c from webhook_events where event_id=$1`, [eventKey]);
  return r.rows[0].c;
}

describe('P-1 идемпотентность', () => {
  it('повтор ×5 последовательно и ×5 ПАРАЛЛЕЛЬНО — тариф применён один раз', async () => {
    const o = await ownerWithPlaces();
    const pid = await checkout(o.accountId);
    const stub = ykStub({ [pid]: 'succeeded' });
    for (let i = 0; i < 5; i++) await handleYookassaWebhook(ev('succeeded', pid), YK_IP, stub);
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      handleYookassaWebhook(ev('succeeded', pid), YK_IP, stub)));
    expect(results.every((r) => r.code === 200)).toBe(true);
    expect(await whCount(`payment.succeeded:${pid}`)).toBe(1);
    const sub = await pgAdmin.query(
      `select count(*)::int c, min(current_period_end) till from subscriptions where account_id=$1 and status='active'`,
      [o.accountId]);
    expect(sub.rows[0].c).toBe(1);
    // период — РОВНО 30 дней: продлеваться от повторов ОДНОГО события он не должен
    const days = (new Date(sub.rows[0].till).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe('P-2 подлинность ДО заявки идемпотентности', () => {
  it('платёж не существует у провайдера — подделка НЕ записана в webhook_events', async () => {
    const fakeId = uniq('forged');
    const r = await handleYookassaWebhook(ev('succeeded', fakeId), YK_IP, ykStub({}));
    expect(r.code).toBe(200);
    // Несущая проверка: подделка НЕ должна занять ключ — иначе настоящее событие
    // отбросится как дубль, и оплата не применится никогда (дефект проекта 01).
    expect(await whCount(`payment.succeeded:${fakeId}`)).toBe(0);
  });

  it('событие врёт о статусе (remote=canceled) — игнор без записи', async () => {
    const o = await ownerWithPlaces();
    const pid = await checkout(o.accountId);
    const r = await handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'canceled' }));
    expect(r.code).toBe(200);
    expect(await whCount(`payment.succeeded:${pid}`)).toBe(0);
  });

  it('чужой IP — отказ до любых обращений', async () => {
    const called: string[] = [];
    const spy = (async (u: unknown) => { called.push(String(u)); throw new Error('не должен'); }) as typeof fetch;
    const r = await handleYookassaWebhook(ev('succeeded', 'x'), '8.8.8.8', spy);
    expect(r.code).toBe(400);
    expect(called).toEqual([]);
  });
});

describe('P-3 недоступность провайдера — исключение, не значение', () => {
  it('провайдер упал → THROW; повтор позже проходит ПОЛНЫЙ путь', async () => {
    const o = await ownerWithPlaces();
    const pid = await checkout(o.accountId);
    await expect(handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'DOWN' })))
      .rejects.toThrow();
    expect(await whCount(`payment.succeeded:${pid}`)).toBe(0);   // ключ НЕ занят
    const r = await handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'succeeded' }));
    expect(r.code).toBe(200);
    const sub = await pgAdmin.query(`select 1 from subscriptions where account_id=$1 and status='active'`, [o.accountId]);
    expect(sub.rows.length).toBe(1);   // оплата ПРИМЕНИЛАСЬ со второй доставки
  });
});

describe('P-4 canceled не затирает применённый тариф', () => {
  it('succeeded, затем canceled того же платежа', async () => {
    const o = await ownerWithPlaces();
    const pid = await checkout(o.accountId);
    await handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'succeeded' }));
    const r = await handleYookassaWebhook(ev('canceled', pid), YK_IP, ykStub({ [pid]: 'canceled' }));
    expect(r.code).toBe(200);
    expect(await whCount(`payment.canceled:${pid}`)).toBe(1);   // ключи РАЗНЫЕ — оба события записаны
    const sub = await pgAdmin.query(`select status from subscriptions where account_id=$1`, [o.accountId]);
    expect(sub.rows[0].status).toBe('active');
    const cs = await pgAdmin.query(`select status from checkout_sessions where provider_session_id=$1`, [pid]);
    expect(cs.rows[0].status).toBe('completed');
  });
});

describe('P-5 применение тарифа', () => {
  it('branding_required=false у ВСЕХ точек аккаунта; слаги отданы на инвалидацию', async () => {
    const o = await ownerWithPlaces(2);
    const pid = await checkout(o.accountId);
    const r = await handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'succeeded' }));
    expect(r.slugsToInvalidate.sort()).toEqual([...o.slugs].sort());
    const b = await pgAdmin.query(`select bool_or(branding_required) any_left from places where account_id=$1`, [o.accountId]);
    expect(b.rows[0].any_left).toBe(false);
  });
});

describe('P-6 инвалидация — после COMMIT (страж по исходнику)', () => {
  it('payment.ts не трогает кэш сам; server.ts зовёт invalidate ПОСЛЕ handleYookassaWebhook', () => {
    const pay = readFileSync(new URL('../src/payment.ts', import.meta.url), 'utf8');
    expect(pay).not.toMatch(/internal\/invalidate/);
    const srv = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    const call = srv.indexOf('await handleYookassaWebhook');
    const inval = srv.indexOf('invalidateSlug(slug)');
    expect(call).toBeGreaterThan(-1);
    expect(inval).toBeGreaterThan(call);
  });
});

describe('P-7 комиссия партнёра', () => {
  it('одна на платёж; повтор события не удваивает; вторая оплата не начисляет повторно', async () => {
    const o = await ownerWithPlaces();
    const partner = await pgAdmin.query(
      `insert into partners (name, promo_code, payout_rate) values ('П', $1, 0.3) returning id`, [uniq('promo')]);
    await pgAdmin.query(
      `insert into attributions (account_id, partner_id, source, expires_at) values ($1,$2,'promo_code',now()+interval '30 days')`,
      [o.accountId, partner.rows[0].id]);
    const pid = await checkout(o.accountId);
    const stub = ykStub({ [pid]: 'succeeded' });
    await handleYookassaWebhook(ev('succeeded', pid), YK_IP, stub);
    await handleYookassaWebhook(ev('succeeded', pid), YK_IP, stub);   // дубль
    const c1 = await pgAdmin.query(
      `select count(*)::int c, min(amount)::numeric a from commissions co
        join attributions at on at.id=co.attribution_id where at.account_id=$1`, [o.accountId]);
    expect(c1.rows[0].c).toBe(1);
    expect(Number(c1.rows[0].a)).toBeCloseTo(pricePointRub() * 0.3, 5);
    // вторая оплата: атрибуция уже converted — новой комиссии нет
    const pid2 = await checkout(o.accountId);
    await handleYookassaWebhook(ev('succeeded', pid2), YK_IP, ykStub({ [pid2]: 'succeeded' }));
    const c2 = await pgAdmin.query(
      `select count(*)::int c from commissions co join attributions at on at.id=co.attribution_id where at.account_id=$1`,
      [o.accountId]);
    expect(c2.rows[0].c).toBe(1);
  });

  it('отклонённая атрибуция (self-referral, отработал антифрод) — комиссии нет', async () => {
    const o = await ownerWithPlaces();
    const partner = await pgAdmin.query(
      `insert into partners (name, promo_code, payout_rate) values ('С', $1, 0.3) returning id`, [uniq('self')]);
    await pgAdmin.query(
      `insert into attributions (account_id, partner_id, source, status, expires_at)
       values ($1,$2,'promo_code','rejected',now()+interval '30 days')`,
      [o.accountId, partner.rows[0].id]);
    const pid = await checkout(o.accountId);
    await handleYookassaWebhook(ev('succeeded', pid), YK_IP, ykStub({ [pid]: 'succeeded' }));
    const c = await pgAdmin.query(
      `select count(*)::int c from commissions co join attributions at on at.id=co.attribution_id where at.account_id=$1`,
      [o.accountId]);
    expect(c.rows[0].c).toBe(0);
  });
});

describe('P-8 цена — только из конфига', () => {
  it('pricePointRub: дефолт 990, env-переопределение, мусор — отказ', () => {
    const saved = process.env.PRICE_POINT_RUB;
    try {
      delete process.env.PRICE_POINT_RUB;
      expect(pricePointRub()).toBe(990);
      process.env.PRICE_POINT_RUB = '';
      expect(pricePointRub()).toBe(990);
      process.env.PRICE_POINT_RUB = '1490';
      expect(pricePointRub()).toBe(1490);
      for (const bad of ['ноль', '-5', '0', '99.9']) {
        process.env.PRICE_POINT_RUB = bad;
        expect(() => pricePointRub(), bad).toThrow();
      }
    } finally { if (saved === undefined) delete process.env.PRICE_POINT_RUB; else process.env.PRICE_POINT_RUB = saved; }
  });

  it('страж: маршрут checkout не читает форму — сумме клиента неоткуда взяться', () => {
    const srv = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    const start = srv.indexOf("path === '/billing/checkout'");
    expect(start).toBeGreaterThan(-1);
    const block = srv.slice(start, srv.indexOf('if (req.method', start + 10));
    expect(block).not.toMatch(/readForm|readRaw/);
    const pay = readFileSync(new URL('../src/payment.ts', import.meta.url), 'utf8');
    expect(pay).toMatch(/createCheckout\(accountId: string, fetchImpl/);   // цены в сигнатуре НЕТ
  });
});

describe('P-10 CIDR: пустота — отказ, не /0', () => {
  it('пустая маска, мусор и границы', () => {
    expect(ipInAnyCidr('1.2.3.4', ['1.2.3.4/'])).toBe(false);       // Number('')===0 — ловушка
    expect(ipInAnyCidr('1.2.3.4', ['1.2.3.4'])).toBe(false);        // без маски — отказ
    expect(ipInAnyCidr('185.71.76.31', YOOKASSA_NETWORKS)).toBe(true);   // граница /27
    expect(ipInAnyCidr('185.71.76.32', YOOKASSA_NETWORKS)).toBe(false);  // за границей
    expect(ipInAnyCidr('77.75.156.11', YOOKASSA_NETWORKS)).toBe(true);   // /32
    expect(ipInAnyCidr('77.75.156.12', YOOKASSA_NETWORKS)).toBe(false);
    expect(ipInAnyCidr('::1', YOOKASSA_NETWORKS)).toBe(false);           // не-IPv4 — отказ
    expect(ipInAnyCidr('999.1.1.1', ['0.0.0.0/0'])).toBe(false);
  });
});
