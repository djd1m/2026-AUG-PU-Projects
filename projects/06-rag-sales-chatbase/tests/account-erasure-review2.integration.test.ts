// account-erasure: находки ПОВТОРНОГО ревью Codex (27.09, оценка D) на НАСТОЯЩЕМ Postgres 16 + pgvector — отдельный файл
// (основной набор у предела 500 строк). 1: деньги удалённого партнёра НЕ сгорают (A-N6-061, заменило сгорание после
// пятого ревью) — итог не зависит от порядка событий, долг выплачивается или списывается только оператором; сторно ждёт
// замок партнёра. 2: почта стираемого исчезает и из приглашения, принятого другим аккаунтом.
// 3: приглашение, записанное между транзакцией строк и надгробием, очищается завершением; создание приглашения ждёт
// строку адресата. 4: сбой уборки тома не останавливает стирание в том же проходе сторожа.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptStudioInvite, applyVerifiedPayment, createPaymentIntent, createPool, createStudioInvite, deleteSource, eraseAccount, listOwedPayouts,
  recordPartnerPayout, recordVerifiedRefund, requestErasure, savePayoutDetails, writeOffErasedPartnerDebt, type Pool } from '../packages/db/src/index';
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

  // Решение владельца 27.09 «Ничего не сжигать, всё — долг» (A-N6-061) заменило сгорание: при стирании учёт не меняется,
  // баланс — одним расчётом у живого и удалённого, поэтому итог НЕ зависит от порядка событий (пятое ревью, находки 1–2).
  const kindsOf = async (id: string) => (await q<{ kind: string }>(`SELECT DISTINCT kind FROM commission_entry WHERE partner_account_id = $1 ORDER BY kind`, [id])).map((r) => r.kind);
  const owedOf = async (id: string) => (await listOwedPayouts(pool)).find((r) => r.account_id === id) ?? null;
  const eraseNow = async (id: string) => { await requestErasure(pool, id); await age(id);
    expect(await eraseAccount(pool, id, new Date(Date.now() + 67 * HOUR))).toEqual({ kind: 'erased' }); };

  it('A-N6-061: при стирании ничего не сгорает — холд и доступное без выплаты остаются долгом; сторно после стирания — на всё начисление', async () => {
    const partner = await partnerWith(200_000);
    const hold = await accrual(partner.id, 50_000, 30);
    await eraseNow(partner.id);
    expect(await kindsOf(partner.id)).toEqual(['accrual']);
    expect(await balance(partner.id)).toBe(250_000);
    expect(await owedOf(partner.id)).toMatchObject({ owed_minor: 250_000, available_minor: 200_000, payout_email: `deleted:${partner.id}` });
    await refund(hold);                                             // сторно холда удалённого — обычное, на всё начисление
    expect([await clawbacks(partner.id), await balance(partner.id)]).toEqual([1, 200_000]);
    expect(await owedOf(partner.id)).toMatchObject({ owed_minor: 200_000 });
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

  it('пятое ревью, находка 1: нулевой и отрицательный баланс — итог одинаков при любом порядке «возврат ↔ стирание», долга нет', async () => {
    const outcome = async (refundFirst: boolean) => {
      const partner = await partnerWith(200_000);
      expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `z-${partner.id}`, operator: 'op', reason: 'выплата' }))
        .toMatchObject({ kind: 'recorded' });
      await accrual(partner.id, 50_000, 30);                        // холд
      if (refundFirst) await refund(partner.payment);               // выплаченное сторнировано — баланс уходит в минус
      await eraseNow(partner.id);
      if (!refundFirst) await refund(partner.payment);
      return { balance: await balance(partner.id), kinds: await kindsOf(partner.id), owed: await owedOf(partner.id) };
    };
    const before = await outcome(true), after = await outcome(false);
    expect(before).toEqual({ balance: -150_000, kinds: ['accrual', 'clawback', 'payout'], owed: null });
    expect(after).toEqual(before);
  });

  it('пятое ревью, находка 2: поздний вебхук после выплаты — итог одинаков, записан он до или после стирания', async () => {
    const outcome = async (lateBeforeErase: boolean) => {
      const partner = await partnerWith(200_000);
      expect(await recordPartnerPayout(pool, { email: partner.mail, amountMinor: 200_000, key: `l-${partner.id}`, operator: 'op', reason: 'выплата' }))
        .toMatchObject({ kind: 'recorded' });
      await pool.query('DELETE FROM partner_payout_details WHERE account_id = $1', [partner.id]);   // без реквизитов — выплата не ждёт
      if (lateBeforeErase) await accrual(partner.id, 100_000, -40);   // задержанный вебхук со старой датой оплаты
      await eraseNow(partner.id);
      if (!lateBeforeErase) await accrual(partner.id, 100_000, -40);
      const owed = await owedOf(partner.id);
      return { balance: await balance(partner.id), owed: owed?.owed_minor ?? null, available: owed?.available_minor ?? null };
    };
    const before = await outcome(true), after = await outcome(false);
    expect(before).toEqual({ balance: 100_000, owed: 100_000, available: 100_000 });
    expect(after).toEqual(before);
  });

  it('A-N6-061: долг удалённому — выплата по обезличенной почте без реквизитов и минимума, не больше созревшего; списание — только оператором с причиной', async () => {
    const partner = await partnerWith(200_000);
    await accrual(partner.id, 30_000, 30);                          // холд — ещё не созрел
    await eraseNow(partner.id);
    const email = `deleted:${partner.id}`;
    expect(await recordPartnerPayout(pool, { email, amountMinor: 250_000, key: `d1-${partner.id}`, operator: 'op', reason: 'долг' }))
      .toMatchObject({ kind: 'exceeds_available' });
    expect(await recordPartnerPayout(pool, { email, amountMinor: 50_000, key: `d2-${partner.id}`, operator: 'op', reason: 'долг' }))
      .toMatchObject({ kind: 'recorded', balanceAfterMinor: 180_000 });   // 500 ₽ — ниже минимума, но это окончательный расчёт
    expect(await owedOf(partner.id)).toMatchObject({ owed_minor: 180_000, available_minor: 150_000 });
    expect(await writeOffErasedPartnerDebt(pool, { accountId: partner.id, operator: 'op', reason: '' })).toEqual({ kind: 'invalid' });
    const live = await partnerWith(200_000);
    expect(await writeOffErasedPartnerDebt(pool, { accountId: live.id, operator: 'op', reason: 'нет' })).toEqual({ kind: 'not_found' });
    expect(await balance(partner.id)).toBe(180_000);                // без команды ничего не списано
    expect(await writeOffErasedPartnerDebt(pool, { accountId: partner.id, operator: 'op', reason: 'партнёр отказался' }))
      .toEqual({ kind: 'written_off', amountMinor: 180_000 });
    expect(await balance(partner.id)).toBe(0);
    expect(await owedOf(partner.id)).toBeNull();
    expect((await q<{ kind: string; operator: string; reason: string; amount_minor: string }>(`SELECT kind, operator, reason, amount_minor FROM partner_audit
      WHERE account_id = $1 AND kind = 'debt_written_off'`, [partner.id])).map((r) => [r.operator, r.reason, Number(r.amount_minor)]))
      .toEqual([['op', 'партнёр отказался', 180_000]]);
    expect(await writeOffErasedPartnerDebt(pool, { accountId: partner.id, operator: 'op', reason: 'ещё' })).toEqual({ kind: 'nothing_owed' });
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

  // Шестое ревью Codex (27.09, оценка D): находки 1–4.
  it('шестое ревью, находка 1: оплата клиента ДО удаления партнёра даёт комиссию, даже если вебхук пришёл после запроса удаления; после — нет', async () => {
    const partner = await account();
    const code = `c${randomBytes(4).toString('hex')}`;
    const codeId = (await q<{ id: string }>(`INSERT INTO partner_code (code, owner_account_id, "group") VALUES ($1, $2, 'partner') RETURNING id`, [code, partner.id]))[0]!.id;
    const client = await account();
    await pool.query(`INSERT INTO attribution (account_id, partner_code_id, source) VALUES ($1, $2, 'code')`, [client.id, codeId]);
    const payAt = async (paidAt: Date) => {
      const intent = await createPaymentIntent(pool, { accountId: client.id, plan: 'nobadge', priceMinor: 99_000, idempotencyKey: randomUUID() });
      if (intent.kind === 'conflict') throw new Error('намерение');
      const pid = randomUUID();
      return applyVerifiedPayment(pool, { provider: 'fake', eventKey: `payment.succeeded:${pid}`, payloadSha256: '0'.repeat(64),
        payment: { id: pid, orderId: intent.intent.id, amountMinor: 99_000, feeMinor: 3_465, paidAt: paidAt.toISOString() } });
    };
    await requestErasure(pool, partner.id);                                    // атрибуция клиента уже partner_deleted
    await payAt(new Date(Date.now() - HOUR));                                 // оплачено ДО запроса — вебхук поздний
    const accruals = () => one(`SELECT count(*) FROM commission_entry WHERE partner_account_id = $1 AND kind = 'accrual'`, [partner.id]);
    expect(await accruals()).toBe(1);
    await payAt(new Date(Date.now() + 60_000));                               // оплачено ПОСЛЕ запроса — комиссии нет
    expect(await accruals()).toBe(1);
  });

  it('шестое ревью, находка 2: PDF удалённого источника, который уборка тома не смогла стереть, стирается вместе с аккаунтом', async () => {
    const owner = await account();
    const b = await bot(owner.id);
    const source = (await q<{ id: string }>(`INSERT INTO source (bot_id, kind, file_name, status) VALUES ($1, 'pdf', 'прайс.pdf', 'indexing') RETURNING id`, [b.id]))[0]!.id;
    const job = (await q<{ id: string }>(`INSERT INTO index_job (bot_id, source_id, idempotency_key, status) VALUES ($1, $2, gen_random_uuid(), 'queued') RETURNING id`,
      [b.id, source]))[0]!.id;
    const dir = mkdtempSync(join(tmpdir(), 'n6-orphan-'));
    writeFileSync(join(dir, job), '%PDF-1.4 x');
    expect(await deleteSource(pool, source, owner.id)).toMatchObject({ deleted: true });
    expect(await one('SELECT count(*) FROM index_job WHERE id = $1', [job])).toBe(0);            // связь через задачу потеряна
    expect(await one('SELECT count(*) FROM upload_orphan WHERE index_job_id = $1', [job])).toBe(1);
    await requestErasure(pool, owner.id);
    await age(owner.id);
    await erasureTick(pool, dir, new Date(), 500, { removeUpload: (d, id) => import('../apps/worker/src/pdf/uploads').then((m) => m.removeUpload(d, id)), log: () => {} });
    expect(existsSync(join(dir, job)), 'файл удалённого источника остался в томе').toBe(false);
    expect(await status(owner.id)).toBe('deleted');
    expect(await one('SELECT count(*) FROM upload_orphan WHERE account_id = $1', [owner.id])).toBe(0);
  });

  it('шестое ревью, находка 2: пока сирота не удалена, надгробие не ставится', async () => {
    const owner = await account();
    await requestErasure(pool, owner.id);
    await age(owner.id);
    await pool.query('INSERT INTO upload_orphan (index_job_id, account_id) VALUES (gen_random_uuid(), $1)', [owner.id]);
    await expect(eraseAccount(pool, owner.id, new Date())).rejects.toThrow(/файлы удалённых источников/);
    expect(await status(owner.id)).toBe('erasing');
  });

  it('шестое ревью, находка 3: имя в группе кода и причина в журнале партнёра обезличиваются', async () => {
    const partner = await account('studio');
    const codeId = (await q<{ id: string }>(`INSERT INTO partner_code (code, owner_account_id, "group") VALUES ($1, $2, 'seed-studio-ivan-petrov') RETURNING id`,
      [`c${randomBytes(4).toString('hex')}`, partner.id]))[0]!.id;
    await pool.query(`INSERT INTO partner_audit (partner_code_id, account_id, kind, operator, reason) VALUES ($1, NULL, 'code_issued', 'op', $2)`,
      [codeId, `выдан ${partner.mail}`]);
    await pool.query(`INSERT INTO partner_audit (account_id, kind, operator, reason, amount_minor) VALUES ($1, 'payout_recorded', 'op', $2, 100000)`,
      [partner.id, `перевод Ивану Петрову ${partner.mail}`]);
    await requestErasure(pool, partner.id);
    await age(partner.id);
    expect(await eraseAccount(pool, partner.id)).toEqual({ kind: 'erased' });
    expect((await q<{ group: string }>('SELECT "group" FROM partner_code WHERE id = $1', [codeId]))[0]!.group).toBe('seed-studio-erased');
    const leftovers = await q<{ reason: string | null }>(`SELECT reason FROM partner_audit WHERE account_id = $1 OR partner_code_id = $2`, [partner.id, codeId]);
    expect(leftovers.length).toBe(2);
    expect(leftovers.every((r) => r.reason === 'обезличено при удалении аккаунта'), JSON.stringify(leftovers)).toBe(true);
    expect(await one('SELECT count(*) FROM partner_audit WHERE amount_minor = 100000 AND account_id = $1', [partner.id])).toBe(1);   // сумма осталась
  });

  it('шестое ревью, находка 4: две студии со встречными приглашениями удаляются одновременно — без взаимной блокировки', async () => {
    for (let round = 0; round < 8; round++) {
      const a = await account('studio'), b = await account('studio');
      const botA = await bot(a.id), botB = await bot(b.id);
      expect((await createStudioInvite(pool, { studioAccountId: a.id, botId: botA.id, email: b.mail })).kind).toBe('created');
      expect((await createStudioInvite(pool, { studioAccountId: b.id, botId: botB.id, email: a.mail })).kind).toBe('created');
      const results = await Promise.all([requestErasure(pool, a.id), requestErasure(pool, b.id)]);
      expect(results.map((r) => r.kind), `раунд ${round}`).toEqual(['accepted', 'accepted']);
      await Promise.all([age(a.id), age(b.id)]);
      const erased = await Promise.all([eraseAccount(pool, a.id), eraseAccount(pool, b.id)]);
      expect(erased, `раунд ${round}`).toEqual([{ kind: 'erased' }, { kind: 'erased' }]);
      expect([await invitesTo(a.mail), await invitesTo(b.mail)]).toEqual([0, 0]);
    }
  }, 60_000);

  it('проверка фикстуры: приглашение без стирания остаётся (иначе тесты находок 2–3 зеленели бы на пустоте)', async () => {
    const addressee = await account(), studio = await account('studio');
    const own = await bot(studio.id);
    expect((await createStudioInvite(pool, { studioAccountId: studio.id, botId: own.id, email: addressee.mail })).kind).toBe('created');
    expect(await invitesTo(addressee.mail)).toBe(1);
  });
});
