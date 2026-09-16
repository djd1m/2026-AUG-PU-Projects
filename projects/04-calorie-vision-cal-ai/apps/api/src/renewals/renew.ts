// Продление подписки автоплатежом (`02_pseudocode.md` шаг 5, FR-SUB-4).
//
// Приём тот же, что у распознавания (ADR-003): АРЕНДА строки в базе, а не очередь в памяти
// процесса. Причина та же — процесс перезапускается, а строка переживает перезапуск; и два
// экземпляра `api` не должны списать деньги дважды за один период.
//
// Результат автоплатежа приходит ВЕБХУКОМ, а не ответом на этот вызов: ответ может
// оборваться, а вебхук провайдер повторит. Здесь только ИНИЦИАЦИЯ.

import { withTransaction, type DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';
import { PaymentProviderUnavailable, type PaymentProvider } from '../payments/provider.js';

/** Больше трёх попыток продления не бывает: четвёртая означала бы вечное списание. */
export const MAX_RENEWAL_ATTEMPTS = 3;

export interface RenewalDeps {
  readonly pool: DbPool;
  readonly payments: PaymentProvider;
  readonly priceMinor: number;
  readonly appOrigin: string;
  readonly leaseSeconds: number;
  readonly logger: Logger;
}

interface LeasedSubscription {
  readonly id: string;
  readonly account_id: string;
  readonly fence: number;
  readonly failed_renewals: number;
}

const SELECT_DUE = `
  SELECT id FROM subscription
  WHERE status IN ('active', 'past_due')
    AND current_period_end <= now()
    AND (leased_until IS NULL OR leased_until < now())
    AND failed_renewals < $1
  ORDER BY current_period_end
  FOR UPDATE SKIP LOCKED
  LIMIT 1
`;

const TAKE_LEASE = `
  UPDATE subscription
  SET leased_until = now() + ($2 || ' seconds')::interval,
      lease_owner  = $3,
      lease_fence  = lease_fence + 1
  WHERE id = $1
  RETURNING id, account_id, lease_fence AS fence, failed_renewals
`;

/** Берёт аренду и ЗАКРЫВАЕТ транзакцию: соединение пула не удерживается во время оплаты. */
export async function leaseDueSubscription(deps: RenewalDeps, ownerId: string): Promise<LeasedSubscription | undefined> {
  return withTransaction(deps.pool, async (client) => {
    const candidate = await client.query<{ id: string }>(SELECT_DUE, [MAX_RENEWAL_ATTEMPTS]);
    const row = candidate.rows[0];
    if (row === undefined) return undefined;
    const leased = await client.query<LeasedSubscription>(TAKE_LEASE, [row.id, deps.leaseSeconds, ownerId]);
    return leased.rows[0];
  });
}

export type RenewalOutcome =
  | { readonly kind: 'initiated'; readonly intentId: string }
  | { readonly kind: 'provider_unavailable' }
  | { readonly kind: 'rejected'; readonly failedRenewals: number; readonly expired: boolean };

/**
 * Инициирует автоплатёж. Идемпотентный ключ — `subscription_id:номер периода`: повтор
 * воркера (перезапуск, вторая реплика, истёкшая аренда) попадает в ТОТ ЖЕ платёж у
 * провайдера, а не заводит второй. Номер периода берётся из `lease_fence`, который
 * монотонно растёт и не повторяется.
 */
export async function initiateRenewal(deps: RenewalDeps, subscription: LeasedSubscription): Promise<RenewalOutcome> {
  const intent = await withTransaction(deps.pool, async (client) => {
    const key = `renewal:${subscription.id}:${subscription.fence}`;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payment_intent (account_id, idempotency_key, price_minor)
       VALUES ($1, $2, $3) ON CONFLICT (account_id, idempotency_key) DO NOTHING RETURNING id`,
      [subscription.account_id, key, deps.priceMinor],
    );
    if (inserted.rows[0] !== undefined) return inserted.rows[0].id;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM payment_intent WHERE account_id = $1 AND idempotency_key = $2`,
      [subscription.account_id, key],
    );
    return existing.rows[0]?.id;
  });
  if (intent === undefined) return { kind: 'provider_unavailable' };

  try {
    await deps.payments.createPayment({
      orderId: intent,
      amountMinor: deps.priceMinor,
      returnUrl: `${deps.appOrigin}/pro/return?intent=${intent}`,
      description: 'Продление подписки «Тарелка» Pro',
    });
    // Успех ПОДТВЕРЖДАЕТСЯ вебхуком, а не этим ответом: здесь только «платёж запрошен».
    return { kind: 'initiated', intentId: intent };
  } catch (error) {
    if (error instanceof PaymentProviderUnavailable) {
      // Недоступность провайдера — НЕ вина подписки: счётчик неудач не растёт, иначе
      // трёхчасовой сбой платёжной системы закрыл бы все подписки разом.
      deps.logger.warn('renewal_provider_unavailable', { subscriptionId: subscription.id, reason: error.reason });
      await releaseLease(deps, subscription.id);
      return { kind: 'provider_unavailable' };
    }
    // Отказ платежа (нет средств, карта истекла) — вина подписки, счётчик растёт.
    const failed = subscription.failed_renewals + 1;
    const expired = failed >= MAX_RENEWAL_ATTEMPTS;
    await deps.pool.query(
      `UPDATE subscription
       SET failed_renewals = $2, status = CASE WHEN $3 THEN 'expired'::subscription_status ELSE 'past_due'::subscription_status END,
           leased_until = NULL, lease_owner = NULL
       WHERE id = $1 AND lease_fence = $4`,
      [subscription.id, failed, expired, subscription.fence],
    );
    deps.logger.warn('renewal_rejected', { subscriptionId: subscription.id, failedRenewals: failed, expired });
    return { kind: 'rejected', failedRenewals: failed, expired };
  }
}

/** Снимает аренду ТОЛЬКО если она всё ещё наша: устаревшая аренда обязана затронуть НОЛЬ строк. */
export async function releaseLease(deps: RenewalDeps, subscriptionId: string): Promise<void> {
  await deps.pool.query(`UPDATE subscription SET leased_until = NULL, lease_owner = NULL WHERE id = $1`, [subscriptionId]);
}
