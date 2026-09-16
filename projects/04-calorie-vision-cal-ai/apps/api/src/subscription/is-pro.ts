// Что даёт оплата (OWN-012, путь плательщика). До этого файла подписка после оплаты меняла
// ТОЛЬКО строку `subscription`: дневной потолок сканов оставался бесплатным (20), бейдж на
// карточке «поделиться» оставался, `tier` аккаунта никогда не становился `paid`. Человек
// платил 1000 ₽ и не получал ничего, кроме надписи «active». Поймано первым живым платежом
// 16.09.2026.
//
// Источник истины — строка `subscription`, а не поле `account.tier`: поле никем не
// поддерживается, а строка подписки меняется вебхуком, продлением и истечением в одном месте.
// «Оплачен» = есть активная подписка, чей период ещё не кончился. Всё остальное — бесплатный
// тариф (fail-closed: неизвестное состояние не есть «оплачено»).

import type { DbClient, DbPool } from '@n4/db';
import type { QuotaLimits } from '@n4/shared';

const ACTIVE_SUBSCRIPTION_SQL = `
  SELECT 1 FROM subscription
  WHERE account_id = $1 AND status = 'active' AND current_period_end > now()
  LIMIT 1
`;

export async function hasActiveSubscription(executor: DbPool | DbClient, accountId: string | null): Promise<boolean> {
  if (accountId === null) return false;
  const result = await executor.query(ACTIVE_SUBSCRIPTION_SQL, [accountId]);
  return result.rows.length > 0;
}

/** Тариф для бейджа карточки и `/auth/me`: РОВНО `'paid'` при активной подписке, иначе `'free'`. */
export async function resolveTier(executor: DbPool | DbClient, accountId: string | null): Promise<'paid' | 'free'> {
  return (await hasActiveSubscription(executor, accountId)) ? 'paid' : 'free';
}

/**
 * Пределы квоты с учётом тарифа: у оплаченного аккаунта дневной потолок на пользователя —
 * `scanLimitPro`; глобальный и эскалационный потолки от тарифа не зависят (они защищают
 * бюджет продукта, а не делят его между людьми).
 */
export function effectiveQuotaLimits(base: QuotaLimits, scanLimitPro: number, pro: boolean): QuotaLimits {
  return pro ? { ...base, scanLimitUser: scanLimitPro } : base;
}
