// Деньги партнёра в БД (фича partner-and-studio, A-N6-043): начисление, сторно, выплата, реквизиты, кабинет.
// Донор — N4 projects/04-calorie-vision-cal-ai/apps/api/src/commission/accrue.ts — ПЕРЕНЕСЕНО почти как есть (запись
// внутри транзакции платежа, сторно берёт сумму из самого начисления, «один раз на платёж» — частичным уникальным
// индексом); АДАПТИРОВАНО: партнёр — владелец partner_code атрибуции аккаунта, база — сумма после удержания ЮКассы,
// окно 12 месяцев с первой оплаты клиента (решения владельца 26.09). N4 routes/earnings.ts — кабинет: баланс считается
// СУММОЙ в SQL (у донора — по последним 200 записям, при долгой истории неверно).
//
// ЕДИНСТВЕННОЕ место, где пишется commission_entry (страж tests/partners.unit.test.ts, мутация unmetered-commission).
import { COMMISSION_HOLD_DAYS, COMMISSION_WINDOW_MONTHS, PAYOUT_MINIMUM_MINOR, accrualAmountMinor, commissionBaseMinor,
  payoutDateFor, previewFromTotals, type PayoutDetails, type PayoutPreview } from '@n6/rag';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export type AccrueResult =
  | { kind: 'accrued'; partnerAccountId: string; amountMinor: number }
  | { kind: 'skipped'; reason: 'no_attribution' | 'no_partner' | 'self_referral' | 'window_expired' | 'fee_unknown' | 'non_positive' | 'already_accrued' };

export interface AccrueInput { paymentId: string; accountId: string; amountMinor: number; feeMinor: number | null; paidAt: string }

// Начисление ВНУТРИ транзакции applyVerifiedPayment (после ключа повторности и блокировки платежа): платёж и обязательство
// перед партнёром ложатся одним коммитом. Сетевых вызовов нет.
export async function accrueCommissionTx(tx: PoolClient, input: AccrueInput): Promise<AccrueResult> {
  const partner = (await tx.query<{ partner_code_id: string; owner_account_id: string | null; commission_rate_bp: number }>(
    `SELECT a.partner_code_id, pc.owner_account_id, pc.commission_rate_bp FROM attribution a JOIN partner_code pc ON pc.id = a.partner_code_id
     WHERE a.account_id = $1 AND a.status IN ('pending', 'converted')`, [input.accountId])).rows[0];
  if (!partner) return { kind: 'skipped', reason: 'no_attribution' };
  if (partner.owner_account_id === null) return { kind: 'skipped', reason: 'no_partner' };     // seed-код без владельца — платить некому
  // Самореферал — ПОВТОРНО: при атрибуции за него ничего не платили, деньги делают попытку осмысленной.
  if (partner.owner_account_id === input.accountId) return { kind: 'skipped', reason: 'self_referral' };
  // Начало окна — ПЕРВАЯ оплата клиента в ЛЮБОМ статусе (ревью фичи 15, находка 1): возврат или разбор первой оплаты не
  // сдвигает начало 12 месяцев (решение владельца: «12 месяцев с первой оплаты»).
  const first = (await tx.query<{ first: Date | null; in_window: boolean }>(`SELECT min(paid_at) AS first,
      $2::timestamptz < min(paid_at) + make_interval(months => $3) AS in_window
    FROM payment WHERE account_id = $1`,
  [input.accountId, input.paidAt, COMMISSION_WINDOW_MONTHS])).rows[0];
  if (!first?.first || first.in_window !== true) return { kind: 'skipped', reason: 'window_expired' };
  const base = commissionBaseMinor(input.amountMinor, input.feeMinor);
  if (base === null) {
    // Удержание неизвестно (нет income_amount): базу не угадываем и с полной суммы не начисляем — разбирает оператор.
    await tx.query(`INSERT INTO partner_audit (partner_code_id, account_id, kind, amount_minor) VALUES ($1, $2, 'accrual_skipped_fee_unknown', $3)`,
      [partner.partner_code_id, partner.owner_account_id, input.amountMinor]);
    return { kind: 'skipped', reason: 'fee_unknown' };
  }
  const amountMinor = accrualAmountMinor(base, partner.commission_rate_bp);
  if (amountMinor <= 0) return { kind: 'skipped', reason: 'non_positive' };
  const inserted = await tx.query(`INSERT INTO commission_entry (partner_account_id, partner_code_id, payment_id, kind, amount_minor, available_at)
    VALUES ($1, $2, $3, 'accrual', $4, $5::timestamptz + make_interval(days => $6)) ON CONFLICT DO NOTHING RETURNING id`,
  [partner.owner_account_id, partner.partner_code_id, input.paymentId, amountMinor, input.paidAt, COMMISSION_HOLD_DAYS]);
  if (inserted.rowCount !== 1) return { kind: 'skipped', reason: 'already_accrued' };
  return { kind: 'accrued', partnerAccountId: partner.owner_account_id, amountMinor };
}

export type ClawbackResult = { kind: 'clawed_back'; amountMinor: number } | { kind: 'skipped'; reason: 'no_accrual' | 'already_clawed_back' };
// Сторно — КОМПЕНСИРУЮЩАЯ запись на −начисление (не пересчёт от суммы возврата), доступна сразу: долг уменьшает доступное
// немедленно. После выплаты баланс уходит в минус и гасится будущими начислениями, не взыскивается (решение владельца 26.09).
export async function clawbackCommissionTx(tx: PoolClient, paymentId: string): Promise<ClawbackResult> {
  const accrual = (await tx.query<{ partner_account_id: string; partner_code_id: string | null; amount_minor: string }>(
    `SELECT partner_account_id, partner_code_id, amount_minor FROM commission_entry WHERE payment_id = $1 AND kind = 'accrual'`, [paymentId])).rows[0];
  if (!accrual) return { kind: 'skipped', reason: 'no_accrual' };
  const amount = -Number(accrual.amount_minor);
  const inserted = await tx.query(`INSERT INTO commission_entry (partner_account_id, partner_code_id, payment_id, kind, amount_minor, available_at)
    VALUES ($1, $2, $3, 'clawback', $4, now()) ON CONFLICT DO NOTHING RETURNING id`,
  [accrual.partner_account_id, accrual.partner_code_id, paymentId, amount]);
  return inserted.rowCount === 1 ? { kind: 'clawed_back', amountMinor: amount } : { kind: 'skipped', reason: 'already_clawed_back' };
}

// Суммы партнёра на момент `at`: баланс и доступное (зрелые начисления + все отрицательные записи).
async function totals(db: Pool | PoolClient, accountId: string, at: Date): Promise<{ total: number; available: number }> {
  const row = (await db.query<{ total: string; available: string }>(`SELECT COALESCE(sum(amount_minor), 0)::bigint AS total,
      COALESCE(sum(amount_minor) FILTER (WHERE amount_minor < 0 OR available_at <= $2), 0)::bigint AS available
    FROM commission_entry WHERE partner_account_id = $1`, [accountId, at])).rows[0]!;
  return { total: Number(row.total), available: Number(row.available) };
}

export type RecordPayoutResult =
  | { kind: 'recorded' | 'duplicate'; amountMinor: number; balanceAfterMinor: number }
  | { kind: 'not_found' | 'no_details' | 'key_conflict' }
  | { kind: 'below_minimum'; minimumMinor: number }
  | { kind: 'exceeds_available'; availableMinor: number };
// Выплата оператором (решение владельца 26.09: вручную по СБП 5-го, минимум 1 000 ₽). Под блокировкой партнёра: две
// одновременные записи не превышают доступное. Повтор с тем же ключом — одна запись (частичный уникальный индекс).
export function recordPartnerPayout(pool: Pool, input: { email: string; amountMinor: number; key: string; operator: string; reason: string }): Promise<RecordPayoutResult> {
  return transaction(pool, async (tx) => {
    const account = (await tx.query<{ id: string }>(`SELECT id FROM account WHERE email = $1 AND status = 'active'`, [input.email.trim().toLowerCase()])).rows[0];
    if (!account) return { kind: 'not_found' } as const;
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_payout:${account.id}`]);
    const prior = (await tx.query<{ amount_minor: string }>(`SELECT amount_minor FROM commission_entry
      WHERE partner_account_id = $1 AND kind = 'payout' AND payout_key = $2`, [account.id, input.key])).rows[0];
    const now = new Date();
    if (prior) {
      if (-Number(prior.amount_minor) !== input.amountMinor) return { kind: 'key_conflict' } as const;
      return { kind: 'duplicate', amountMinor: input.amountMinor, balanceAfterMinor: (await totals(tx, account.id, now)).total } as const;
    }
    const details = await tx.query('SELECT 1 FROM partner_payout_details WHERE account_id = $1', [account.id]);
    if (!details.rowCount) return { kind: 'no_details' } as const;
    if (input.amountMinor < PAYOUT_MINIMUM_MINOR) return { kind: 'below_minimum', minimumMinor: PAYOUT_MINIMUM_MINOR } as const;
    const { available } = await totals(tx, account.id, now);
    if (input.amountMinor > available) return { kind: 'exceeds_available', availableMinor: Math.max(0, available) } as const;
    await tx.query(`INSERT INTO commission_entry (partner_account_id, kind, amount_minor, available_at, payout_key) VALUES ($1, 'payout', $2, now(), $3)`,
      [account.id, -input.amountMinor, input.key]);
    await tx.query(`INSERT INTO partner_audit (account_id, kind, operator, reason, amount_minor) VALUES ($1, 'payout_recorded', $2, $3, $4)`,
      [account.id, input.operator, input.reason, input.amountMinor]);
    return { kind: 'recorded', amountMinor: input.amountMinor, balanceAfterMinor: (await totals(tx, account.id, now)).total } as const;
  });
}

export async function savePayoutDetails(pool: Pool, accountId: string, details: PayoutDetails): Promise<boolean> {
  if (!isUuid(accountId)) return false;
  const saved = await pool.query(`INSERT INTO partner_payout_details (account_id, method, phone, bank)
    SELECT id, $2, $3, $4 FROM account WHERE id = $1 AND status = 'active'
    ON CONFLICT (account_id) DO UPDATE SET method = EXCLUDED.method, phone = EXCLUDED.phone, bank = EXCLUDED.bank, updated_at = now()`,
  [accountId, details.method, details.phone, details.bank]);
  return saved.rowCount === 1;
}

export interface PartnerCodeView { code: string; group: string; frozen: boolean; rate_bp: number }
export interface PartnerCohort { registrations: number; rejected: number; installs: number; conversions: number }
export interface PartnerEntryView { kind: 'accrual' | 'clawback' | 'payout'; amount_minor: number; created_at: string; available_at: string }
export interface PartnerCabinet {
  codes: PartnerCodeView[]; cohort: PartnerCohort;
  money: { total_minor: number; due_minor: number; deferred_minor: number; debt_minor: number; payout_date: string; minimum_minor: number };
  entries: PartnerEntryView[];
  payout_details: { phone_masked: string; bank: string | null } | null;
}
// Кабинет партнёра: партнёр — из сессии (id из запроса не читается). Плательщиков не видно (ни почты, ни id — 152-ФЗ):
// только суммы и даты. null — у аккаунта нет ни одного кода (не партнёр).
export async function readPartnerCabinet(pool: Pool, accountId: string, now = new Date()): Promise<PartnerCabinet | null> {
  if (!isUuid(accountId)) return null;
  const codes = (await pool.query<{ id: string; code: string; group: string; frozen: boolean; commission_rate_bp: number }>(
    `SELECT pc.id, pc.code, pc."group", pc.frozen, pc.commission_rate_bp FROM partner_code pc JOIN account a ON a.id = pc.owner_account_id
     WHERE pc.owner_account_id = $1 AND a.status = 'active' ORDER BY pc.created_at, pc.code`, [accountId])).rows;
  if (codes.length === 0) return null;
  const ids = codes.map((c) => c.id);
  const cohort = (await pool.query<{ registrations: number; rejected: number; conversions: number; installs: number }>(`SELECT
      count(*) FILTER (WHERE at.status <> 'rejected')::int AS registrations,
      count(*) FILTER (WHERE at.status = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE at.status = 'converted')::int AS conversions,
      (SELECT count(DISTINCT wi.bot_id)::int FROM widget_install wi JOIN bot b ON b.id = wi.bot_id
        WHERE b.account_id IN (SELECT account_id FROM attribution WHERE partner_code_id = ANY($1::uuid[]) AND status <> 'rejected')) AS installs
    FROM attribution at WHERE at.partner_code_id = ANY($1::uuid[])`, [ids])).rows[0]!;
  const payoutDate = payoutDateFor(now);
  // В день выплаты доступное — на ТЕКУЩИЙ момент (зрелое к нему), иначе — на дату ближайшей выплаты.
  const sums = await totals(pool, accountId, payoutDate.getTime() < now.getTime() ? now : payoutDate);
  const preview: PayoutPreview = previewFromTotals(sums.total, sums.available, payoutDate);
  const entries = (await pool.query<{ kind: PartnerEntryView['kind']; amount_minor: string; created_at: Date; available_at: Date }>(
    `SELECT kind, amount_minor, created_at, available_at FROM commission_entry WHERE partner_account_id = $1 ORDER BY created_at DESC, id LIMIT 20`,
    [accountId])).rows;
  const details = (await pool.query<{ phone: string; bank: string | null }>('SELECT phone, bank FROM partner_payout_details WHERE account_id = $1', [accountId])).rows[0];
  return {
    codes: codes.map((c) => ({ code: c.code, group: c.group, frozen: c.frozen, rate_bp: c.commission_rate_bp })),
    cohort: { registrations: cohort.registrations, rejected: cohort.rejected, installs: cohort.installs, conversions: cohort.conversions },
    money: { total_minor: sums.total, due_minor: preview.dueMinor, deferred_minor: preview.deferredMinor, debt_minor: preview.debtMinor,
      payout_date: preview.payoutDate.toISOString(), minimum_minor: PAYOUT_MINIMUM_MINOR },
    entries: entries.map((e) => ({ kind: e.kind, amount_minor: Number(e.amount_minor), created_at: e.created_at.toISOString(), available_at: e.available_at.toISOString() })),
    // Телефон показывается маской: полный номер нужен оператору (выгрузка), а не экрану.
    payout_details: details ? { phone_masked: `${details.phone.slice(0, 2)} *** ***-${details.phone.slice(-4, -2)}-${details.phone.slice(-2)}`, bank: details.bank } : null,
  };
}
