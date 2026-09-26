// partner-and-studio без БД: арифметика комиссии и календарь выплат (N4 — перенесено), реквизиты (СБП, отказ номеру карты),
// cookie реферала (подпись, срок, первая ссылка сильнее), /r/{code} (один ответ для любого кода), регистрация с кодом
// (ошибка поля, вход поле не принимает), порядок входа маршрутов партнёра и студии, команды оператора, стражи по исходнику
// (AC-16: деньги партнёра пишет только commission.ts и только из транзакции платежа).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMISSION_HOLD_DAYS, PAYOUT_MINIMUM_MINOR, accrualAmountMinor, availableForPayoutMinor, commissionBaseMinor, formatRub, maturesAt,
  nextPayoutDate, previewNextPayout, withinCommissionWindow, type CommissionEntry } from '../packages/rag/src/commission';
import { looksLikeCardNumber, normalizePhone, validatePayoutDetails } from '../packages/rag/src/payout-details';
import { normalizePartnerCode } from '../packages/db/src/partners';
import { csvText, parseOpsArgs, parseRubles, rublesCell } from '../packages/db/src/ops-partners';
import { REFERRAL_COOKIE, readReferral, referralSetCookie } from '../apps/web/src/lib/partner-referral';
import { safeNextPath } from '../apps/web/src/lib/payment-return';
import { createReferralHandler } from '../apps/web/src/server/referral-handler';
import { createAcceptInviteHandler, createInviteHandler, createPartnerSummaryHandler, createPayoutDetailsHandler,
  type PartnerDependencies } from '../apps/web/src/server/partner-handler';
import { AuthService, type AuthStore } from '../apps/web/src/server/auth';
import { createAuthHandler } from '../apps/web/src/server/auth-handler';

const DAY = 86_400_000;
const SECRET = 'r'.repeat(64);
const entry = (kind: CommissionEntry['kind'], amountMinor: number, availableAt: Date): CommissionEntry => ({ kind, amountMinor, availableAt });

describe('арифметика комиссии (N4 — перенесено; числа владельца 26.09)', () => {
  it('floor, базисные пункты, неположительная база — 0; дробь — отказ', () => {
    expect(accrualAmountMinor(95_535, 2000)).toBe(19_107);
    expect(accrualAmountMinor(1, 2000)).toBe(0);
    expect(accrualAmountMinor(0, 2000)).toBe(0);
    expect(accrualAmountMinor(-500, 2000)).toBe(0);
    expect(() => accrualAmountMinor(10.5, 2000)).toThrow();
    expect(() => accrualAmountMinor(100, 10_001)).toThrow();
  });
  it('база — сумма минус удержание; удержание неизвестно или больше суммы — базы нет (не «вся сумма»)', () => {
    expect(commissionBaseMinor(99_000, 3_465)).toBe(95_535);
    for (const fee of [null, -1, 99_001, 1.5]) expect(commissionBaseMinor(99_000, fee), String(fee)).toBeNull();
  });
  it('зрелость +30 дней включительно; долг уменьшает доступное сразу', () => {
    const paid = new Date('2026-09-01T10:00:00Z');
    expect(maturesAt(paid).getTime() - paid.getTime()).toBe(COMMISSION_HOLD_DAYS * DAY);
    const list = [entry('accrual', 20_000, maturesAt(paid)), entry('clawback', -5_000, paid)];
    expect(availableForPayoutMinor(list, new Date(maturesAt(paid).getTime() - 1))).toBe(-5_000);
    expect(availableForPayoutMinor(list, maturesAt(paid))).toBe(15_000);
  });
  it('выплата 5-го по Москве; меньше 1 000 ₽ переносится; долг показывается долгом, а не нулём', () => {
    expect(nextPayoutDate(new Date('2026-09-26T10:00:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(nextPayoutDate(new Date('2026-10-04T20:59:59Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
    const old = new Date('2026-08-01T00:00:00Z');
    const small = previewNextPayout([entry('accrual', PAYOUT_MINIMUM_MINOR - 1, old)], new Date('2026-09-26T00:00:00Z'));
    expect([small.dueMinor, small.deferredMinor]).toEqual([0, PAYOUT_MINIMUM_MINOR - 1]);
    const enough = previewNextPayout([entry('accrual', PAYOUT_MINIMUM_MINOR, old), entry('accrual', 7_000, new Date('2026-10-20T00:00:00Z'))], new Date('2026-09-26T00:00:00Z'));
    expect([enough.dueMinor, enough.deferredMinor]).toEqual([PAYOUT_MINIMUM_MINOR, 7_000]);
    const debt = previewNextPayout([entry('accrual', 19_107, old), entry('payout', -19_107, old), entry('clawback', -19_107, old)], new Date('2026-09-26T00:00:00Z'));
    expect([debt.dueMinor, debt.debtMinor]).toEqual([0, 19_107]);
  });
  it('окно 12 месяцев с первой оплаты — граница не включается', () => {
    const first = new Date('2026-01-31T00:00:00Z');
    expect(withinCommissionWindow(first, new Date('2027-01-30T23:59:59Z'))).toBe(true);
    expect(withinCommissionWindow(first, new Date('2027-01-31T00:00:00Z'))).toBe(false);
  });
  it('рубли без плавающей точки', () => {
    expect(formatRub(19_107)).toBe('191,07 ₽');
    expect(formatRub(100_000)).toBe('1 000 ₽');
    expect(formatRub(-500)).toBe('−5 ₽');
  });
});

describe('реквизиты выплаты (N4 — перенесено, только СБП)', () => {
  it('телефон нормализуется; номер карты отвергается в ЛЮБОМ поле; другой способ — отказ', () => {
    expect(normalizePhone('8 (900) 000-00-00')).toBe('+79000000000');
    expect(validatePayoutDetails({ method: 'sbp', phone: '+7 900 000-00-00', bank: 'Т-Банк' })).toEqual({ ok: true, value: { method: 'sbp', phone: '+79000000000', bank: 'Т-Банк' } });
    expect(looksLikeCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(validatePayoutDetails({ method: 'sbp', phone: '4111111111111111' })).toEqual({ ok: false, error: 'card_number_refused' });
    expect(validatePayoutDetails({ method: 'sbp', phone: '+79000000000', bank: '4111 1111 1111 1111' })).toEqual({ ok: false, error: 'card_number_refused' });
    for (const method of ['card', 'other', undefined, 'SBP']) expect(validatePayoutDetails({ method, phone: '+79000000000' }).ok, String(method)).toBe(false);
    expect(validatePayoutDetails({ method: 'sbp', phone: '12345' })).toEqual({ ok: false, error: 'invalid_phone' });
  });
});

describe('cookie реферала и /r/{code} (N5 — адаптировано: 30 дней, форма N6)', () => {
  it('подпись, срок, форма; подделка и чужой срок — игнорируются; действующая cookie не перезаписывается', () => {
    const now = Date.parse('2026-09-26T10:00:00Z');
    const set = referralSetCookie(null, 'studio7', SECRET, now)!;
    expect(set).toMatch(/^__Host-n6_ref=studio7\.\d{10}\.[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    const header = set.split(';')[0]!;
    expect(readReferral(header, SECRET, now)).toBe('studio7');
    expect(readReferral(header, 'x'.repeat(64), now)).toBeNull();
    expect(readReferral(header.replace('studio7', 'studio8'), SECRET, now)).toBeNull();
    expect(readReferral(header, SECRET, now + 31 * DAY)).toBeNull();
    expect(readReferral(`${header}; ${header}`, SECRET, now)).toBeNull();
    expect(referralSetCookie(header, 'other', SECRET, now)).toBeNull();
    for (const bad of ['ab', 'a b', 'x'.repeat(41), 'код']) expect(referralSetCookie(null, bad, SECRET, now), bad).toBeNull();
  });
  it('/r/{code}: 302 на лендинг для ЛЮБОГО кода; cookie — только живому; сбой БД переход не ломает', async () => {
    const live = new Set(['studio7']);
    const handler = createReferralHandler({ publicOrigin: 'https://sufler.test', secret: SECRET, isLiveCode: async (c) => live.has(c), log: () => {} });
    for (const value of ['studio7', 'net-takogo', '<script>']) {
      const r = await handler(new Request(`https://sufler.test/r/${encodeURIComponent(value)}`), value);
      expect([r.status, r.headers.get('location')], value).toEqual([302, 'https://sufler.test/']);
      expect(r.headers.get('set-cookie')?.startsWith(REFERRAL_COOKIE) ?? false, value).toBe(value === 'studio7');
    }
    const broken = createReferralHandler({ publicOrigin: 'https://sufler.test', secret: SECRET, isLiveCode: async () => { throw new Error('db'); }, log: () => {} });
    expect((await broken(new Request('https://sufler.test/r/studio7'), 'studio7')).status).toBe(302);
  });
  it('код партнёра: только края, регистр значим, форма канона', () => {
    expect(normalizePartnerCode('  seed-net ')).toBe('seed-net');
    for (const bad of ['', 'ab', 'a b', 'код', null, 7, 'x'.repeat(41)]) expect(normalizePartnerCode(bad), String(bad)).toBeNull();
  });
  it('next после входа: приглашение с токеном 43 символа — да; иначе — нет (открытого редиректа нет)', () => {
    const token = 'A'.repeat(43);
    expect(safeNextPath(`/invite/${token}`)).toBe(`/invite/${token}`);
    for (const bad of [`/invite/${token}x`, `/invite/${token}?x=1`, '//evil.example', '/invite/short', `https://evil.example/invite/${token}`]) expect(safeNextPath(bad), bad).toBeNull();
  });
});

describe('регистрация с кодом партнёра (FR-PARTNER-001)', () => {
  const store = (result: 'ok' | 'invalid_code'): AuthStore => ({ findAccount: vi.fn(async () => null), register: vi.fn(async () => result),
    createSession: vi.fn(async () => true), revoke: vi.fn(async () => {}), findSession: vi.fn(async () => null) });
  const call = (action: 'register' | 'login', db: AuthStore, body: object, cookie?: string) => createAuthHandler(action, {
    auth: new AuthService(db, SECRET), publicOrigin: 'https://test.invalid', allowMutation: async () => true,
    referralCode: action === 'register' ? () => (cookie ? 'fromcookie' : null) : undefined,
  })(new Request(`https://test.invalid/api/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9' },
    body: JSON.stringify({ email: 'user@example.org', password: 'пароль-12345', ...body }) }));
  it('неверный явный код — 422 с полем partner_code; код и cookie доходят до хранилища; вход поле кода не принимает', async () => {
    const bad = store('invalid_code');
    const r = await call('register', bad, { partner_code: ' studio7 ' }, 'yes');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: { code: 'invalid_partner_code', field: 'partner_code' } });
    expect(bad.register).toHaveBeenCalledWith('user@example.org', expect.any(String), expect.any(Object), { explicit: 'studio7', cookie: 'fromcookie' });
    const ok = store('ok');
    const done = await call('register', ok, { partner_code: '' }, 'yes');
    expect(done.status).toBe(200);
    expect(done.headers.getSetCookie().some((c) => c.startsWith('__Host-n6_ref=;'))).toBe(true);
    expect(ok.register).toHaveBeenCalledWith('user@example.org', expect.any(String), expect.any(Object), { explicit: null, cookie: 'fromcookie' });
    expect((await call('login', store('ok'), { partner_code: 'studio7' })).status).toBe(422);
  });
});

describe('порядок входа маршрутов партнёра и студии', () => {
  function deps(calls: string[], over: Partial<PartnerDependencies> = {}): PartnerDependencies {
    const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
    return { publicOrigin: 'https://sufler.test', authenticate: async () => { calls.push('auth'); return { account_id: '11111111-1111-4111-8111-111111111111' }; },
      allowMutation: async () => { calls.push('limit'); return true; }, partnerCabinet: touch('cabinet'), savePayoutDetails: touch('save'),
      studioCabinet: touch('studio'), createInvite: touch('invite'), acceptInvite: touch('accept'), log: () => {}, ...over };
  }
  const post = (origin: string | null, body: unknown = {}) => new Request('https://sufler.test/api/x', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.9', cookie: `__Host-n6_session=${'A'.repeat(43)}`, ...(origin ? { origin } : {}) },
    body: JSON.stringify(body) });
  const BOT = '22222222-2222-4222-8222-222222222222';
  it('чужой/пустой Origin — 403 ДО записи; не-UUID бота и плохой токен — 404 ДО записи; лишнее поле — 400', async () => {
    for (const origin of ['https://evil.example', null]) {
      const calls: string[] = [];
      expect((await createInviteHandler(deps(calls))(post(origin, { email: 'c@example.ru' }), BOT)).status).toBe(403);
      expect((await createAcceptInviteHandler(deps(calls))(post(origin), 'A'.repeat(43))).status).toBe(403);
      expect(calls).not.toContain('invite');
      expect(calls).not.toContain('accept');
    }
    const calls: string[] = [];
    expect((await createInviteHandler(deps(calls))(post('https://sufler.test', { email: 'c@example.ru' }), 'not-uuid')).status).toBe(404);
    expect((await createAcceptInviteHandler(deps(calls))(post('https://sufler.test'), 'short')).status).toBe(404);
    expect((await createInviteHandler(deps(calls))(post('https://sufler.test', { email: 'c@example.ru', bot_id: BOT }), BOT)).status).toBe(400);
    expect((await createInviteHandler(deps(calls))(post('https://sufler.test', { email: 'не почта' }), BOT)).status).toBe(422);
    expect(calls).not.toContain('invite');
  });
  it('исходы приёма → HTTP: used 409, expired 410, plan_limit 409 с названием предела, own_invite 409', async () => {
    const cases: Array<[Awaited<ReturnType<PartnerDependencies['acceptInvite']>>, number, string]> = [
      [{ kind: 'used' }, 409, 'used'], [{ kind: 'expired' }, 410, 'expired'], [{ kind: 'own_invite' }, 409, 'own_invite'],
      [{ kind: 'plan_limit', plan: 'free', limit: 1 }, 409, 'plan_limit'], [{ kind: 'not_found' }, 404, 'not_found']];
    for (const [result, status, code] of cases) {
      const r = await createAcceptInviteHandler(deps([], { acceptInvite: async () => result }))(post('https://sufler.test'), 'A'.repeat(43));
      expect([r.status, ((await r.json()) as { error: { code: string } }).error.code]).toEqual([status, code]);
    }
  });
  it('реквизиты: номер карты — 422 без записи; не партнёр — 404; сводка без сессии — 401', async () => {
    const calls: string[] = [];
    const r = await createPayoutDetailsHandler(deps(calls))(post('https://sufler.test', { method: 'sbp', phone: '4111 1111 1111 1111' }));
    expect([r.status, ((await r.json()) as { error: { code: string } }).error.code]).toEqual([422, 'card_number_refused']);
    expect(calls).not.toContain('save');
    const notPartner = await createPayoutDetailsHandler(deps([], { partnerCabinet: async () => null }))(post('https://sufler.test', { method: 'sbp', phone: '+79000000000' }));
    expect(notPartner.status).toBe(404);
    const anon = await createPartnerSummaryHandler(deps([], { authenticate: async () => null }))(new Request('https://sufler.test/api/partner/summary'));
    expect(anon.status).toBe(401);
  });
});

describe('команды оператора', () => {
  it('аргументы, рубли без плавающей точки, CSV с защитой от формул', () => {
    expect(parseOpsArgs(['payout', 'p@example.ru', '--amount', '1500,5', '--key', 'k1', '--by', 'о', '--reason', 'выплата']))
      .toEqual({ command: 'payout', positional: ['p@example.ru'], flags: { '--amount': '1500,5', '--key': 'k1', '--by': 'о', '--reason': 'выплата' } });
    for (const bad of [['payout', '--amount'], ['issue', '--unknown', 'x'], ['issue', '--by', 'a', '--by', 'b'], []]) expect(parseOpsArgs(bad), bad.join(' ')).toBeNull();
    expect([parseRubles('1500'), parseRubles('1500,5'), parseRubles('1500.05'), parseRubles('1,234'), parseRubles('-5'), parseRubles('1e3')]).toEqual([150_000, 150_050, 150_005, null, null, null]);
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('ООО "Ромашка"; отдел')).toBe('"ООО ""Ромашка""; отдел"');
    expect(rublesCell(-19_107)).toBe('-191,07');
  });
});

// AC-16: деньги партнёра пишет ТОЛЬКО commission.ts; начисление и сторно зовутся ТОЛЬКО из транзакций платежа.
export function commissionWriters(files: Record<string, string>): string[] {
  return Object.entries(files).filter(([, code]) => /INSERT\s+INTO\s+commission_entry/i.test(code)).map(([file]) => file);
}
export function callSites(code: string, fn: string): string[] {
  const owners: string[] = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const before = code.slice(0, m.index);
    const fnDecl = [...before.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].pop();
    owners.push(fnDecl?.[1] ?? '<модуль>');
  }
  return owners;
}
describe('стражи по исходнику (AC-16)', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('INSERT INTO commission_entry — только в packages/db/src/commission.ts', () => {
    const files = Object.fromEntries(['packages/db/src/commission.ts', 'packages/db/src/payments.ts', 'packages/db/src/partners.ts', 'packages/db/src/studio.ts',
      'packages/db/src/ops-partners.ts', 'packages/db/src/tariffs.ts'].map((p) => [p, read(p)]));
    expect(commissionWriters(files)).toEqual(['packages/db/src/commission.ts']);
    expect(commissionWriters({ 'x.ts': 'await tx.query(`INSERT INTO commission_entry (kind) VALUES ($1)`)' })).toEqual(['x.ts']);   // страж умеет падать
  });
  it('accrueCommissionTx — только в applyVerifiedPayment; clawbackCommissionTx — только в recordVerifiedRefund', () => {
    const payments = read('packages/db/src/payments.ts');
    expect(callSites(payments, 'accrueCommissionTx')).toEqual(['applyVerifiedPayment']);
    expect(callSites(payments, 'clawbackCommissionTx')).toEqual(['recordVerifiedRefund']);
    for (const p of ['packages/db/src/partners.ts', 'packages/db/src/studio.ts', 'packages/db/src/ops-partners.ts', 'packages/db/src/tariffs.ts']) {
      expect(callSites(read(p), 'accrueCommissionTx'), p).toEqual([]);
    }
    expect(callSites('export function evil() { accrueCommissionTx(tx, x); }', 'accrueCommissionTx')).toEqual(['evil']);   // страж умеет падать
  });
});
