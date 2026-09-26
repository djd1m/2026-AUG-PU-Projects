// Интерес к платному плану и назначение плана оператором (фича tariffs-and-interest, FR-TARIFF-002, SC-US-011-1/2,
// Pseudocode SetPlanByOperator). Донор интереса — N4 projects/04-calorie-vision-cal-ai/apps/api/src/interest/record-pro-interest.ts —
// адаптировано: контакт — почта аккаунта (вход обязателен), каденция «одна запись на план в сутки МСК» держится уникальным
// ключом growth_event (type, dedup_key) в ОДНОМ операторе вместо advisory-lock донора; сутки — от now() БД (урок RV-01 N4).
import { PAID_PLANS, readAccountPlan, type PaidPlan } from '@n6/rag';
import type { Pool } from 'pg';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export const INTEREST_ORIGIN_SCREENS = ['pricing', 'upgrade', 'install', 'cabinet'] as const;
export type InterestOriginScreen = typeof INTEREST_ORIGIN_SCREENS[number];
export const isInterestOriginScreen = (value: unknown): value is InterestOriginScreen =>
  typeof value === 'string' && (INTEREST_ORIGIN_SCREENS as readonly string[]).includes(value);

// Одна запись на (аккаунт, план, сутки МСК): событие роста `interest` и строка pro_interest — одним оператором; конфликт
// ключа события И ЕСТЬ «уже записано сегодня», две одновременные записи не проходят обе.
export async function recordProInterest(pool: Pool, input: { accountId: string; plan: PaidPlan; originScreen: InterestOriginScreen }): Promise<'recorded' | 'already_recorded' | 'not_found'> {
  if (!isUuid(input.accountId) || !(PAID_PLANS as readonly string[]).includes(input.plan)) return 'not_found';
  const result = await pool.query(`WITH owner AS (SELECT id FROM account WHERE id = $1 AND status = 'active'),
      g AS (INSERT INTO growth_event (type, account_id, dedup_key)
        SELECT 'interest', id, 'interest:' || id || ':' || $2 || ':' || to_char(now() AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') FROM owner
        ON CONFLICT (type, dedup_key) DO NOTHING RETURNING account_id)
    INSERT INTO pro_interest (account_id, plan_wanted, origin_screen) SELECT account_id, $2, $3 FROM g RETURNING id`,
  [input.accountId, input.plan, input.originScreen]);
  if (result.rowCount === 1) return 'recorded';
  const exists = await pool.query(`SELECT 1 FROM account WHERE id = $1 AND status = 'active'`, [input.accountId]);
  return exists.rowCount ? 'already_recorded' : 'not_found';
}

export type SetPlanResult = { kind: 'updated'; before: string; after: string } | { kind: 'not_found' } | { kind: 'invalid'; field: 'plan' | 'operator' | 'reason' };
// SetPlanByOperator: план из закрытого набора, оператор и причина обязательны; план + источник + конвертация атрибуции +
// строка журнала — одной транзакцией. Это замена платежа, а не его имитация: план оператора не истекает (plan_source).
export function setPlanByOperator(pool: Pool, input: { email: string; plan: string; operator: string; reason: string }): Promise<SetPlanResult> {
  if (input.plan !== 'free' && input.plan !== 'nobadge' && input.plan !== 'studio') return Promise.resolve({ kind: 'invalid', field: 'plan' });
  const operator = input.operator.trim(), reason = input.reason.trim();
  if (operator.length < 1 || operator.length > 100) return Promise.resolve({ kind: 'invalid', field: 'operator' });
  if (reason.length < 3 || reason.length > 500) return Promise.resolve({ kind: 'invalid', field: 'reason' });
  const plan = input.plan;
  return transaction(pool, async (tx) => {
    const account = (await tx.query<{ id: string; plan: string }>(`SELECT id, plan FROM account WHERE email = lower(btrim($1)) AND status = 'active' FOR NO KEY UPDATE`,
      [input.email])).rows[0];
    if (!account) return { kind: 'not_found' } as const;
    // Снятие плана (free) стирает и оплаченный остаток: иначе следующая оплата продлила бы срок, снятый после возврата
    // (ревью фичи 14, находка 3). Назначение платного плана остаток не трогает — он не истекает, пока источник operator.
    await tx.query(`UPDATE account SET plan = $2, plan_source = CASE WHEN $2 = 'free' THEN 'none' ELSE 'operator' END,
      plan_paid_until = CASE WHEN $2 = 'free' THEN NULL ELSE plan_paid_until END WHERE id = $1`, [account.id, plan]);
    if (plan !== 'free') await tx.query(`UPDATE attribution SET status = 'converted' WHERE account_id = $1 AND status = 'pending'`, [account.id]);
    const before = readAccountPlan(account.plan);
    await tx.query(`INSERT INTO operator_action (operator, reason, account_id, action, plan_before, plan_after) VALUES ($1, $2, $3, 'set_plan', $4, $5)`,
      [operator, reason, account.id, before, plan]);
    return { kind: 'updated', before, after: plan } as const;
  });
}
