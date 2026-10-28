// из N6: projects/06-rag-sales-chatbase/packages/db/src/payments.ts — адаптировано (фича 30 payments, OWN-019, ADR-019):
// платный план ОДИН (`paid`) — ранги планов N6 и колонка плана у намерения убраны; комиссий нет (FR-GROWTH-004 «без
// выплат») — accrueCommissionTx/clawbackCommissionTx и `attribution … converted` N6 НЕ перенесены: атрибуция N5 оплатой
// не меняется (план §6); транзакция — `transaction` N5 (quota.ts).
//
// Подлинность уведомления проверяет web ДО вызова applyVerifiedPayment и ВНЕ транзакции (security-operation-order):
// сюда приходит только перезапрошенный у ЮKassa платёж. Внутри транзакции нет сетевых вызовов.
import type { Pool, PoolClient } from 'pg';
import { CREDIT_SKUS, CREDIT_OFFER_VERSION, isCreditSku, type CreditSku, PAID_PLAN_DAYS } from '@clipmaker/shared/tariff';
import type { PaymentProviderName } from '@clipmaker/shared/enums';
import { transaction } from './quota.js';
import { fulfillCreditIntentTx } from './credits.js';
import { effectivePlanSql } from './plan.js';
import type { BillingMode } from '@clipmaker/shared/config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export interface IntentRow { sku?: string; offer_version?: string; grant_seconds?: number; period_start?: Date | null; period_end?: Date | null; id: string; price_minor: number; status: 'created' | 'succeeded' | 'canceled'; provider_payment_id: string | null }
export type CreateIntentResult = { kind: 'created' | 'existing'; intent: IntentRow } | { kind: 'conflict' } | { kind: 'account_inactive' };

// Намерение выдаётся ДО ухода к провайдеру (long-running-job): повтор с тем же ключом клиента — то же намерение.
// «Вставить, иначе прочитать» атомарно: UNIQUE (account_id, idempotency_key) + ON CONFLICT DO NOTHING (донор N4/N6).
export async function createPaymentIntent(pool: Pool, input: { accountId: string; priceMinor: number; idempotencyKey: string; sku?: CreditSku; billingMode?: BillingMode }): Promise<CreateIntentResult> {
  const offer = input.sku ? CREDIT_SKUS[input.sku] : null;
  if (input.sku && (!isCreditSku(input.sku) || input.billingMode!=='credits_v1' || input.priceMinor!==offer?.priceMinor)) return {kind:'conflict'};
  return transaction(pool,async tx=>{
    const owner=(await tx.query<{status:string}>('SELECT status FROM account WHERE id=$1 FOR SHARE',[input.accountId])).rows[0];
    if(owner?.status!=='active') return {kind:'account_inactive'} as const;
  const inserted = (await tx.query<IntentRow>(`INSERT INTO payment_intent (account_id, price_minor, idempotency_key,sku,offer_version,grant_seconds)
    SELECT id, $2, $3, $4, $5, $6 FROM account WHERE id = $1 AND status = 'active'
    AND (($4='legacy_pro990_v1' AND billing_policy='legacy_daily_v1') OR ($4<>'legacy_pro990_v1' AND billing_policy='credits_v1'))
    ON CONFLICT (account_id, idempotency_key) DO NOTHING RETURNING id, price_minor, status, provider_payment_id,sku,offer_version,grant_seconds`,
  [input.accountId, input.priceMinor, input.idempotencyKey,input.sku ?? 'legacy_pro990_v1',offer ? CREDIT_OFFER_VERSION : 'legacy_v1',offer?.seconds ?? 0])).rows[0];
  if (inserted) return { kind: 'created', intent: inserted };
  const existing = (await tx.query<IntentRow>(`SELECT id, price_minor, status, provider_payment_id,sku,offer_version,grant_seconds FROM payment_intent
    WHERE account_id = $1 AND idempotency_key = $2`, [input.accountId, input.idempotencyKey])).rows[0];
  // Нет строки: аккаунт не активен (стирается) — намерение не создаётся. Тот же ключ с другой ценой — не повтор.
  if (!existing) return { kind: 'account_inactive' };
  if (existing.price_minor !== input.priceMinor || existing.sku !== (input.sku ?? 'legacy_pro990_v1')) return { kind: 'conflict' };
  return { kind: 'existing', intent: existing };
  });
}

// false — у намерения уже ДРУГОЙ платёж (ревью N6 фичи 14, находка 2): расхождение не игнорируется молча.
export async function setIntentProviderPayment(pool: Pool, intentId: string, providerPaymentId: string): Promise<boolean> {
  const updated = await pool.query(`UPDATE payment_intent SET provider_payment_id = $2 WHERE id = $1 AND (provider_payment_id IS NULL OR provider_payment_id = $2)`,
    [intentId, providerPaymentId]);
  return updated.rowCount === 1;
}
export async function markIntentCanceled(pool: Pool, intentId: string): Promise<void> {
  await pool.query(`UPDATE payment_intent SET status = 'canceled' WHERE id = $1 AND status = 'created'`, [intentId]);
}

export interface IntentView extends IntentRow { effective_plan?: 'free'|'paid'; account_plan: string; plan_source: string; plan_paid_until: string | null }
// Чужое и несуществующее намерение — один ответ null (инвариант N5: чужой ресурс — 404).
export async function readPaymentIntent(pool: Pool, intentId: string, accountId: string): Promise<IntentView | null> {
  if (!isUuid(intentId) || !isUuid(accountId)) return null;
  const row = (await pool.query<IntentRow & { account_plan: string; plan_source: string; plan_paid_until: Date | null }>(`SELECT i.id, i.price_minor, i.status,
      i.provider_payment_id,i.sku,i.offer_version,i.grant_seconds,i.period_start,i.period_end,${effectivePlanSql('a')} AS effective_plan, a.plan AS account_plan, a.plan_source, a.plan_paid_until
    FROM payment_intent i JOIN account a ON a.id = i.account_id WHERE i.id = $1 AND i.account_id = $2`, [intentId, accountId])).rows[0];
  if (!row) return null;
  return { ...row, plan_paid_until: row.plan_paid_until?.toISOString() ?? null };
}

export interface VerifiedPayment { id: string; orderId: string | null; amountMinor: number; feeMinor: number | null; paidAt: string | null }
export type ApplyPaymentOutcome =
  | { applied: true; plan: 'paid'; paidUntil: string }
  | { applied: false; reason: 'duplicate' | 'amount_mismatch' | 'unknown_intent' | 'refunded' | 'refund_recorded' | 'account_erasing' | 'intent_already_fulfilled' | 'payment_identity_mismatch' };

// Ключ повторности (incoming-webhooks): ПОЛЕ — событие + object.id у ЮKassa; МЕСТО — payment_event; МЕХАНИЗМ — уникальный
// индекс, конфликт вставки И ЕСТЬ «уже обработано» (две одновременные доставки не проходят обе).
async function claimEvent(tx: PoolClient, provider: PaymentProviderName, eventKey: string, payloadSha256: string): Promise<boolean> {
  const claimed = await tx.query(`INSERT INTO payment_event (provider, provider_event_id, payload_sha256) VALUES ($1, $2, $3)
    ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`, [provider, eventKey, payloadSha256]);
  return claimed.rowCount === 1;
}
// Оплата и возврат ОДНОГО платежа — разные события с разными ключами и приходят в любом порядке и одновременно:
// транзакции по одному платежу сериализуются блокировкой до конца транзакции (ревью N6, находка 1).
async function lockPayment(tx: PoolClient, provider: PaymentProviderName, paymentId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`payment:${provider}:${paymentId}`]);
}

export interface PaymentEvent { provider: PaymentProviderName; eventKey: string; payloadSha256: string; payment: VerifiedPayment }

// Успешная оплата → план. Перестановочно (incoming-webhooks «перестановка»): срок — GREATEST(срок, now()) + 30 дней;
// две оплаты в любом порядке дают один итог (OWN-019 п.2: продление от большего из текущего срока и сейчас).
export function applyVerifiedPayment(pool: Pool, input: PaymentEvent): Promise<ApplyPaymentOutcome> {
  const { payment } = input;
  return transaction(pool, async (tx) => {
    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;
    await lockPayment(tx, input.provider, payment.id);
    // Возврат приехал РАНЬШЕ оплаты (перестановка): платёж уже записан refunded на разбор — план по нему не выдаётся.
    const prior = (await tx.query<{ status: string }>(`SELECT status FROM payment WHERE provider = $1 AND provider_payment_id = $2`,
      [input.provider, payment.id])).rows[0];
    if (prior?.status === 'refunded') return { applied: false, reason: 'refunded' } as const;
    // One provider payment is one financial fact, including a payload rebound to another order.
    if (prior?.status === 'succeeded') return { applied: false, reason: 'duplicate' } as const;
    const paidAt = payment.paidAt ?? new Date().toISOString();
    const record = (intentId: string | null, accountId: string | null, review: string | null) => tx.query(`INSERT INTO payment
        (intent_id, account_id, provider, provider_payment_id, amount_minor, fee_minor, needs_review, review_reason, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (provider, provider_payment_id) DO NOTHING`,
    [intentId, accountId, input.provider, payment.id, payment.amountMinor, payment.feeMinor, review !== null, review, paidAt]);
    // ПОРЯДОК БЛОКИРОВОК account → payment_intent — тот же, что у стирания аккаунта (retention.eraseAccount: account FOR
    // UPDATE → DELETE payment_intent) и у запроса удаления. Обратный порядок давал взаимоблокировку (ревью фичи 30, круг 2,
    // находка 1). Владелец намерения читается без блокировки, затем блокируется аккаунт, затем намерение перечитывается.
    const owned = isUuid(payment.orderId)
      ? (await tx.query<{ account_id: string }>('SELECT account_id FROM payment_intent WHERE id = $1', [payment.orderId])).rows[0]
      : undefined;
    // Платёж без нашего намерения: деньги реальны — записываются на разбор, план не выдаётся никому.
    if (!owned) { await record(null, null, 'unknown_intent'); return { applied: false, reason: 'unknown_intent' } as const; }
    const owner = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE', [owned.account_id])).rows[0];
    const intent = (await tx.query<{ id: string; account_id: string; price_minor: number; sku: string; grant_seconds: number; fulfilled_at: Date | null; provider_payment_id: string | null }>(`SELECT id,account_id,price_minor,sku,grant_seconds,fulfilled_at,provider_payment_id FROM payment_intent
      WHERE id = $1 FOR UPDATE`, [payment.orderId])).rows[0];
    // Намерение исчезло, пока ждали аккаунт: его стёрло удаление аккаунта — деньги на разбор, план не выдаётся.
    if (!intent) { await record(null, null, 'account_erasing'); return { applied: false, reason: 'account_erasing' } as const; }
    // Сумма ≠ цене намерения: платёж принят, план НЕ выдан — разбирает оператор (OWN-019 п.3).
    if (payment.amountMinor !== intent.price_minor) { await record(payment.orderId, intent.account_id, 'amount_mismatch'); return { applied: false, reason: 'amount_mismatch' } as const; }
    // Аккаунт уже стирается (FR-AUTH-003, AC-9): деньги реальны — платёж записан на разбор, план НЕ выдаётся. Статус
    // прочитан под блокировкой строки аккаунта — запрос удаления (UPDATE account … erasing) и оплата сериализуются.
    if (owner?.status !== 'active') { await record(payment.orderId, intent.account_id, 'account_erasing'); return { applied: false, reason: 'account_erasing' } as const; }
    if (intent.fulfilled_at) {
      await record(payment.orderId,intent.account_id,'intent_already_fulfilled');
      return {applied:false,reason:'intent_already_fulfilled'} as const;
    }
    if (intent.provider_payment_id && intent.provider_payment_id!==payment.id) {
      await record(payment.orderId,intent.account_id,'payment_identity_mismatch');
      return {applied:false,reason:'payment_identity_mismatch'} as const;
    }
    await tx.query('UPDATE payment_intent SET provider_payment_id=COALESCE(provider_payment_id,$2) WHERE id=$1',[payment.orderId,payment.id]);
    await record(payment.orderId, intent.account_id, null);
    if (isCreditSku(intent.sku)) {
      const period=await fulfillCreditIntentTx(tx,{...intent,sku:intent.sku},new Date(paidAt));
      return {applied:true,plan:'paid',paidUntil:period.end.toISOString()} as const;
    }
    // «Успех» на экране возврата — только когда план ВЫДАН (несовпадение суммы оставляет намерение created).
    await tx.query(`UPDATE payment_intent SET status = 'succeeded',fulfilled_at=now() WHERE id = $1`, [payment.orderId]);
    const paidUntil = await grantPaidPlan(tx, intent.account_id);
    return { applied: true, plan: 'paid', paidUntil } as const;
  });
}

// План оператора (paid, operator) — бессрочный и сильнее оплаты: источник не меняется, срок копится на будущее.
// Платный план до миграции 021 (paid, none) — так же. Иначе — оплаченный план со сроком от большего из (срок, сейчас).
async function grantPaidPlan(tx: PoolClient, accountId: string): Promise<string> {
  const result = (await tx.query<{ plan_paid_until: Date }>(`UPDATE account SET plan = 'paid',
      plan_source = CASE WHEN plan = 'paid' AND plan_source IN ('operator', 'none') THEN plan_source ELSE 'payment' END,
      plan_paid_until = GREATEST(COALESCE(plan_paid_until, now()), now()) + make_interval(days => $2), updated_at = now()
    WHERE id = $1 RETURNING plan_paid_until`, [accountId, PAID_PLAN_DAYS])).rows[0];
  if (!result) throw new Error('Аккаунт намерения не найден: оплата не применяется, транзакция откатывается');
  return result.plan_paid_until.toISOString();
}

// Возврат (refund.succeeded): принимается и помечается на разбор; план снимает оператор (OWN-019 п.3).
// Перестановочно: если строки платежа ещё нет (возврат раньше оплаты), она создаётся СРАЗУ refunded из перезапрошенного
// у ЮKassa платежа — последующая оплата увидит возврат и план не выдаст.
export function recordVerifiedRefund(pool: Pool, input: PaymentEvent): Promise<ApplyPaymentOutcome> {
  const { payment } = input;
  return transaction(pool, async (tx) => {
    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;
    await lockPayment(tx, input.provider, payment.id);
    const owned = isUuid(payment.orderId)
      ? (await tx.query<{ account_id: string }>('SELECT account_id FROM payment_intent WHERE id = $1', [payment.orderId])).rows[0]
      : undefined;
    // Тот же порядок account → payment_intent, что у оплаты и стирания (ревью, круг 2, находка 1): иначе FK-проверка
    // вставки платежа держит намерение и ждёт аккаунт, а стирание — наоборот. Намерение перечитывается после блокировки.
    if (owned) await tx.query('SELECT 1 FROM account WHERE id = $1 FOR NO KEY UPDATE', [owned.account_id]);
    const intent = owned
      ? (await tx.query<{ account_id: string }>('SELECT account_id FROM payment_intent WHERE id = $1 FOR KEY SHARE', [payment.orderId])).rows[0]
      : undefined;
    await tx.query(`INSERT INTO payment (intent_id, account_id, provider, provider_payment_id, amount_minor, fee_minor, status, needs_review, review_reason, paid_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'refunded', true, 'refund', $7)
      ON CONFLICT (provider, provider_payment_id) DO UPDATE SET status = 'refunded', needs_review = true, review_reason = 'refund'`,
    [intent ? payment.orderId : null, intent?.account_id ?? null, input.provider, payment.id, payment.amountMinor, payment.feeMinor,
      payment.paidAt ?? new Date().toISOString()]);
    return { applied: false, reason: 'refund_recorded' } as const;
  });
}

// Сторож: истёкший ОПЛАЧЕННЫЙ план → free (метка возвращается на НОВЫХ клипах). План оператора и назначенный до 021 не
// истекают. plan_paid_until СОХРАНЯЕТСЯ: от него считается срок хранения клипов оплаченного периода (AC-12).
export async function expirePaidPlans(pool: Pool, batch: number): Promise<number> {
  const expired = await pool.query(`UPDATE account SET plan = 'free', plan_source = 'none', updated_at = now() WHERE id IN (
      SELECT id FROM account WHERE plan_source = 'payment' AND plan_paid_until <= now() AND NOT EXISTS (SELECT 1 FROM credit_grant cg WHERE cg.account_id=account.id AND cg.source='payment' AND cg.entitlement_start<=now() AND cg.entitlement_end>now()) ORDER BY plan_paid_until LIMIT $1 FOR NO KEY UPDATE SKIP LOCKED)
    AND plan_source = 'payment' AND plan_paid_until <= now()`, [batch]);
  return expired.rowCount ?? 0;
}

export interface AccountBilling { owner_unlimited?: boolean; billing_policy?: string; effective_plan?: 'free'|'paid'; plan: string; plan_source: string; plan_paid_until: string | null }
export async function readAccountBilling(pool: Pool, accountId: string): Promise<AccountBilling | null> {
  if (!isUuid(accountId)) return null;
  const row = (await pool.query<{ owner_unlimited: boolean; billing_policy: string; effective_plan: 'free'|'paid'; plan: string; plan_source: string; plan_paid_until: Date | null }>(`SELECT a.owner_unlimited,a.plan,a.plan_source,a.plan_paid_until,a.billing_policy,${effectivePlanSql('a')} AS effective_plan
    FROM account a WHERE id = $1 AND status = 'active'`, [accountId])).rows[0];
  return row ? { ...row,plan: row.plan, plan_source: row.plan_source, plan_paid_until: row.plan_paid_until?.toISOString() ?? null } : null;
}
