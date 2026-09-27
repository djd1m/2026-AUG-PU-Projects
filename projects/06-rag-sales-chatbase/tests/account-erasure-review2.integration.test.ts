// account-erasure: находки ПОВТОРНОГО ревью Codex (27.09, оценка D) на НАСТОЯЩЕМ Postgres 16 + pgvector — отдельный файл
// (основной набор у предела 500 строк). 1: сторно сгоревшего начисления не вычитает второй раз и не трогает долг
// payout_owed; сторно ждёт замок партнёра. 2: почта стираемого исчезает и из приглашения, принятого другим аккаунтом.
// 3: приглашение, записанное между транзакцией строк и надгробием, очищается завершением; создание приглашения ждёт
// строку адресата. 4: сбой уборки тома не останавливает стирание в том же проходе сторожа.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { acceptStudioInvite, createPool, createStudioInvite, eraseAccount, listOwedPayouts, recordPartnerPayout, recordVerifiedRefund, requestErasure,
  savePayoutDetails, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { erasureTick } from '../apps/worker/src/erase-accounts';
import { runIsolatedSteps } from '../apps/worker/src/watchdog-steps';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

const databaseUrl = process.env.DATABASE_URL;
const HOUR = 3_600_000;

describe.skipIf(!databaseUrl)('удаление аккаунта: повторное ревью на настоящем Postgres', () => {
  let pool: Pool;
  let hash = '';
  const schema = `erasure_r2_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    hash = await bcrypt.hash('correct-horse-9', 4);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
  const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await q(sql, params))[0] ?? { n: 0 })[0]);
  async function account(plan = 'free') {
    const mail = `r${randomBytes(6).toString('hex')}@example.ru`;
    const id = (await q<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, $2, $3) RETURNING id`, [mail, hash, plan]))[0]!.id;
    return { id, mail };
  }
  async function bot(owner: string) {
    return { id: (await q<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact) VALUES ($1, 'active', $2, 'Пекарня', '+7 900 000-00-00')
      RETURNING id`, [owner, randomBytes(16).toString('base64url')]))[0]!.id };
  }
  // Начисление партнёру по отдельному платежу; доступно через `days` дней (отрицательное — уже зрелое).
  async function accrual(partnerId: string, minor: number, days: number): Promise<string> {
    const providerId = randomUUID();
    await pool.query(`WITH p AS (INSERT INTO payment (provider, provider_payment_id, amount_minor, paid_at, account_id)
        VALUES ('fake', $2, 99000, now(), $1) RETURNING id)
      INSERT INTO commission_entry (partner_account_id, kind, amount_minor, available_at, payment_id)
      SELECT $1, 'accrual', $3, now() + make_interval(days => $4), p.id FROM p`, [partnerId, providerId, minor, days]);
    return providerId;
  }
  async function partnerWith(minor: number) {
    const partner = await account();
    const payment = await accrual(partner.id, minor, -40);
    await savePayoutDetails(pool, partner.id, { method: 'sbp', phone: '+79000000001', bank: null });
    return { ...partner, payment };
  }
  const refund = (providerId: string) => recordVerifiedRefund(pool, { provider: 'fake', eventKey: `refund.succeeded:${randomUUID()}`, payloadSha256: '0'.repeat(64),
    payment: { id: providerId, orderId: null, amountMinor: 99000, feeMinor: 3_465, paidAt: new Date().toISOString() } });
  const balance = (id: string) => one('SELECT COALESCE(sum(amount_minor), 0) FROM commission_entry WHERE partner_account_id = $1', [id]);
  const clawbacks = (id: string) => one(`SELECT count(*) FROM commission_entry WHERE partner_account_id = $1 AND kind = 'clawback'`, [id]);
  const status = async (id: string) => (await q<{ status: string }>('SELECT status FROM account WHERE id = $1', [id]))[0]!.status;
  const age = (id: string) => pool.query(`UPDATE account SET erase_requested_at = erase_requested_at - interval '2 hours' WHERE id = $1`, [id]);
  const invitesTo = (mail: string) => one('SELECT count(*) FROM studio_invite WHERE lower(email) = lower($1)', [mail]);

  it('находка 1: сторно СГОРЕВШЕГО начисления не уменьшает баланс и долг payout_owed; сторно доступного — уменьшает', async () => {
    const partner = await partnerWith(200_000);
    const burnt = await accrual(partner.id, 50_000, 30);             // холд — сгорит при завершении
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id, new Date(Date.now() + 67 * HOUR))).toEqual({ kind: 'erased' });
    expect(await one(`SELECT amount_minor FROM commission_entry WHERE partner_account_id = $1 AND kind = 'forfeit'`, [partner.id])).toBe(-50_000);
    expect(await balance(partner.id)).toBe(200_000);
    await refund(burnt);                                            // сценарий ревьюера: возврат платежа сгоревшего начисления
    expect([await clawbacks(partner.id), await balance(partner.id)]).toEqual([0, 200_000]);
    expect((await listOwedPayouts(pool)).find((r) => r.account_id === partner.id)).toMatchObject({ owed_minor: 200_000, balance_minor: 200_000 });
    await refund(partner.payment);                                  // возврат платежа, из которого долг, — законно уменьшает
    expect([await clawbacks(partner.id), await balance(partner.id)]).toEqual([1, 0]);
  });

  it('находка 1: сгорел весь остаток (реквизитов нет) — сторно после надгробия баланс в минус не уводит', async () => {
    const partner = await account();
    const mature = await accrual(partner.id, 30_000, -40);
    await accrual(partner.id, 20_000, 30);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    expect(await balance(partner.id)).toBe(0);
    await refund(mature);
    expect([await clawbacks(partner.id), await balance(partner.id)]).toEqual([0, 0]);
  });

  it('находка 1: сторно ждёт замок партнёра — тот же, что у завершения стирания и выплаты', async () => {
    const partner = await partnerWith(200_000);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_payout:${partner.id}`]);
      let done = false;
      const pending = refund(partner.payment).then((r) => { done = true; return r; });
      await new Promise((r) => setTimeout(r, 1_000));
      expect(done, 'сторно не дождалось замка партнёра').toBe(false);
      await holder.query('COMMIT');
      await pending;
    } finally { holder.release(); }
    expect(await balance(partner.id)).toBe(0);
  });

  it('третье ревью, находка 1: итог не зависит от порядка «возврат холда ↔ стирание» — долг и баланс одинаковы', async () => {
    const outcome = async (refundFirst: boolean) => {
      const partner = await partnerWith(250_000);
      const hold = await accrual(partner.id, 50_000, 30);
      if (refundFirst) await refund(hold);
      await requestErasure(pool, partner.id);
      await age(partner.id);
      expect(await eraseAccount(pool, partner.id, new Date(Date.now() + 67 * HOUR))).toEqual({ kind: 'erased' });
      if (!refundFirst) await refund(hold);
      const owed = (await listOwedPayouts(pool)).find((r) => r.account_id === partner.id);
      return { owed: owed?.owed_minor ?? null, balance: await balance(partner.id) };
    };
    const before = await outcome(true), after = await outcome(false);
    expect(before).toEqual({ owed: 250_000, balance: 250_000 });
    expect(after).toEqual(before);
  });

  it('третье ревью, находка 2: сгорел только холд — сторно УЖЕ ВЫПЛАЧЕННОГО начисления после надгробия записывается', async () => {
    const partner = await partnerWith(200_000);
    expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `paid-${partner.id}`, operator: 'op', reason: 'выплата' }))
      .toMatchObject({ kind: 'recorded' });
    await accrual(partner.id, 50_000, 30);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    expect(await one(`SELECT amount_minor FROM commission_entry WHERE partner_account_id = $1 AND kind = 'forfeit'`, [partner.id])).toBe(-50_000);
    await refund(partner.payment);
    expect(await one(`SELECT amount_minor FROM commission_entry WHERE partner_account_id = $1 AND kind = 'clawback'`, [partner.id])).toBe(-200_000);
    expect(await balance(partner.id)).toBe(-200_000);
  });

  it('четвёртое ревью, находка 1: выплата, холд и возврат выплаченного — итог не зависит от порядка «возврат ↔ стирание»', async () => {
    const outcome = async (refundFirst: boolean) => {
      const partner = await partnerWith(200_000);
      expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `p4-${partner.id}`, operator: 'op', reason: 'выплата' }))
        .toMatchObject({ kind: 'recorded' });
      await accrual(partner.id, 300_000, 30);                       // холд
      if (refundFirst) await refund(partner.payment);
      await requestErasure(pool, partner.id);
      await age(partner.id);
      expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
      if (!refundFirst) await refund(partner.payment);
      return { balance: await balance(partner.id), clawbacks: await clawbacks(partner.id) };
    };
    const before = await outcome(true), after = await outcome(false);
    expect(before).toEqual({ balance: -200_000, clawbacks: 1 });
    expect(after).toEqual(before);
  });

  it('четвёртое ревью, находка 2: сгорает начисление, созревшее ПОСЛЕДНИМ, а не записанное последним; сторно выплаченного записывается', async () => {
    const partner = await account();
    await savePayoutDetails(pool, partner.id, { method: 'sbp', phone: '+79000000001', bank: null });
    const lateMature = await accrual(partner.id, 200_000, -1);      // записано первым, созрело вчера
    const earlyMature = await accrual(partner.id, 200_000, -40);    // задержанный вебхук: записано позже, созрело давно
    expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `p5-${partner.id}`, operator: 'op', reason: 'выплата' }))
      .toMatchObject({ kind: 'recorded' });
    await pool.query('DELETE FROM partner_payout_details WHERE account_id = $1', [partner.id]);   // реквизитов нет — остаток сгорает
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    const forfeited = async (providerId: string) => one(`SELECT c.forfeited_minor FROM commission_entry c JOIN payment p ON p.id = c.payment_id
      WHERE p.provider_payment_id = $1 AND c.kind = 'accrual'`, [providerId]);
    expect([await forfeited(lateMature), await forfeited(earlyMature)]).toEqual([200_000, 0]);
    await refund(earlyMature);                                      // возврат выплаченного — сторно на всю сумму
    expect(await clawbacks(partner.id)).toBe(1);
    expect(await balance(partner.id)).toBe(-200_000);
  });

  it('третье ревью, находка 3: две студии одновременно приглашают друг друга — без взаимной блокировки', async () => {
    for (let round = 0; round < 8; round++) {
      const a = await account('studio'), b = await account('studio');
      const botA = await bot(a.id), botB = await bot(b.id);
      const results = await Promise.all([
        createStudioInvite(pool, { studioAccountId: a.id, botId: botA.id, email: b.mail }),
        createStudioInvite(pool, { studioAccountId: b.id, botId: botB.id, email: a.mail })]);
      expect(results.map((r) => r.kind), `раунд ${round}`).toEqual(['created', 'created']);
    }
  }, 60_000);

  it('находка 2: почта стираемого исчезает и из приглашения, принятого ДРУГИМ аккаунтом; бот у принявшего цел', async () => {
    const studio = await account('studio'), addressee = await account(), taker = await account();
    const own = await bot(studio.id);
    const invite = await createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: addressee.mail });
    if (invite.kind !== 'created') throw new Error(`приглашение: ${invite.kind}`);
    expect(await acceptStudioInvite(pool, { token: invite.token, clientAccountId: taker.id, ipPrefix: '198.51.100.0/24' })).toMatchObject({ kind: 'accepted' });
    await requestErasure(pool, addressee.id);
    await age(addressee.id);
    expect(await eraseAccount(pool, addressee.id)).toEqual({ kind: 'erased' });
    expect(await invitesTo(addressee.mail)).toBe(0);
    expect(await q('SELECT accepted_by FROM studio_invite WHERE studio_account_id = $1', [studio.id])).toEqual([{ accepted_by: taker.id }]);
    expect(await one('SELECT count(*) FROM bot WHERE id = $1 AND account_id = $2', [own.id, taker.id])).toBe(1);
  });

  it('находка 3: приглашение, записанное МЕЖДУ транзакцией строк и надгробием, очищается завершением', async () => {
    const addressee = await account(), studio = await account('studio');
    const own = await bot(studio.id);
    await requestErasure(pool, addressee.id);
    await age(addressee.id);
    const erased = await eraseAccount(pool, addressee.id, new Date(), {
      afterRowsErased: async () => {
        expect((await createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: addressee.mail.toUpperCase() })).kind).toBe('created');
      },
    });
    expect(erased).toEqual({ kind: 'erased' });
    expect(await invitesTo(addressee.mail)).toBe(0);
  });

  it('находка 3: создание приглашения ждёт строку адресата, пока её держит завершение стирания', async () => {
    const addressee = await account(), studio = await account('studio');
    const own = await bot(studio.id);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM account WHERE id = $1 FOR NO KEY UPDATE', [addressee.id]);   // как finalizeErasureTx
      let done = false;
      const pending = createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: addressee.mail }).then((r) => { done = true; return r; });
      await new Promise((r) => setTimeout(r, 1_000));
      expect(done, 'создание приглашения не синхронизировано со стиранием адресата').toBe(false);
      await holder.query('COMMIT');
      expect((await pending).kind).toBe('created');
    } finally { holder.release(); }
  });

  it('находка 4: сбой уборки тома не останавливает стирание в том же проходе сторожа', async () => {
    const a = await account();
    await requestErasure(pool, a.id);
    await age(a.id);
    const result = await runIsolatedSteps([
      { name: 'уборка тома uploads', run: async () => { throw Object.assign(new Error('EACCES: permission denied, unlink'), { code: 'EACCES' }); } },
      { name: 'стирание аккаунтов', run: () => erasureTick(pool, '/tmp/n6-erasure-no-uploads', new Date(), 500, { removeUpload: async () => false, log: () => {} }) },
    ], () => {});
    expect(result.failed).toEqual(['уборка тома uploads']);
    expect(await status(a.id)).toBe('deleted');
  });

  it('проверка фикстуры: приглашение без стирания остаётся (иначе тесты находок 2–3 зеленели бы на пустоте)', async () => {
    const addressee = await account(), studio = await account('studio');
    const own = await bot(studio.id);
    expect((await createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: addressee.mail })).kind).toBe('created');
    expect(await invitesTo(addressee.mail)).toBe(1);
  });
});
