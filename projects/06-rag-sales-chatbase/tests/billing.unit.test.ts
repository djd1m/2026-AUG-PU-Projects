// tariffs-and-interest без БД: честность режима оплаты (AC-12), цены (AC-13), состояния экрана возврата (AC-9), адрес после
// входа (AC-14), аргументы команды оператора, адрес источника ЮKassa, порядок входа маршрутов оплаты и стражи по исходнику
// (AC-15: план меняют ровно три места; вебхук в дереве маршрутов ровно один).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PLAN_PRICE_MINOR, formatRubles } from '../packages/rag/src/constants';
import { parseSetPlanArgs } from '../packages/db/src/ops-set-plan';
import { assertPaymentsEnv, selectPaymentProvider } from '../apps/web/src/server/payments/config';
import { verifyYooKassaOrigin } from '../apps/web/src/server/payments/origin';
import { PaymentProviderUnavailable, PaymentVerificationError, type PaymentProvider } from '../apps/web/src/server/payments/provider';
import { createCheckoutHandler, createInterestHandler, createPaymentWebhookHandler, type BillingDependencies } from '../apps/web/src/server/billing-handler';
import { RETURN_DEADLINE_MS, RETURN_MAX_ATTEMPTS, decideReturnState, safeNextPath } from '../apps/web/src/lib/payment-return';

const LIVE = { N6_PAYMENTS_MODE: 'live', YOOKASSA_SHOP_ID: '123456', YOOKASSA_SECRET_KEY: 'secret', YOOKASSA_TEST_MODE: 'true' };

describe('режим оплаты (honest-configuration, AC-12)', () => {
  it('не задан → off (денег не принимаем), провайдера нет', () => {
    expect(assertPaymentsEnv({})).toBe('off');
    expect(selectPaymentProvider({})).toBeNull();
    expect(selectPaymentProvider({ N6_PAYMENTS_MODE: 'off' })).toBeNull();
  });
  it('пусто, пробел и неизвестный режим — отказ с именем переменной, а не «выключено»', () => {
    for (const mode of ['', ' ', 'LIVE', 'on', 'true', 'fake ']) {
      expect(() => assertPaymentsEnv({ N6_PAYMENTS_MODE: mode }), JSON.stringify(mode)).toThrow(/N6_PAYMENTS_MODE/);
    }
  });
  it('fake разрешён вне production и запрещён в production', () => {
    expect(assertPaymentsEnv({ N6_PAYMENTS_MODE: 'fake', NODE_ENV: 'test' })).toBe('fake');
    expect(() => assertPaymentsEnv({ N6_PAYMENTS_MODE: 'fake', NODE_ENV: 'production' })).toThrow(/production/);
  });
  it('live без магазина, без ключа или с неявным режимом test — отказ, называющий переменную', () => {
    expect(assertPaymentsEnv(LIVE)).toBe('live');
    expect(selectPaymentProvider(LIVE)?.name).toBe('yookassa');
    for (const [name, value] of [['YOOKASSA_SHOP_ID', ''], ['YOOKASSA_SHOP_ID', 'shop-1'], ['YOOKASSA_SECRET_KEY', ''], ['YOOKASSA_SECRET_KEY', ' secret'],
      ['YOOKASSA_TEST_MODE', ''], ['YOOKASSA_TEST_MODE', 'yes'], ['YOOKASSA_TEST_MODE', 'TRUE']] as const) {
      expect(() => assertPaymentsEnv({ ...LIVE, [name]: value }), `${name}=${value}`).toThrow(new RegExp(name));
    }
  });
});

describe('цены и адрес источника', () => {
  it('цены — копейки канона (990 / 4 900 ₽), строка собирается из числа (AC-13)', () => {
    expect(PLAN_PRICE_MINOR).toEqual({ nobadge: 99_000, studio: 490_000 });
    expect(formatRubles(99_000)).toBe('990 ₽');
    expect(formatRubles(490_000)).toBe('4 900 ₽');
    expect(formatRubles(0)).toBe('0 ₽');
    for (const bad of [-100, 99_050, 1.5, Number.NaN]) expect(() => formatRubles(bad), String(bad)).toThrow();
  });
  it('сеть ЮKassa — список в коде; пустой, неизвестный и соседний адрес — отказ', () => {
    expect(verifyYooKassaOrigin('185.71.76.10')).toEqual({ ok: true, ip: '185.71.76.10' });
    expect(verifyYooKassaOrigin('2a02:5180::1')).toMatchObject({ ok: true });
    expect(verifyYooKassaOrigin('185.71.76.100')).toEqual({ ok: false, reason: 'foreign_ip' });
    for (const bad of ['', 'unknown', null, undefined]) expect(verifyYooKassaOrigin(bad as string)).toEqual({ ok: false, reason: 'no_ip' });
  });
});

describe('экран возврата: шесть различимых состояний (AC-9 + ревью фичи 14)', () => {
  it('успех, отказ, выполняется, не подтверждено, не найдено', () => {
    expect(decideReturnState({ status: 'succeeded', account_plan: 'studio', plan_paid_until: '2026-10-26T00:00:00.000Z' }, 1))
      .toEqual({ kind: 'succeeded', plan: 'studio', until: '2026-10-26T00:00:00.000Z' });
    expect(decideReturnState({ status: 'canceled' }, 1)).toEqual({ kind: 'failed' });
    expect(decideReturnState({ status: 'pending' }, 3)).toEqual({ kind: 'waiting', attempts: 3 });
    expect(decideReturnState('not_found', 1)).toEqual({ kind: 'not_found' });
  });
  it('ревью, находка 6: оплата прошла, но план сейчас free — «не действует», а не «включён»', () => {
    for (const plan of ['free', undefined, 'NOBADGE', null]) expect(decideReturnState({ status: 'succeeded', account_plan: plan }, 1), String(plan)).toEqual({ kind: 'paid_inactive' });
  });
  it('ревью, находка 5: предел по времени — зависшие опросы не держат «выполняется» дольше срока', () => {
    expect(decideReturnState(null, 2, RETURN_DEADLINE_MS - 1)).toEqual({ kind: 'waiting', attempts: 2 });
    expect(decideReturnState(null, 2, RETURN_DEADLINE_MS)).toEqual({ kind: 'unconfirmed' });
  });
  it('молчание (сбой опроса) — «выполняется», а после предела попыток — «не подтверждено», НЕ «отказ»', () => {
    expect(decideReturnState(null, 1)).toEqual({ kind: 'waiting', attempts: 1 });
    expect(decideReturnState(null, RETURN_MAX_ATTEMPTS)).toEqual({ kind: 'unconfirmed' });
    expect(decideReturnState({ status: 'pending' }, RETURN_MAX_ATTEMPTS)).toEqual({ kind: 'unconfirmed' });
    // Неизвестный статус не превращается в успех.
    expect(decideReturnState({ status: 'SUCCEEDED' }, 1)).toEqual({ kind: 'waiting', attempts: 1 });
  });
});

describe('адрес после входа (AC-14) и команда оператора', () => {
  it('только /upgrade?plan=nobadge|studio; любой другой next игнорируется', () => {
    expect(safeNextPath('/upgrade?plan=nobadge')).toBe('/upgrade?plan=nobadge');
    expect(safeNextPath('/upgrade?plan=studio')).toBe('/upgrade?plan=studio');
    for (const bad of ['https://evil.example/upgrade?plan=nobadge', '//evil.example', '/upgrade?plan=free', '/upgrade?plan=nobadge&x=1', '/dashboard', '', null, ['/upgrade?plan=nobadge']]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it('ops:set-plan: почта, план, --by и --reason обязательны; лишнее — отказ', () => {
    expect(parseSetPlanArgs(['a@b.ru', 'studio', '--by', 'ops', '--reason', 'пилот'])).toEqual({ email: 'a@b.ru', plan: 'studio', operator: 'ops', reason: 'пилот' });
    for (const bad of [['a@b.ru', 'studio'], ['a@b.ru', 'studio', '--by', 'ops'], ['a@b.ru', '--by', 'ops', '--reason', 'x'], ['a@b.ru', 'studio', '--by', '--reason', 'x'],
      ['a@b.ru', 'studio', '--force', '--by', 'ops', '--reason', 'x'], ['a', 'b', 'c', '--by', 'o', '--reason', 'r']]) {
      expect(parseSetPlanArgs(bad), bad.join(' ')).toBeNull();
    }
  });
});

describe('порядок входа маршрутов оплаты', () => {
  const PUBLIC = 'https://sufler.test.invalid';
  const TOKEN = 'A'.repeat(43);
  function deps(calls: string[], over: Partial<BillingDependencies> = {}): BillingDependencies {
    const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
    return {
      publicOrigin: PUBLIC, authenticate: async () => { calls.push('auth'); return { account_id: '11111111-1111-4111-8111-111111111111' }; },
      allowMutation: async () => { calls.push('limit'); return true; }, provider: null,
      createIntent: touch('intent'), setIntentPayment: touch('set'), readIntent: touch('read'), markCanceled: touch('cancel'),
      applyPayment: touch('apply'), recordRefund: touch('refund'), recordInterest: touch('interest'),
      isOriginScreen: (v: unknown): v is 'pricing' => v === 'pricing', log: () => {}, ...over,
    } as BillingDependencies;
  }
  const post = (url: string, headers: Record<string, string>, payload: unknown) => new Request(`${PUBLIC}${url}`, { method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${TOKEN}`, ...headers }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  it('оформление: чужой Origin — 403 до тела и намерения; лишнее поле — 400; оплата выключена — 409 без намерения', async () => {
    const calls: string[] = [];
    expect((await createCheckoutHandler(deps(calls))(post('/api/checkout', { origin: 'https://evil.example' }, { plan: 'nobadge', idempotency_key: 'k'.repeat(10) }))).status).toBe(403);
    expect((await createCheckoutHandler(deps(calls))(post('/api/checkout', { origin: PUBLIC }, { plan: 'nobadge', idempotency_key: 'k'.repeat(10), amount: 1 }))).status).toBe(400);
    const off = await createCheckoutHandler(deps(calls))(post('/api/checkout', { origin: PUBLIC }, { plan: 'nobadge', idempotency_key: 'k'.repeat(10) }));
    expect([off.status, ((await off.json()) as { error: { code: string } }).error.code]).toEqual([409, 'payments_off']);
    expect(calls.filter((c) => !['auth', 'limit'].includes(c))).toEqual([]);
  });
  it('интерес: без сессии — 401 до записи', async () => {
    const calls: string[] = [];
    const r = await createInterestHandler(deps(calls, { authenticate: async () => null }))(post('/api/interest', { origin: PUBLIC }, { plan: 'nobadge', origin_screen: 'pricing' }));
    expect(r.status).toBe(401);
    expect(calls).not.toContain('interest');
  });
  it('вебхук: цепочка XFF — 400 ДО провайдера; подделка — 400 и недоступность — 503 без записи ключа повторности', async () => {
    const seen: string[] = [];
    const provider = (outcome: 'forged' | 'down'): PaymentProvider => ({ name: 'yookassa', createPayment: async () => { throw new Error('нет'); }, getPayment: async () => { throw new Error('нет'); },
      verifyNotification: async () => { seen.push('verify'); throw outcome === 'forged' ? new PaymentVerificationError('подделка') : new PaymentProviderUnavailable('500'); } });
    const hook = (p: PaymentProvider, xff: string) => createPaymentWebhookHandler(deps(seen, { provider: p }))(new Request(`${PUBLIC}/api/webhooks/yookassa`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: '{"event":"payment.succeeded"}' }));
    expect((await hook(provider('forged'), '203.0.113.9, 185.71.76.10')).status).toBe(400);
    expect(seen).toEqual([]);
    expect((await hook(provider('forged'), '185.71.76.10')).status).toBe(400);
    expect((await hook(provider('down'), '185.71.76.10')).status).toBe(503);
    expect(seen).toEqual(['verify', 'verify']);
  });
});

describe('стражи по исходнику', () => {
  const SRC = ['apps', 'packages'];
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (/^(node_modules|dist|\.next|widget-bundle)$/.test(name)) return [];
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }
  it('AC-15: план аккаунта меняют ровно три места — оплата (grantPaidPlan), сторож (expirePaidPlans), оператор (setPlanByOperator)', () => {
    const writers = SRC.flatMap(files).flatMap((file) => {
      const code = readFileSync(file, 'utf8');
      return [...code.matchAll(/UPDATE account SET plan\b/g)].map(() => path.basename(file));
    }).sort();
    expect(writers).toEqual(['payments.ts', 'payments.ts', 'tariffs.ts']);
  });
  it('ревью, находка 4: compose подставляет off ТОЛЬКО для незаданной переменной — явно пустая доходит до preflight', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    expect(compose).toContain('N6_PAYMENTS_MODE: ${N6_PAYMENTS_MODE-off}');
    expect(compose).not.toMatch(/N6_PAYMENTS_MODE:-/);
    // Секрет магазина — только у web (x-app-env/x-model-env его не несут).
    expect(compose.match(/^\s+YOOKASSA_SECRET_KEY:/gm)).toHaveLength(1);
  });
  it('AC-15: в дереве маршрутов ровно один вебхук — /api/webhooks/yookassa', () => {
    expect(readdirSync('apps/web/src/app/api/webhooks')).toEqual(['yookassa']);
  });
  it('недоступность ЮKassa — исключение, а не возвращаемое значение (урок N1): адаптер бросает PaymentProviderUnavailable на сети и 5xx', () => {
    const code = readFileSync('apps/web/src/server/payments/yookassa.ts', 'utf8');
    expect(code).toMatch(/if \(!response\.ok\) throw new PaymentProviderUnavailable/);
    expect(code).not.toMatch(/return\s+\{[^}]*unavailable/i);
  });
});
