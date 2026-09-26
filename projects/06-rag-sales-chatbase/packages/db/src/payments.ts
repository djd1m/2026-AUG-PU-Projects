// Деньги в БД (фича tariffs-and-interest, FR-TARIFF-002, ADR-017 дополненный, A-N6-040). Донор — N4
// projects/04-calorie-vision-cal-ai/apps/api/src/routes/payments-webhook.ts (applyPayment) и routes/subscription.ts
// (намерение) — адаптировано: план аккаунта вместо подписки, разовая оплата на 30 дней, без комиссий (фича 15), возврат
// и несовпадение суммы — вручную оператором (решения владельца 26.09).
//
// Подлинность уведомления проверяет web ДО вызова applyVerifiedPayment и ВНЕ транзакции (security-operation-order):
// сюда приходит только перезапрошенный у ЮKassa платёж. Внутри транзакции нет сетевых вызовов.
import { PAID_PLAN_DAYS, PLAN_RANK, isPaidPlan, readAccountPlan, type PaidPlan } from '@n6/rag';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export type PaymentProviderName = 'yookassa' | 'fake';
export interface IntentRow { id: string; plan: PaidPlan; price_minor: number; status: 'created' | 'succeeded' | 'canceled'; provider_payment_id: string | null }
export type CreateIntentResult = { kind: 'created' | 'existing'; intent: IntentRow } | { kind: 'conflict' };

// Намерение выдаётся ДО ухода к провайдеру (long-running-job): повтор с тем же ключом клиента — то же намерение.
// «Вставить, иначе прочитать» атомарно: UNIQUE (account_id, idempotency_key) + ON CONFLICT DO NOTHING (донор N4).
export async function createPaymentIntent(pool: Pool, input: { accountId: string; plan: PaidPlan; priceMinor: number; idempotencyKey: string }): Promise<CreateIntentResult> {
  const inserted = (await pool.query<IntentRow>(`INSERT INTO payment_intent (account_id, plan, price_minor, idempotency_key) VALUES ($1, $2, $3, $4)
    ON CONFLICT (account_id, idempotency_key) DO NOTHING RETURNING id, plan, price_minor, status, provider_payment_id`,
  [input.accountId, input.plan, input.priceMinor, input.idempotencyKey])).rows[0];
  if (inserted) return { kind: 'created', intent: inserted };
  const existing = (await pool.query<IntentRow>(`SELECT id, plan, price_minor, status, provider_payment_id FROM payment_intent
    WHERE account_id = $1 AND idempotency_key = $2`, [input.accountId, input.idempotencyKey])).rows[0];
  // Тот же ключ для ДРУГОГО плана — не повтор, а ошибка клиента: второй платёж по старому намерению не создаётся.
  if (!existing || existing.plan !== input.plan) return { kind: 'conflict' };
  return { kind: 'existing', intent: existing };
}

// Идентификатор платежа у провайдера — для опроса возврата с формы (отменённый платёж → состояние «отказ»).
// false — у намерения уже ДРУГОЙ платёж (ревью фичи 14, находка 2): расхождение не игнорируется молча.
export async function setIntentProviderPayment(pool: Pool, intentId: string, providerPaymentId: string): Promise<boolean> {
  const updated = await pool.query(`UPDATE payment_intent SET provider_payment_id = $2 WHERE id = $1 AND (provider_payment_id IS NULL OR provider_payment_id = $2)`,
    [intentId, providerPaymentId]);
  return updated.rowCount === 1;
}
export async function markIntentCanceled(pool: Pool, intentId: string): Promise<void> {
  await pool.query(`UPDATE payment_intent SET status = 'canceled' WHERE id = $1 AND status = 'created'`, [intentId]);
}

export interface IntentView extends IntentRow { account_plan: string; plan_paid_until: string | null }
// Чужое и несуществующее намерение — один ответ null (канон: чужой ресурс — 404).
export async function readPaymentIntent(pool: Pool, intentId: string, accountId: string): Promise<IntentView | null> {
  if (!isUuid(intentId) || !isUuid(accountId)) return null;
  const row = (await pool.query<IntentRow & { account_plan: string; plan_paid_until: Date | null }>(`SELECT i.id, i.plan, i.price_minor, i.status,
      i.provider_payment_id, a.plan AS account_plan, a.plan_paid_until
    FROM payment_intent i JOIN account a ON a.id = i.account_id WHERE i.id = $1 AND i.account_id = $2`, [intentId, accountId])).rows[0];
  if (!row) return null;
  return { ...row, plan_paid_until: row.plan_paid_until?.toISOString() ?? null };
}

export interface VerifiedPayment { id: string; orderId: string | null; amountMinor: number; feeMinor: number | null; paidAt: string | null }
export type ApplyPaymentOutcome =
  | { applied: true; plan: string; paidUntil: string }
  | { applied: false; reason: 'duplicate' | 'amount_mismatch' | 'unknown_intent' | 'refunded' | 'refund_recorded' };

// Ключ повторности (incoming-webhooks): ПОЛЕ — событие + object.id у ЮKassa; МЕСТО — payment_event; МЕХАНИЗМ — уникальный
// индекс, конфликт вставки И ЕСТЬ «уже обработано» (две одновременные доставки не проходят обе).
async function claimEvent(tx: PoolClient, provider: PaymentProviderName, eventKey: string, payloadSha256: string): Promise<boolean> {
  const claimed = await tx.query(`INSERT INTO payment_event (provider, provider_event_id, payload_sha256) VALUES ($1, $2, $3)
    ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`, [provider, eventKey, payloadSha256]);
  return claimed.rowCount === 1;
}
// Оплата и возврат ОДНОГО платежа — разные события с разными ключами и приходят в любом порядке и одновременно (ревью
// фичи 14, находка 1): транзакции по одному платежу сериализуются блокировкой до конца транзакции.
async function lockPayment(tx: PoolClient, provider: PaymentProviderName, paymentId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`payment:${provider}:${paymentId}`]);
}

// Успешная оплата → план. Перестановочно (incoming-webhooks «перестановка»): план — СТАРШИЙ из действующего и
// оплаченного, срок — GREATEST(срок, now()) + 30 дней; две оплаты в любом порядке дают один итог.
export function applyVerifiedPayment(pool: Pool, input: { provider: PaymentProviderName; eventKey: string; payloadSha256: string; payment: VerifiedPayment }): Promise<ApplyPaymentOutcome> {
  const { payment } = input;
  return transaction(pool, async (tx) => {
    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;
    await lockPayment(tx, input.provider, payment.id);
    // Возврат приехал РАНЬШЕ оплаты (перестановка): платёж уже записан refunded на разбор — план по нему не выдаётся.
    const prior = (await tx.query<{ status: string }>(`SELECT status FROM payment WHERE provider = $1 AND provider_payment_id = $2`,
      [input.provider, payment.id])).rows[0];
    if (prior?.status === 'refunded') return { applied: false, reason: 'refunded' } as const;
    const paidAt = payment.paidAt ?? new Date().toISOString();
    const intent = payment.orderId && isUuid(payment.orderId)
      ? (await tx.query<{ account_id: string; plan: string; price_minor: number }>(`SELECT account_id, plan, price_minor FROM payment_intent
          WHERE id = $1 FOR UPDATE`, [payment.orderId])).rows[0]
      : undefined;
    const record = (accountId: string | null, plan: string | null, review: string | null) => tx.query(`INSERT INTO payment
        (intent_id, account_id, provider, provider_payment_id, plan, amount_minor, fee_minor, needs_review, review_reason, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (provider, provider_payment_id) DO NOTHING`,
    [intent ? payment.orderId : null, accountId, input.provider, payment.id, plan, payment.amountMinor, payment.feeMinor, review !== null, review, paidAt]);
    // Платёж без нашего намерения: деньги реальны — записываются на разбор, план не выдаётся никому.
    if (!intent || !isPaidPlan(intent.plan)) { await record(null, null, 'unknown_intent'); return { applied: false, reason: 'unknown_intent' } as const; }
    // Сумма ≠ цене намерения: платёж принят, план НЕ выдан — разбирает оператор (решение владельца 26.09).
    if (payment.amountMinor !== intent.price_minor) { await record(intent.account_id, intent.plan, 'amount_mismatch'); return { applied: false, reason: 'amount_mismatch' } as const; }
    await record(intent.account_id, intent.plan, null);
    // «Успех» на экране возврата — только когда план ВЫДАН (несовпадение суммы оставляет намерение created → «не подтверждено»).
    await tx.query(`UPDATE payment_intent SET status = 'succeeded' WHERE id = $1`, [payment.orderId]);
    const updated = await grantPaidPlan(tx, intent.account_id, intent.plan);
    // Атрибуция конвертируется ОПЛАТОЙ (A-N6-015: «появляется свой магазин — план назначает оплата»).
    await tx.query(`UPDATE attribution SET status = 'converted' WHERE account_id = $1 AND status = 'pending'`, [intent.account_id]);
    return { applied: true, plan: updated.plan, paidUntil: updated.paidUntil } as const;
  });
}

async function grantPaidPlan(tx: PoolClient, accountId: string, paid: PaidPlan): Promise<{ plan: string; paidUntil: string }> {
  const row = (await tx.query<{ plan: string; plan_source: string; plan_paid_until: Date | null; now: Date }>(`SELECT plan, plan_source, plan_paid_until, now() AS now
    FROM account WHERE id = $1 FOR UPDATE`, [accountId])).rows[0];
  if (!row) throw new Error('Аккаунт намерения не найден: оплата не применяется, транзакция откатывается');
  const current = readAccountPlan(row.plan);
  // Действующий план: оплаченный — пока не истёк; назначенный оператором или до миграции 006 — бессрочно.
  const active = row.plan_source === 'payment' ? (row.plan_paid_until && row.plan_paid_until > row.now ? current : 'free') : current;
  const keepOperator = row.plan_source !== 'payment' && row.plan_source !== 'none' && PLAN_RANK[active] >= PLAN_RANK[paid];
  const keepLegacy = row.plan_source === 'none' && active !== 'free' && PLAN_RANK[active] >= PLAN_RANK[paid];
  const plan = PLAN_RANK[paid] > PLAN_RANK[active] ? paid : active;
  const result = (await tx.query<{ plan: string; plan_paid_until: Date }>(`UPDATE account SET plan = $2,
      plan_source = CASE WHEN $3::boolean THEN plan_source ELSE 'payment' END,
      plan_paid_until = GREATEST(COALESCE(plan_paid_until, now()), now()) + make_interval(days => $4)
    WHERE id = $1 RETURNING plan, plan_paid_until`, [accountId, plan, keepOperator || keepLegacy, PAID_PLAN_DAYS])).rows[0]!;
  return { plan: result.plan, paidUntil: result.plan_paid_until.toISOString() };
}

// Возврат (refund.succeeded): принимается и помечается на разбор; план снимает оператор (решение владельца 26.09).
// Перестановочно (ревью фичи 14, находка 1): если строки платежа ещё нет (возврат раньше оплаты), она создаётся СРАЗУ
// refunded из перезапрошенного у ЮKassa платежа — последующая оплата увидит возврат и план не выдаст.
export function recordVerifiedRefund(pool: Pool, input: { provider: PaymentProviderName; eventKey: string; payloadSha256: string; payment: VerifiedPayment }): Promise<ApplyPaymentOutcome> {
  const { payment } = input;
  return transaction(pool, async (tx) => {
    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;
    await lockPayment(tx, input.provider, payment.id);
    const intent = payment.orderId && isUuid(payment.orderId)
      ? (await tx.query<{ account_id: string; plan: string }>('SELECT account_id, plan FROM payment_intent WHERE id = $1', [payment.orderId])).rows[0]
      : undefined;
    await tx.query(`INSERT INTO payment (intent_id, account_id, provider, provider_payment_id, plan, amount_minor, fee_minor, status, needs_review, review_reason, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'refunded', true, 'refund', $8)
      ON CONFLICT (provider, provider_payment_id) DO UPDATE SET status = 'refunded', needs_review = true, review_reason = 'refund'`,
    [intent ? payment.orderId : null, intent?.account_id ?? null, input.provider, payment.id, intent && isPaidPlan(intent.plan) ? intent.plan : null,
      payment.amountMinor, payment.feeMinor, payment.paidAt ?? new Date().toISOString()]);
    return { applied: false, reason: 'refund_recorded' } as const;
  });
}

// Сторож: истёкший ОПЛАЧЕННЫЙ план → free (бейдж возвращается). План оператора и назначенный до 006 не истекают.
export async function expirePaidPlans(pool: Pool, batch: number): Promise<number> {
  const expired = await pool.query(`UPDATE account SET plan = 'free', plan_source = 'none' WHERE id IN (
      SELECT id FROM account WHERE plan_source = 'payment' AND plan_paid_until <= now() ORDER BY plan_paid_until LIMIT $1 FOR UPDATE SKIP LOCKED)
    AND plan_source = 'payment' AND plan_paid_until <= now()`, [batch]);
  return expired.rowCount ?? 0;
}

export interface AccountBilling { plan: string; plan_source: string; plan_paid_until: string | null }
export async function readAccountBilling(pool: Pool, accountId: string): Promise<AccountBilling | null> {
  if (!isUuid(accountId)) return null;
  const row = (await pool.query<{ plan: string; plan_source: string; plan_paid_until: Date | null }>(`SELECT plan, plan_source, plan_paid_until
    FROM account WHERE id = $1 AND status = 'active'`, [accountId])).rows[0];
  return row ? { plan: readAccountPlan(row.plan), plan_source: row.plan_source, plan_paid_until: row.plan_paid_until?.toISOString() ?? null } : null;
}
