// Фича 30 payments без БД (донор — N6 tests/billing.unit.test.ts, адаптировано): честность режима оплаты и потолок минут
// paid (AC-14, AC-15), действующий план и срок хранения (AC-11), экран возврата (AC-10), адрес после входа, команда
// оператора (AC-13), сеть ЮKassa (AC-5), порядок входа маршрутов оплаты (AC-1, AC-5, AC-6), надпись призыва у paid
// (находка 1 ревью фич 25–29), экраны при выключенной и включённой оплате.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadLimits, loadWebConfig } from '../packages/shared/src/config';
import { PAID_PLAN_DAYS, PAID_PRICE_MINOR, clipExpiry, effectivePlan, formatRubles, loadPaymentsConfig } from '../packages/shared/src/tariff';
import { CTA_FRAME_LABELS, CTA_FRAME_LABELS_PAID, ctaFrameLabel } from '../packages/shared/src/cta';
import { prepareCta } from '../apps/worker/src/render/cta-overlay';
import { parseSetPlanArgs } from '../packages/db/src/ops-set-plan';
import { effectivePlanSql, retentionFromSql } from '../packages/db/src/plan';
import { selectPaymentProvider } from '../apps/web/src/server/payments/config';
import { verifyYooKassaOrigin } from '../apps/web/src/server/payments/origin';
import { PaymentProviderUnavailable, PaymentVerificationError, type PaymentProvider } from '../apps/web/src/server/payments/provider';
import { createCheckoutHandler, createCheckoutStatusHandler, createPaymentWebhookHandler, type BillingDependencies } from '../apps/web/src/server/billing-handler';
import { RETURN_DEADLINE_MS, RETURN_MAX_ATTEMPTS, decideReturnState, safeNextPath } from '../apps/web/src/lib/payment-return';
import { ProInterest } from '../apps/web/src/app/dashboard/ProInterest';
import { environment } from './fixtures/environment';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const LIVE = { N5_PAYMENTS_MODE: 'live', YOOKASSA_SHOP_ID: '123456', YOOKASSA_SECRET_KEY: 'test_secret', YOOKASSA_TEST_MODE: 'true' };

describe('режим оплаты и потолок минут paid (AC-14, AC-15)', () => {
  it('не задан или off → off, провайдера нет', () => {
    expect(loadPaymentsConfig({})).toEqual({ mode: 'off' });
    expect(loadPaymentsConfig({ N5_PAYMENTS_MODE: 'off' })).toEqual({ mode: 'off' });
    expect(selectPaymentProvider(loadPaymentsConfig({}))).toBeNull();
  });
  it('пусто, пробел и неизвестный режим — отказ с именем переменной, а не «выключено»', () => {
    for (const mode of ['', ' ', 'LIVE', 'on', 'true', 'fake ']) {
      expect(() => loadPaymentsConfig({ N5_PAYMENTS_MODE: mode }), JSON.stringify(mode)).toThrow(/N5_PAYMENTS_MODE/);
    }
  });
  it('fake разрешён вне production и запрещён в production', () => {
    expect(loadPaymentsConfig({ N5_PAYMENTS_MODE: 'fake', NODE_ENV: 'test' })).toEqual({ mode: 'fake' });
    expect(() => loadPaymentsConfig({ N5_PAYMENTS_MODE: 'fake', NODE_ENV: 'production' })).toThrow(/production/);
  });
  it('live без магазина, без ключа или с неявным режимом test — отказ, называющий переменную', () => {
    expect(loadPaymentsConfig(LIVE)).toMatchObject({ mode: 'live', shopId: '123456', testMode: true });
    expect(selectPaymentProvider(loadPaymentsConfig(LIVE))?.name).toBe('yookassa');
    for (const [name, value] of [['YOOKASSA_SHOP_ID', ''], ['YOOKASSA_SHOP_ID', 'shop-1'], ['YOOKASSA_SECRET_KEY', ''], ['YOOKASSA_SECRET_KEY', ' secret'],
      ['YOOKASSA_TEST_MODE', ''], ['YOOKASSA_TEST_MODE', 'yes'], ['YOOKASSA_TEST_MODE', 'TRUE']] as const) {
      expect(() => loadPaymentsConfig({ ...LIVE, [name]: value }), `${name}=${value}`).toThrow(new RegExp(name));
    }
  });
  it('web не стартует с непригодным режимом (preflight читает loadWebConfig)', () => {
    expect(loadWebConfig(environment()).payments).toEqual({ mode: 'off' });
    expect(() => loadWebConfig({ ...environment(), N5_PAYMENTS_MODE: '' })).toThrow(/N5_PAYMENTS_MODE/);
  });
  it('N5_LIMIT_PAID_USER_MINUTES: обязателен, положительное целое, не выше суточного потолка', () => {
    expect(loadLimits(environment()).N5_LIMIT_PAID_USER_MINUTES).toBe(270);
    const env = environment(); delete env.N5_LIMIT_PAID_USER_MINUTES;
    expect(() => loadLimits(env)).toThrow(/N5_LIMIT_PAID_USER_MINUTES отсутствует/);
    for (const bad of ['', '0', '-1', '270.5', ' 270']) expect(() => loadLimits({ ...environment(), N5_LIMIT_PAID_USER_MINUTES: bad }), bad).toThrow(/N5_LIMIT_PAID_USER_MINUTES/);
    expect(loadLimits({ ...environment(), N5_LIMIT_PAID_USER_MINUTES: '600' }).N5_LIMIT_PAID_USER_MINUTES).toBe(600);
    expect(() => loadLimits({ ...environment(), N5_LIMIT_PAID_USER_MINUTES: '601' })).toThrow(/больше суточного N5_LIMIT_GLOBAL_MINUTES/);
  });
});

describe('цена и действующий план (OWN-019, AC-11)', () => {
  it('990 ₽ за 30 дней — константы кода', () => {
    expect([PAID_PRICE_MINOR, PAID_PLAN_DAYS]).toEqual([99_000, 30]);
    expect(formatRubles(99_000)).toBe('990 ₽');
    for (const bad of [0, -100, 1.5, Number.NaN]) expect(() => formatRubles(bad), String(bad)).toThrow();
  });
  const now = new Date('2026-10-01T00:00:00Z');
  it('оплаченный план истекает по сроку ДО прохода сторожа; оператор и старый paid — бессрочно', () => {
    expect(effectivePlan('paid', 'payment', '2026-10-01T00:00:01Z', now)).toBe('paid');
    expect(effectivePlan('paid', 'payment', '2026-10-01T00:00:00Z', now)).toBe('free');
    expect(effectivePlan('paid', 'payment', null, now)).toBe('free');
    expect(effectivePlan('paid', 'operator', null, now)).toBe('paid');
    expect(effectivePlan('paid', 'none', null, now)).toBe('paid');
  });
  it('fail-closed: всё, что не ровно paid, и неизвестный источник — free', () => {
    for (const plan of [null, undefined, '', 'PAID', ' paid', 'premium', 0, 1, true, {}, ['paid']]) {
      expect(effectivePlan(plan, 'operator', null, now), JSON.stringify(plan)).toBe('free');
    }
    for (const source of ['PAYMENT', '', null, 'gift']) expect(effectivePlan('paid', source, '2099-01-01T00:00:00Z', now), String(source)).toBe('free');
  });
  it('SQL-зеркало: сравнение на равенство, срок только у payment, время — параметр или now()', () => {
    expect(effectivePlanSql('a')).toBe("(CASE WHEN a.plan='paid' AND (a.plan_source IN ('none','operator') OR (a.plan_source='payment' AND a.plan_paid_until > now())) THEN 'paid' ELSE 'free' END)");
    expect(effectivePlanSql('a', '$4')).toContain('plan_paid_until > $4');
    expect(() => effectivePlanSql('a; DROP', 'now()')).toThrow(); expect(() => effectivePlanSql('a', 'now() OR true')).toThrow();
    expect(retentionFromSql('v', 'a')).toContain('GREATEST(v.finished_at, a.plan_paid_until)');
  });
  it('срок хранения: от готовности, но не раньше конца оплаты; явный expires_at сильнее', () => {
    const finished = new Date('2026-09-01T00:00:00Z');
    const clipId = '11111111-1111-4111-8111-111111111111';
    const expiry = (expiresAt: Date | null, plan: unknown, retentionFrom: Date | null) => clipExpiry({ clipId, expiresAt, plan, retentionFrom });
    expect(expiry(null, 'free', finished)?.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    expect(expiry(null, 'paid', finished)).toBeNull();
    expect(expiry(null, 'free', null)).toBeNull();
    for (const bad of [null, undefined, '', 'PAID', ' paid', 'premium', 0, true]) expect(expiry(null, bad, finished), String(bad)).not.toBeNull();
    const explicit = new Date('2026-09-02T00:00:00Z');
    expect(expiry(explicit, 'paid', finished)).toBe(explicit);
  });
  // BACKLOG §5а (ревью Opus 28.09, находка 2): правило «бесплатный клип = retention_from + 3 сут, витрина — без срока»
  // жило в шести местах, исключение витрины — в двух. Теперь число и исключение — ровно в tariff.ts (TS) и plan.ts (SQL).
  it('срок бесплатного клипа и исключение витрины записаны ровно в одном месте на язык', () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (!/^(node_modules|dist|\.next)$/.test(entry.name)) walk(path); }
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    } };
    for (const root of ['apps/web/src', 'apps/worker/src', 'packages/db/src', 'packages/shared/src', 'packages/queue/src', 'packages/s3/src']) walk(root);
    expect(files.length).toBeGreaterThan(50);
    const offenders = (pattern: RegExp) => files.filter(file => pattern.test(readFileSync(file, 'utf8'))).sort();
    // Формула срока: 3 суток любым написанием — только определение константы (72 ч удаления аккаунта — другое правило, erasure.ts).
    expect(offenders(/\b3\s*\*\s*86_?400(_?000)?\b|'72 hours'|interval '3 days?'|\b259_?200(_?000)?\b/))
      .toEqual(['packages/shared/src/tariff.ts']);
    expect(offenders(/FREE_RETENTION_MS/)).toEqual(['packages/db/src/plan.ts', 'packages/shared/src/tariff.ts']);
    // Исключение витрины из срока: TS — clipExpiry, SQL — clipAliveSql. Никаких собственных копий в чтениях и ретенции.
    expect(offenders(/isShowcaseClip\(|SHOWCASE_CLIP_IDS/)).toEqual(['packages/db/src/plan.ts', 'packages/shared/src/showcase.ts', 'packages/shared/src/tariff.ts']);
  });
});

describe('надпись призыва у клипа без метки (находка 1 ревью фич 25–29)', () => {
  it('у paid ни одна надпись не отсылает к ссылке; у free — словарь пути «метка → /c/КОД»', () => {
    for (const label of Object.values(CTA_FRAME_LABELS_PAID)) if (label !== null) expect(label).not.toMatch(/ссылк|ниже|по ссылке/i);
    expect(ctaFrameLabel('subscribe', true)).toBe(CTA_FRAME_LABELS.subscribe);
    expect(ctaFrameLabel('subscribe', false)).toBe('Подписывайтесь на автора');
    expect(ctaFrameLabel('watch_full', false)).toBe('Смотрите полный выпуск');
    expect(ctaFrameLabel('open_link', false)).toBeNull();
  });
  it('пара «paid + призыв» в рендере: текст без ссылки, open_link не рисуется и пишет причину', () => {
    const paid = prepareCta('subscribe', 1080, 1920, 30, false, false)!;
    expect(paid.result.text).toBe('Подписывайтесь на автора');
    expect(paid.filter).not.toMatch(/ссылк|ниже/);
    const free = prepareCta('subscribe', 1080, 1920, 30, false, true)!;
    expect(free.result.text).toBe('Подписывайтесь — ссылка ниже');
    const reasons: string[] = [];
    expect(prepareCta('open_link', 1080, 1920, 30, false, false, r => reasons.push(r))).toBeNull();
    expect(reasons).toEqual(['paid_no_link']);
  });
});

describe('экран возврата: шесть различимых состояний (AC-10)', () => {
  it('успех, отказ, выполняется, не подтверждено, не найдено', () => {
    expect(decideReturnState({ status: 'succeeded', account_plan: 'paid', plan_paid_until: '2026-10-28T00:00:00.000Z' }, 1))
      .toEqual({ kind: 'succeeded', until: '2026-10-28T00:00:00.000Z' });
    expect(decideReturnState({ status: 'canceled' }, 1)).toEqual({ kind: 'failed' });
    expect(decideReturnState({ status: 'pending' }, 3)).toEqual({ kind: 'waiting', attempts: 3 });
    expect(decideReturnState('not_found', 1)).toEqual({ kind: 'not_found' });
  });
  it('оплата прошла, но план сейчас не paid — «не действует», а не «включён»', () => {
    for (const plan of ['free', undefined, 'PAID', null]) expect(decideReturnState({ status: 'succeeded', account_plan: plan }, 1), String(plan)).toEqual({ kind: 'paid_inactive' });
  });
  it('предел по времени и по попыткам: молчание → «не подтверждено», не «отказ»', () => {
    expect(decideReturnState(null, 2, RETURN_DEADLINE_MS - 1)).toEqual({ kind: 'waiting', attempts: 2 });
    expect(decideReturnState(null, 2, RETURN_DEADLINE_MS)).toEqual({ kind: 'unconfirmed' });
    expect(decideReturnState({ status: 'pending' }, RETURN_MAX_ATTEMPTS)).toEqual({ kind: 'unconfirmed' });
    expect(decideReturnState({ status: 'SUCCEEDED' }, 1)).toEqual({ kind: 'waiting', attempts: 1 });
  });
});

describe('адрес после входа, команда оператора, сеть ЮKassa', () => {
  it('next — только /upgrade?from=<закрытый набор>', () => {
    for (const from of ['clip_card', 'partner_dashboard', 'guest_page']) expect(safeNextPath(`/upgrade?from=${from}`)).toBe(`/upgrade?from=${from}`);
    // Ревью, круг 1, находка 3: экран возврата с формы оплаты переживает вход.
    const back = '/upgrade/return?intent=0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(safeNextPath(back)).toBe(back);
    for (const bad of [`${back}&x=1`, '/upgrade/return?intent=unknown', '/upgrade/return?intent=0f8fad5b-d9cb-469f-a165-70867728950e#x', '/upgrade/return']) {
      expect(safeNextPath(bad), bad).toBeNull();
    }
    for (const bad of ['https://evil.example/upgrade?from=clip_card', '//evil.example', '/upgrade?from=pricing', '/upgrade?from=clip_card&x=1', '/dashboard', '', null, ['/upgrade?from=clip_card']]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it('ops:set-plan: почта, план, --by и --reason обязательны; лишнее — отказ', () => {
    expect(parseSetPlanArgs(['a@b.ru', 'paid', '--by', 'ops', '--reason', 'пилот'])).toEqual({ email: 'a@b.ru', plan: 'paid', operator: 'ops', reason: 'пилот' });
    for (const bad of [['a@b.ru', 'paid'], ['a@b.ru', 'paid', '--by', 'ops'], ['a@b.ru', '--by', 'ops', '--reason', 'x'], ['a@b.ru', 'paid', '--by']]) {
      expect(parseSetPlanArgs(bad), bad.join(' ')).toBeNull();
    }
  });
  it('сеть ЮKassa — список в коде; пустой, неизвестный и соседний адрес — отказ', () => {
    expect(verifyYooKassaOrigin('185.71.76.10')).toEqual({ ok: true, ip: '185.71.76.10' });
    expect(verifyYooKassaOrigin('2a02:5180::1')).toMatchObject({ ok: true });
    expect(verifyYooKassaOrigin('185.71.76.100')).toEqual({ ok: false, reason: 'foreign_ip' });
    for (const bad of ['', 'unknown', null, undefined]) expect(verifyYooKassaOrigin(bad as string)).toEqual({ ok: false, reason: 'no_ip' });
  });
});

describe('порядок входа маршрутов оплаты', () => {
  const PUBLIC = 'https://clipmkr.test.invalid';
  const TOKEN = 'A'.repeat(43);
  const XFF = (client: string) => `${client}, 10.0.0.2, 10.0.0.3`;
  const unused: PaymentProvider = { name: 'fake', createPayment: async () => { throw new Error('нет'); }, getPayment: async () => { throw new Error('нет'); },
    verifyNotification: async () => { throw new Error('нет'); } };
  function deps(calls: string[], over: Partial<BillingDependencies> = {}): BillingDependencies {
    const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
    return {
      publicOrigin: PUBLIC, trustedProxyHops: 2, provider: unused, log: () => {},
      authenticate: async () => { calls.push('auth'); return { account_id: '11111111-1111-4111-8111-111111111111' }; },
      allowMutation: async () => { calls.push('limit'); return true; }, allowRead: async () => { calls.push('read-limit'); return true; },
      createIntent: touch('intent'), setIntentPayment: touch('set'), readIntent: touch('read'), markCanceled: touch('cancel'),
      applyPayment: touch('apply'), recordRefund: touch('refund'), ...over,
    };
  }
  const post = (url: string, headers: Record<string, string>, payload: unknown) => new Request(`${PUBLIC}${url}`, { method: 'POST',
    headers: { 'x-forwarded-for': XFF('198.51.100.7'), 'content-type': 'application/json', cookie: `__Host-n5_session=${TOKEN}`, ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  it('AC-1: оплата выключена — оформление, опрос и вебхук отвечают 404, ничего не читая', async () => {
    const calls: string[] = [];
    const off = deps(calls, { provider: null });
    expect((await createCheckoutHandler(off)(post('/api/checkout', { origin: PUBLIC }, { idempotency_key: 'k'.repeat(10) }))).status).toBe(404);
    expect((await createCheckoutStatusHandler(off)(new Request(`${PUBLIC}/api/checkout/x`), 'x')).status).toBe(404);
    expect((await createPaymentWebhookHandler(off)(post('/api/webhooks/yookassa', {}, '{}'))).status).toBe(404);
    expect(calls).toEqual([]);
  });
  it('оформление: лимит → Origin → сессия → тело; чужой Origin 403, без Origin 403, лишнее поле 422 — до намерения', async () => {
    const calls: string[] = [];
    expect((await createCheckoutHandler(deps(calls, { allowMutation: async () => { calls.push('limit'); return false; } }))(post('/api/checkout', { origin: PUBLIC }, {}))).status).toBe(429);
    expect((await createCheckoutHandler(deps(calls))(post('/api/checkout', { origin: 'https://evil.example' }, { idempotency_key: 'k'.repeat(10) }))).status).toBe(403);
    expect((await createCheckoutHandler(deps(calls))(post('/api/checkout', {}, { idempotency_key: 'k'.repeat(10) }))).status).toBe(403);
    expect((await createCheckoutHandler(deps(calls, { authenticate: async () => null }))(post('/api/checkout', { origin: PUBLIC }, { idempotency_key: 'k'.repeat(10) }))).status).toBe(401);
    for (const body of [{ idempotency_key: 'k'.repeat(10), price_minor: 1 }, { plan: 'paid', idempotency_key: 'k'.repeat(10) }, { idempotency_key: 'short' }, 'not json']) {
      expect((await createCheckoutHandler(deps(calls))(post('/api/checkout', { origin: PUBLIC }, body))).status, JSON.stringify(body)).toBe(422);
    }
    expect(calls.filter((c) => !['auth', 'limit'].includes(c))).toEqual([]);
  });
  it('AC-5/AC-6 вебхук: адрес вне сетей ЮKassa — 400 ДО провайдера; подделка 400; недоступность 503 — без записи', async () => {
    const seen: string[] = [];
    const provider = (outcome: 'forged' | 'down'): PaymentProvider => ({ ...unused, name: 'yookassa',
      verifyNotification: async () => { seen.push('verify'); throw outcome === 'forged' ? new PaymentVerificationError('подделка') : new PaymentProviderUnavailable('500'); } });
    const hook = (p: PaymentProvider, xff: string) => createPaymentWebhookHandler(deps(seen, { provider: p }))(new Request(`${PUBLIC}/api/webhooks/yookassa`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: '{"event":"payment.succeeded"}' }));
    expect((await hook(provider('forged'), XFF('203.0.113.9'))).status).toBe(400);
    expect((await hook(provider('forged'), '185.71.76.10')).status).toBe(400); // цепочка короче доверенных хопов
    expect(seen).toEqual([]);
    expect((await hook(provider('forged'), XFF('185.71.76.10'))).status).toBe(400);
    expect((await hook(provider('down'), XFF('185.71.76.10'))).status).toBe(503);
    expect(seen).toEqual(['verify', 'verify']);
  });
});

describe('экраны: выключенная и включённая оплата', () => {
  it('off — прежний экран интереса без платёжных слов; on — ссылка на /upgrade с ценой и экраном-источником', () => {
    const off = renderToStaticMarkup(createElement(ProInterest, { source: 'clip_card' }));
    expect(off).toContain('Нужен тариф побольше'); expect(off).not.toMatch(/upgrade|990|оплат/i);
    const on = renderToStaticMarkup(createElement(ProInterest, { source: 'clip_card', paymentsOn: true }));
    expect(on).toContain('href="/upgrade?from=clip_card"'); expect(on).toContain('990'); expect(on).not.toContain('Нужен тариф побольше');
  });
});
