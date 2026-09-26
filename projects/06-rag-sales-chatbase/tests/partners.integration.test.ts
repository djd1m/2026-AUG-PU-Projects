// partner-and-studio на НАСТОЯЩЕМ Postgres 16: ApplyPartnerCode, регистрация с кодом, приглашение студии, начисление и
// сторно внутри транзакции платежа фичи 14, выплата оператором, кабинеты. AC-1…AC-15 плана (docs/features/partner-and-studio/
// 01_plan.md); конкурентные случаи shared-resource-verification: 30 регистраций по коду, два приёма одного приглашения,
// «создать бота» и «принять» у одного клиента, 20 одновременных доставок оплаты, оплата и возврат одновременно.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { acceptStudioInvite, applyPartnerCodeTx, applyVerifiedPayment, createBot, createPaymentIntent, createPool, createStudioInvite,
  readPartnerCabinet, readStudioCabinet, recordPartnerPayout, recordVerifiedRefund, registerAccount, savePayoutDetails, transaction,
  type AttributionSource, type Pool } from '../packages/db/src/index';
import { issuePartnerCode, unfreezePartnerCode } from '../packages/db/src/ops-partners';
import type { PartnerCabinet, StudioCabinet } from '../packages/db/src/index';
import { createPartnerDependencies } from '../apps/web/src/server/partner-runtime';
import { createAcceptInviteHandler, createInviteHandler, createPartnerSummaryHandler, createPayoutDetailsHandler,
  createStudioSummaryHandler } from '../apps/web/src/server/partner-handler';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const DAY = 86_400_000;
const P1 = '198.51.100.0/24', P2 = '203.0.113.0/24', P3 = '192.0.2.0/24';

describe.skipIf(!databaseUrl)('партнёры и студии на настоящем Postgres', () => {
  let pool: Pool;
  const schema = `partners_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const email = () => `p${randomBytes(6).toString('hex')}@example.ru`;
  async function account(plan = 'free') {
    return (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`, [email(), plan])).rows[0]!.id;
  }
  async function code(owner: string | null, group = 'partner') {
    const value = `c${randomBytes(5).toString('hex')}`;
    await pool.query(`INSERT INTO partner_code (code, owner_account_id, "group") VALUES ($1, $2, $3)`, [value, owner, group]);
    return value;
  }
  const register = (partner: { explicit: string | null; cookie: string | null }, ipPrefix = P1, mail = email()) => registerAccount(pool, {
    email: mail, passwordHash: 'x', session: { hash: randomBytes(32).toString('hex'), ipPrefix, expiresAt: new Date(Date.now() + DAY) }, partner });
  const idOf = async (mail: string) => (await pool.query<{ id: string }>('SELECT id FROM account WHERE email = $1', [mail])).rows[0]?.id;
  const attribution = async (accountId: string) => (await pool.query<{ source: string; status: string; reject_reason: string | null; code: string }>(
    `SELECT a.source, a.status, a.reject_reason, pc.code FROM attribution a JOIN partner_code pc ON pc.id = a.partner_code_id WHERE a.account_id = $1`, [accountId])).rows[0];
  const apply = (accountId: string, value: string, source: AttributionSource, ipPrefix = P2) =>
    transaction(pool, (tx) => applyPartnerCodeTx(tx, { accountId, code: value, source, ipPrefix }));

  // Оплата фичи 14 без провайдера: намерение → applyVerifiedPayment (подлинность уже «проверена»).
  async function pay(accountId: string, over: { amount?: number; fee?: number | null; paidAt?: string; pid?: string } = {}) {
    const intent = await createPaymentIntent(pool, { accountId, plan: 'nobadge', priceMinor: over.amount ?? 99_000, idempotencyKey: randomUUID() });
    if (intent.kind === 'conflict') throw new Error('намерение');
    const pid = over.pid ?? randomUUID();
    const payment = { id: pid, orderId: intent.intent.id, amountMinor: over.amount ?? 99_000, feeMinor: over.fee === undefined ? 3_465 : over.fee,
      paidAt: over.paidAt ?? new Date().toISOString() };
    return { pid, payment, result: await applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`, payloadSha256: '0'.repeat(64), payment }) };
  }
  const refund = (payment: { id: string; orderId: string | null; amountMinor: number; feeMinor: number | null; paidAt: string | null }) =>
    recordVerifiedRefund(pool, { provider: 'fake', eventKey: `refund.succeeded:${payment.id}`, payloadSha256: '1'.repeat(64), payment });
  const entries = async (partner: string) => (await pool.query<{ kind: string; amount_minor: string; available_at: Date }>(
    `SELECT kind, amount_minor, available_at FROM commission_entry WHERE partner_account_id = $1 ORDER BY created_at, id`, [partner])).rows
    .map((e) => ({ kind: e.kind, amount: Number(e.amount_minor), availableAt: e.available_at }));

  it('AC-2: явный неверный или замороженный код — invalid_code, аккаунта нет, к cookie не откатываемся; cookie-код — атрибуция cookie', async () => {
    const owner = await account();
    const good = await code(owner);
    for (const bad of ['net-takogo', 'bad code', good.toUpperCase() === good ? 'zz' : good.toUpperCase()]) {
      const mail = email();
      expect(await register({ explicit: bad, cookie: good }, P1, mail), bad).toBe('invalid_code');
      expect(await idOf(mail)).toBeUndefined();
    }
    const frozen = await code(owner);
    await pool.query('UPDATE partner_code SET frozen = true WHERE code = $1', [frozen]);
    const mail = email();
    expect(await register({ explicit: frozen, cookie: null }, P1, mail)).toBe('invalid_code');
    expect(await idOf(mail)).toBeUndefined();
    const viaCookie = email();
    expect(await register({ explicit: null, cookie: good }, P2, viaCookie)).toBe('ok');
    expect(await attribution((await idOf(viaCookie))!)).toMatchObject({ source: 'cookie', status: 'pending', code: good });
    // FR-GROWTH-007: без кода — «без кода», не seed-группа.
    const plain = email();
    expect(await register({ explicit: null, cookie: null }, P2, plain)).toBe('ok');
    expect((await pool.query('SELECT partner_code_id FROM account WHERE email = $1', [plain])).rows[0].partner_code_id).toBeNull();
  });

  it('AC-3: сила источника invite > code > cookie — все 9 пар; converted не перезаписывается', async () => {
    const order: AttributionSource[] = ['cookie', 'code', 'invite'];
    for (const first of order) for (const second of order) {
      const acc = await account();
      const a = await code(await account()), b = await code(await account());
      expect(await apply(acc, a, first)).toBe('applied');
      const out = await apply(acc, b, second);
      const stronger = order.indexOf(second) > order.indexOf(first);
      expect(out, `${first}→${second}`).toBe(stronger ? 'applied' : 'kept');
      expect((await attribution(acc))!.code, `${first}→${second}`).toBe(stronger ? b : a);
    }
    const acc = await account();
    const a = await code(await account());
    await apply(acc, a, 'cookie');
    await pool.query(`UPDATE attribution SET status = 'converted' WHERE account_id = $1`, [acc]);
    expect(await apply(acc, await code(await account()), 'invite')).toBe('kept');
    expect((await attribution(acc))!.code).toBe(a);
  });

  it('AC-4: self-referral — свой код и владелец с того же префикса за 24 ч → rejected(self_referral), use не растёт', async () => {
    const owner = await account();
    const own = await code(owner);
    expect(await apply(owner, own, 'code')).toBe('rejected_self');
    const prefixOwner = email();
    expect(await register({ explicit: null, cookie: null }, P3, prefixOwner)).toBe('ok');
    const theirs = await code((await idOf(prefixOwner))!);
    const second = email();
    expect(await register({ explicit: theirs, cookie: null }, P3, second)).toBe('ok');
    expect(await attribution((await idOf(second))!)).toMatchObject({ status: 'rejected', reject_reason: 'self_referral' });
    expect((await pool.query(`SELECT count(*)::int AS n FROM partner_code_use pu JOIN partner_code pc ON pc.id = pu.partner_code_id WHERE pc.code = $1`, [theirs])).rows[0].n).toBe(0);
    // Другой префикс — не self-referral.
    const third = email();
    await register({ explicit: theirs, cookie: null }, P2, third);
    expect(await attribution((await idOf(third))!)).toMatchObject({ status: 'pending', source: 'code' });
  });

  it('AC-5 конкурентно: 30 регистраций по коду с одного префикса → ровно 20 засчитаны, код заморожен ОДИН раз, строка аудита одна', async () => {
    const value = await code(await account());
    const results = await Promise.all(Array.from({ length: 30 }, () => register({ explicit: value, cookie: null }, '100.64.7.0/24')));
    // 20 засчитаны; 21-е само заморозило код и прошло БЕЗ атрибуции (заморозка коммитится); остальные — ошибка поля.
    expect(results.filter((r) => r === 'ok')).toHaveLength(21);
    expect(results.filter((r) => r === 'invalid_code')).toHaveLength(9);
    const uses = (await pool.query(`SELECT count(*)::int AS n FROM partner_code_use pu JOIN partner_code pc ON pc.id = pu.partner_code_id WHERE pc.code = $1`, [value])).rows[0].n;
    expect(uses).toBe(20);
    const row = (await pool.query('SELECT frozen, frozen_reason FROM partner_code WHERE code = $1', [value])).rows[0];
    expect(row).toEqual({ frozen: true, frozen_reason: 'antifraud_ip_burst' });
    expect((await pool.query(`SELECT count(*)::int AS n FROM partner_audit pa JOIN partner_code pc ON pc.id = pa.partner_code_id WHERE pc.code = $1 AND pa.kind = 'frozen_antifraud'`, [value])).rows[0].n).toBe(1);
    // Разморозка оператором — с журналом; засчитанные не трогаются.
    expect(await unfreezePartnerCode(pool, { code: value, by: 'оператор', reason: 'проверено вручную' })).toEqual({ kind: 'unfrozen' });
    expect(await unfreezePartnerCode(pool, { code: value, by: 'оператор', reason: 'повтор' })).toEqual({ kind: 'not_frozen' });
  });

  it('добросовестный NAT (shared-resource-verification п.4): 20 применений старше 10 минут + 20 новых с того же префикса — код не заморожен', async () => {
    const value = await code(await account(), 'seed-studio-kolos');
    for (let i = 0; i < 20; i++) await register({ explicit: value, cookie: null }, '100.64.9.0/24');
    await pool.query(`UPDATE partner_code_use SET created_at = now() - interval '11 minutes' WHERE partner_code_id = (SELECT id FROM partner_code WHERE code = $1)`, [value]);
    const later = await Promise.all(Array.from({ length: 20 }, () => register({ explicit: value, cookie: null }, '100.64.9.0/24')));
    expect(later.every((r) => r === 'ok')).toBe(true);
    expect((await pool.query('SELECT frozen FROM partner_code WHERE code = $1', [value])).rows[0].frozen).toBe(false);
  });

  async function studioWithBot(contact: string | null = '+7 900 000-00-00') {
    const studio = await account('studio');
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact) VALUES ($1, 'active', $2, 'Пекарня', $3) RETURNING id`,
      [studio, randomBytes(16).toString('base64url'), contact])).rows[0]!.id;
    return { studio, bot };
  }

  it('AC-6 / AC-8 / SC-US-012-1/2: приглашение — только studio и свой бот; приём → клиент владелец, студия «только чтение», атрибуция invite; 409 / 410', async () => {
    const { studio, bot } = await studioWithBot();
    const freeOwner = await account();
    expect((await createStudioInvite(pool, { studioAccountId: freeOwner, botId: bot, email: 'c@example.ru' })).kind).toBe('not_found');
    const noContact = await studioWithBot(null);
    expect((await createStudioInvite(pool, { studioAccountId: noContact.studio, botId: noContact.bot, email: 'c@example.ru' })).kind).toBe('contact_required');
    const invite = await createStudioInvite(pool, { studioAccountId: studio, botId: bot, email: 'c@example.ru' });
    expect(invite.kind).toBe('created');
    if (invite.kind !== 'created') return;
    expect(Math.abs(new Date(invite.expiresAt).getTime() - Date.now() - 7 * DAY)).toBeLessThan(60_000);
    expect(await acceptStudioInvite(pool, { token: invite.token, clientAccountId: studio, ipPrefix: P2 })).toEqual({ kind: 'own_invite' });
    const client = await account();
    const accepted = await acceptStudioInvite(pool, { token: invite.token, clientAccountId: client, ipPrefix: P2 });
    expect(accepted).toMatchObject({ kind: 'accepted', botId: bot, attribution: 'applied' });
    expect((await pool.query('SELECT account_id, studio_account_id FROM bot WHERE id = $1', [bot])).rows[0]).toEqual({ account_id: client, studio_account_id: studio });
    expect(await attribution(client)).toMatchObject({ source: 'invite', status: 'pending' });
    expect(await acceptStudioInvite(pool, { token: invite.token, clientAccountId: await account(), ipPrefix: P2 })).toEqual({ kind: 'used' });
    // Студия больше не может передать или править: бот не её.
    expect((await createStudioInvite(pool, { studioAccountId: studio, botId: bot, email: 'x@example.ru' })).kind).toBe('not_found');
    const cabinet = await readStudioCabinet(pool, studio);
    expect(cabinet!.bots.find((b) => b.bot_id === bot)).toMatchObject({ transferred: true });
    expect(JSON.stringify(cabinet)).not.toMatch(/c@example\.ru/);
    // Истёкшее — 410.
    const other = await studioWithBot();
    const late = await createStudioInvite(pool, { studioAccountId: other.studio, botId: other.bot, email: 'd@example.ru' });
    if (late.kind !== 'created') throw new Error('ожидалось приглашение');
    await pool.query(`UPDATE studio_invite SET expires_at = now() - interval '1 minute' WHERE bot_id = $1`, [other.bot]);
    expect(await acceptStudioInvite(pool, { token: late.token, clientAccountId: await account(), ipPrefix: P2 })).toEqual({ kind: 'expired' });
  });

  it('AC-6 конкурентно: 10 аккаунтов принимают одно приглашение одновременно → владелец один, остальные used', async () => {
    const { studio, bot } = await studioWithBot();
    const invite = await createStudioInvite(pool, { studioAccountId: studio, botId: bot, email: 'c@example.ru' });
    if (invite.kind !== 'created') throw new Error('ожидалось приглашение');
    const clients = await Promise.all(Array.from({ length: 10 }, () => account()));
    const results = await Promise.all(clients.map((c) => acceptStudioInvite(pool, { token: invite.token, clientAccountId: c, ipPrefix: P2 })));
    expect(results.filter((r) => r.kind === 'accepted')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'used')).toHaveLength(9);
  });

  it('AC-7 carry_over A-N6-033 (6): предел ботов КЛИЕНТА под той же блокировкой — free с ботом отказ; одновременные «создать» и «принять» не превышают 1', async () => {
    const full = await account();
    await createBot(pool, { accountId: full, companyName: 'Свой', contact: null, greeting: '', publicKey: randomBytes(16).toString('base64url') });
    const { studio, bot } = await studioWithBot();
    const invite = await createStudioInvite(pool, { studioAccountId: studio, botId: bot, email: 'c@example.ru' });
    if (invite.kind !== 'created') throw new Error('ожидалось приглашение');
    expect(await acceptStudioInvite(pool, { token: invite.token, clientAccountId: full, ipPrefix: P2 })).toEqual({ kind: 'plan_limit', plan: 'free', limit: 1 });
    expect((await pool.query('SELECT account_id FROM bot WHERE id = $1', [bot])).rows[0].account_id).toBe(studio);
    for (let round = 0; round < 5; round++) {
      const s = await studioWithBot();
      const inv = await createStudioInvite(pool, { studioAccountId: s.studio, botId: s.bot, email: 'c@example.ru' });
      if (inv.kind !== 'created') throw new Error('ожидалось приглашение');
      const client = await account();
      await Promise.all([
        createBot(pool, { accountId: client, companyName: 'Гонка', contact: null, greeting: '', publicKey: randomBytes(16).toString('base64url') }),
        acceptStudioInvite(pool, { token: inv.token, clientAccountId: client, ipPrefix: P2 }),
      ]);
      const n = (await pool.query(`SELECT count(*)::int AS n FROM bot WHERE account_id = $1 AND status <> 'deleted'`, [client])).rows[0].n;
      expect(n, `раунд ${round}`).toBe(1);
    }
  });

  async function attributed() {
    const partner = await account();
    const value = await code(partner);
    const client = await account();
    expect(await apply(client, value, 'code')).toBe('applied');
    return { partner, client, value };
  }

  it('AC-9: оплата → ровно одно начисление floor((сумма − удержание) × 20 %) со зрелостью +30 дней; повтор и 20 одновременных доставок — одно', async () => {
    const { partner, client } = await attributed();
    const paidAt = new Date(Date.now() - DAY).toISOString();
    const first = await pay(client, { amount: 99_000, fee: 3_465, paidAt });
    expect(first.result).toMatchObject({ applied: true });
    const list = await entries(partner);
    expect(list.map((e) => [e.kind, e.amount])).toEqual([['accrual', Math.floor((99_000 - 3_465) * 2000 / 10_000)]]);
    expect(list[0]!.availableAt.getTime() - new Date(paidAt).getTime()).toBe(30 * DAY);
    expect((await attribution(client))!.status).toBe('converted');
    // Повтор того же события — ключ повторности фичи 14, начисление не дублируется.
    await applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${first.pid}`, payloadSha256: '0'.repeat(64), payment: first.payment });
    expect(await entries(partner)).toHaveLength(1);
    // 20 одновременных доставок одной новой оплаты — одно начисление.
    const intent = await createPaymentIntent(pool, { accountId: client, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
    if (intent.kind === 'conflict') throw new Error('намерение');
    const pid = randomUUID();
    const payment = { id: pid, orderId: intent.intent.id, amountMinor: 99_000, feeMinor: 0, paidAt: new Date().toISOString() };
    await Promise.all(Array.from({ length: 20 }, () => applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`, payloadSha256: '0'.repeat(64), payment })));
    expect((await entries(partner)).filter((e) => e.kind === 'accrual')).toHaveLength(2);
  });

  it('AC-10: начисления нет — без атрибуции, rejected, seed-код без владельца, несовпадение суммы, неизвестное удержание (аудит), окно 12 месяцев', async () => {
    const lonely = await account();
    await pay(lonely);
    const ownerOf = await account();
    const own = await code(ownerOf);
    expect(await apply(ownerOf, own, 'code')).toBe('rejected_self');
    await pay(ownerOf);
    expect(await entries(ownerOf)).toEqual([]);
    const seedClient = await account();
    await apply(seedClient, await code(null, 'seed-net'), 'code');
    await pay(seedClient);
    expect((await pool.query(`SELECT count(*)::int AS n FROM commission_entry ce JOIN attribution a ON a.partner_code_id = ce.partner_code_id WHERE a.account_id = $1`, [seedClient])).rows[0].n).toBe(0);
    const m2 = await attributed();
    const intent = await createPaymentIntent(pool, { accountId: m2.client, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
    if (intent.kind === 'conflict') throw new Error('намерение');
    const pid = randomUUID();
    expect(await applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`, payloadSha256: '0'.repeat(64),
      payment: { id: pid, orderId: intent.intent.id, amountMinor: 10_000, feeMinor: 0, paidAt: new Date().toISOString() } })).toMatchObject({ applied: false, reason: 'amount_mismatch' });
    expect(await entries(m2.partner)).toEqual([]);
    const unknownFee = await attributed();
    await pay(unknownFee.client, { fee: null });
    expect(await entries(unknownFee.partner)).toEqual([]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM partner_audit WHERE account_id = $1 AND kind = 'accrual_skipped_fee_unknown'`, [unknownFee.partner])).rows[0].n).toBe(1);
    const old = await attributed();
    await pay(old.client, { paidAt: new Date(Date.now() - 400 * DAY).toISOString() });
    await pay(old.client);
    expect((await entries(old.partner)).map((e) => e.kind)).toEqual(['accrual']);   // первая оплата — в окне, вторая через 13 месяцев — нет
  });

  it('AC-11: возврат → сторно −начисление в ЛЮБОМ порядке; оплата и возврат одновременно → баланс 0; сторно доступно сразу', async () => {
    const a = await attributed();
    const paid = await pay(a.client);
    await refund(paid.payment);
    expect((await entries(a.partner)).map((e) => [e.kind, e.amount])).toEqual([['accrual', 19_107], ['clawback', -19_107]]);
    const b = await attributed();
    const intent = await createPaymentIntent(pool, { accountId: b.client, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
    if (intent.kind === 'conflict') throw new Error('намерение');
    const payment = { id: randomUUID(), orderId: intent.intent.id, amountMinor: 99_000, feeMinor: 3_465, paidAt: new Date().toISOString() };
    await refund(payment);                                               // возврат раньше оплаты
    await applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${payment.id}`, payloadSha256: '0'.repeat(64), payment });
    expect(await entries(b.partner)).toEqual([]);
    const c = await attributed();
    const i2 = await createPaymentIntent(pool, { accountId: c.client, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
    if (i2.kind === 'conflict') throw new Error('намерение');
    const p2 = { id: randomUUID(), orderId: i2.intent.id, amountMinor: 99_000, feeMinor: 3_465, paidAt: new Date().toISOString() };
    await Promise.all([applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${p2.id}`, payloadSha256: '0'.repeat(64), payment: p2 }), refund(p2)]);
    expect((await entries(c.partner)).reduce((s, e) => s + e.amount, 0)).toBe(0);
  });

  it('AC-12 / AC-13: выплата — реквизиты, минимум, не больше доступного, ключ идемпотентен; после выплаты возврат уводит баланс в минус; кабинет без плательщиков', async () => {
    const a = await attributed();
    const payments = [];
    for (let i = 0; i < 6; i++) payments.push(await pay(a.client, { paidAt: new Date(Date.now() - 40 * DAY).toISOString() }));
    const accrued = 6 * 19_107;
    const mail = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [a.partner])).rows[0]!.email;
    const payout = (amountMinor: number, key: string) => recordPartnerPayout(pool, { email: mail, amountMinor, key, operator: 'оператор', reason: 'выплата 5-го' });
    expect((await payout(100_000, 'k1')).kind).toBe('no_details');
    expect(await savePayoutDetails(pool, a.partner, { method: 'sbp', phone: '+79000000000', bank: 'Банк' })).toBe(true);
    expect(await payout(99_999, 'k1')).toEqual({ kind: 'below_minimum', minimumMinor: 100_000 });
    expect(await payout(accrued + 1, 'k1')).toEqual({ kind: 'exceeds_available', availableMinor: accrued });
    expect(await payout(accrued, 'k1')).toMatchObject({ kind: 'recorded', balanceAfterMinor: 0 });
    expect(await payout(accrued, 'k1')).toMatchObject({ kind: 'duplicate' });
    expect(await payout(100_000, 'k1')).toEqual({ kind: 'key_conflict' });
    await refund(payments[0]!.payment);
    const cabinet = (await readPartnerCabinet(pool, a.partner))!;
    expect(cabinet.money).toMatchObject({ total_minor: -19_107, due_minor: 0, debt_minor: 19_107 });
    const clientMail = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [a.client])).rows[0]!.email;
    expect(JSON.stringify(cabinet)).not.toContain(clientMail);
    expect(JSON.stringify(cabinet)).not.toContain(a.client);
    expect(cabinet.payout_details).toEqual({ phone_masked: '+7 *** ***-00-00', bank: 'Банк' });
    expect(cabinet.cohort).toMatchObject({ registrations: 1, conversions: 1 });
  });

  it('AC-12 конкурентно: две одновременные выплаты с разными ключами не превышают доступное', async () => {
    const a = await attributed();
    for (let i = 0; i < 6; i++) await pay(a.client, { paidAt: new Date(Date.now() - 40 * DAY).toISOString() });
    await savePayoutDetails(pool, a.partner, { method: 'sbp', phone: '+79000000001', bank: null });
    const mail = (await pool.query<{ email: string }>('SELECT email FROM account WHERE id = $1', [a.partner])).rows[0]!.email;
    const results = await Promise.all(['x', 'y'].map((key) => recordPartnerPayout(pool, { email: mail, amountMinor: 100_000, key, operator: 'о', reason: 'гонка выплат' })));
    expect(results.filter((r) => r.kind === 'recorded')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'exceeds_available')).toHaveLength(1);
  });

  it('AC-14 / AC-15: кабинет студии — «данных ещё нет» до передач; seed-коды выдаются командой, повтор — exists, неверная группа — отказ', async () => {
    const { studio } = await studioWithBot();
    const cabinet = (await readStudioCabinet(pool, studio))!;
    expect(cabinet.cohort).toBeNull();
    const suffix = randomBytes(3).toString('hex');
    expect(await issuePartnerCode(pool, { code: `seed-net-${suffix}`, group: 'seed-net', by: 'оператор', reason: 'сеть владельца' })).toEqual({ kind: 'issued' });
    expect(await issuePartnerCode(pool, { code: `seed-net-${suffix}`, group: 'seed-net', by: 'оператор', reason: 'повтор' })).toEqual({ kind: 'exists' });
    expect(await issuePartnerCode(pool, { code: `x-${suffix}`, group: 'SEED', by: 'оператор', reason: 'неверно' })).toEqual({ kind: 'invalid', field: 'group' });
    expect(await issuePartnerCode(pool, { code: `y-${suffix}`, group: 'partner', owner: 'nobody@example.ru', by: 'о', reason: 'нет владельца' })).toEqual({ kind: 'owner_not_found' });
    expect((await readPartnerCabinet(pool, await account()))).toBeNull();
  });

  it('ревью фичи 15 (находка 1): возврат ПЕРВОЙ оплаты не сдвигает начало окна 12 месяцев', async () => {
    const a = await attributed();
    const first = await pay(a.client, { paidAt: new Date(Date.now() - 400 * DAY).toISOString() });
    await refund(first.payment);
    await pay(a.client);
    expect((await entries(a.partner)).map((e) => e.kind)).toEqual(['accrual', 'clawback']);   // вторая оплата — через 13 месяцев после первой
  });

  it('ревью фичи 15 (находка 2) конкурентно: взаимные партнёры платят одновременно; приём приглашения одновременно с оплатой клиента — без deadlock', async () => {
    for (let round = 0; round < 8; round++) {
      const a = await account(), b = await account();
      const codeA = await code(a), codeB = await code(b);
      expect(await apply(a, codeB, 'code', `10.${round}.1.0/24`)).toBe('applied');
      expect(await apply(b, codeA, 'code', `10.${round}.2.0/24`)).toBe('applied');
      const results = await Promise.allSettled([pay(a), pay(b)]);
      expect(results.map((r) => r.status), `раунд ${round}`).toEqual(['fulfilled', 'fulfilled']);
      expect((await entries(a)).length + (await entries(b)).length, `раунд ${round}`).toBe(2);
    }
    for (let round = 0; round < 5; round++) {
      const { studio, bot } = await studioWithBot();
      const invite = await createStudioInvite(pool, { studioAccountId: studio, botId: bot, email: 'c@example.ru' });
      if (invite.kind !== 'created') throw new Error('ожидалось приглашение');
      const client = await account('studio');                                   // предел 10 — приём не упирается в план
      const studioCode = (await pool.query<{ code: string }>('SELECT code FROM partner_code WHERE owner_account_id = $1', [studio])).rows[0]!.code;
      expect(await apply(client, studioCode, 'cookie', `10.9.${round}.0/24`)).toBe('applied');
      const results = await Promise.allSettled([acceptStudioInvite(pool, { token: invite.token, clientAccountId: client, ipPrefix: P2 }), pay(client)]);
      expect(results.map((r) => r.status), `раунд ${round}`).toEqual(['fulfilled', 'fulfilled']);
    }
  });

  it('маршруты по боевой связке createPartnerDependencies: «Передать клиенту» → приём → 409; сводки студии и партнёра; реквизиты', async () => {
    const sessions = new Map<string, string>();
    const session = (id: string) => { const t = randomBytes(32).toString('base64url'); sessions.set(t, id); return t; };
    const deps = createPartnerDependencies({ pool, publicOrigin: PUBLIC, allowMutation: async () => true, log: () => {},
      authenticate: async (token) => (sessions.has(token) ? { account_id: sessions.get(token)! } : null) });
    const post = (token: string, body: unknown) => new Request(`${PUBLIC}/api/x`, { method: 'POST', body: JSON.stringify(body),
      headers: { origin: PUBLIC, cookie: `__Host-n6_session=${token}`, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' } });
    const get = (token: string) => new Request(`${PUBLIC}/api/x`, { headers: { cookie: `__Host-n6_session=${token}` } });
    const { studio, bot } = await studioWithBot();
    const studioToken = session(studio);
    const created = await createInviteHandler(deps)(post(studioToken, { email: 'Client@Example.ru' }), bot);
    expect(created.status).toBe(201);
    const url = ((await created.json()) as { data: { url: string } }).data.url;
    expect(url).toMatch(new RegExp(`^${PUBLIC}/invite/[A-Za-z0-9_-]{43}$`));
    const token = url.slice(url.lastIndexOf('/') + 1);
    const clientToken = session(await account());
    expect((await createAcceptInviteHandler(deps)(post(clientToken, {}), token)).status).toBe(200);
    expect((await createAcceptInviteHandler(deps)(post(session(await account()), {}), token)).status).toBe(409);
    const studioSummary = (await (await createStudioSummaryHandler(deps)(get(studioToken))).json()) as { data: StudioCabinet };
    expect(studioSummary.data.bots.find((b) => b.bot_id === bot)).toMatchObject({ transferred: true });
    const partner = await createPartnerSummaryHandler(deps)(get(studioToken));
    expect(partner.status).toBe(200);
    expect(((await partner.json()) as { data: PartnerCabinet }).data.codes[0]!.code).toMatch(/^studio-[a-z0-9]{6}$/);
    expect((await createPayoutDetailsHandler(deps)(post(studioToken, { method: 'sbp', phone: '4111 1111 1111 1111' }))).status).toBe(422);
    expect((await createPayoutDetailsHandler(deps)(post(studioToken, { method: 'sbp', phone: '8 900 000-00-00' }))).status).toBe(200);
    expect((await createPartnerSummaryHandler(deps)(get(session(await account())))).status).toBe(404);
  });
});
