// FR-GROWTH-002 — партнёрская атрибуция. Источник: Pseudocode §7.1/§7.2, ADR-003.
//
// Смысл фичи: понять, кто привёл платящего клиента, и начислить партнёру. Ошибка здесь
// стоит деньгами в обе стороны — недоначислили партнёру (он уйдёт) или начислили за
// самого себя (мы платим за ничего).

import type { PoolClient } from 'pg';

export const REF_COOKIE = 'pw_ref';

export type AttributionSource = 'promo_code' | 'cookie';

export interface Attribution {
  source: AttributionSource;
  partnerCodeId: string;
}

/**
 * Pseudocode §7.1, ADR-003: промокод ПРИОРИТЕТНЕЕ cookie.
 *
 * Правило зафиксировано порядком проверок, а не сравнением «что новее». Обоснование
 * из ADR-003: расхождение (cookie от партнёра A, промокод партнёра B) — это явное
 * намерение пользователя в пользу B, и оно должно побеждать пассивную метку.
 *
 * Cookie может отсутствовать вовсе — Safari ITP укорачивает её жизнь примерно до 7 дней;
 * это нормальный путь, а не сбой.
 */
export async function resolveAttribution(
  client: PoolClient,
  input: { promoCode?: string | null; cookieRef?: string | null },
): Promise<Attribution | null> {
  const promo = input.promoCode?.trim();
  if (promo) {
    const partner = await findActivePartner(client, promo);
    // Невалидный промокод НЕ откатывается на cookie: пользователь ввёл код явно,
    // и молча засчитать другого партнёра значило бы подменить его намерение.
    return partner ? { source: 'promo_code', partnerCodeId: partner.id } : null;
  }

  const cookie = input.cookieRef?.trim();
  if (cookie) {
    const partner = await findActivePartner(client, cookie);
    if (partner) return { source: 'cookie', partnerCodeId: partner.id };
  }
  return null;
}

async function findActivePartner(client: PoolClient, code: string): Promise<{ id: string } | null> {
  const { rows } = await client.query<{ id: string }>(
    // Отозванный код не атрибуцирует ничего — иначе отзыв не имел бы силы.
    "select id from partner_codes where code = $1 and status = 'active'",
    [code],
  );
  return rows[0] ?? null;
}

/**
 * Pseudocode §7.2 onSignup: атрибуция создаётся при РЕГИСТРАЦИИ со статусом pending.
 * Начисления на этом шаге нет намеренно — платит не регистрация, а оплата.
 */
export async function createPendingAttribution(
  client: PoolClient,
  accountId: string,
  attribution: Attribution,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into referral_attributions (account_id, partner_code_id, source, status)
     values ($1, $2, $3, 'pending') returning id`,
    [accountId, attribution.partnerCodeId, attribution.source],
  );
  return rows[0]!.id;
}

export type ConversionResult =
  | { outcome: 'converted'; attributionId: string; commissionId: string | null; rateMissing: boolean }
  | { outcome: 'self_referral'; attributionId: string }
  | { outcome: 'no_attribution' };

/**
 * Pseudocode §7.2, вторая половина: оплата пришла — превращаем pending в начисление.
 *
 * Вызывается ИЗ обработчика вебхука, уже после проверки подписи и захвата event_id,
 * то есть ровно один раз на событие.
 */
export async function convertAttributionOnPayment(
  client: PoolClient,
  accountId: string,
  paymentEventId: string,
  amount: number,
): Promise<ConversionResult> {
  const { rows } = await client.query<{
    id: string;
    partner_code_id: string;
    owner_account_id: string | null;
    owner_email: string | null;
    payer_email: string;
    commission_rate: string | null;
  }>(
    `select ra.id, ra.partner_code_id, pc.owner_account_id, pc.commission_rate,
            owner.email as owner_email, payer.email as payer_email
       from referral_attributions ra
       join partner_codes pc on pc.id = ra.partner_code_id
       join accounts payer on payer.id = ra.account_id
       left join accounts owner on owner.id = pc.owner_account_id
      where ra.account_id = $1 and ra.status = 'pending'
      order by ra.created_at asc
      limit 1`,
    [accountId],
  );
  const row = rows[0];
  if (!row) return { outcome: 'no_attribution' };

  // Self-referral: партнёр оплачивает по собственному коду. Сверяем и по аккаунту,
  // и по почте — первое надёжнее, второе ловит случай, когда человек завёл второй
  // аккаунт на тот же ящик. owner_account_id = NULL (внешняя площадка) → проверять нечего.
  const isSelf =
    row.owner_account_id === accountId ||
    (row.owner_email !== null && row.owner_email.toLowerCase() === row.payer_email.toLowerCase());

  if (isSelf) {
    await client.query(
      "update referral_attributions set status = 'rejected', reason = 'self_referral' where id = $1",
      [row.id],
    );
    await client.query(
      `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
       values (null, 'referral_attribution', $1, $2, 'self_referral_blocked', 'self_referral')`,
      [row.id, accountId],
    );
    return { outcome: 'self_referral', attributionId: row.id };
  }

  await client.query("update referral_attributions set status = 'converted' where id = $1", [row.id]);

  // [GAP из 004_growth.sql: ставка комиссии по умолчанию не зафиксирована ни одним
  //  документом — PRD §8 «Открытые вопросы владельца продукта».] Выдумывать её здесь
  //  нельзя: это не техническое решение, а коммерческое. Без ставки атрибуция считается
  //  состоявшейся (партнёр своё сделал), но строка начисления НЕ создаётся — и это
  //  видно в возвращаемом rateMissing, а не спрятано.
  if (row.commission_rate === null) {
    return { outcome: 'converted', attributionId: row.id, commissionId: null, rateMissing: true };
  }

  const commissionAmount = Number((amount * Number(row.commission_rate)).toFixed(2));
  const inserted = await client.query<{ id: string }>(
    // ADR-006: unique(payment_event_id) — ВТОРАЯ, независимая от webhook_events гарантия
    // «ровно один раз». Повторный вызов не создаст второе начисление даже если первая
    // защита однажды даст сбой.
    `insert into commissions (referral_attribution_id, payment_event_id, amount)
     values ($1, $2, $3) on conflict (payment_event_id) do nothing returning id`,
    [row.id, paymentEventId, commissionAmount],
  );

  return {
    outcome: 'converted',
    attributionId: row.id,
    commissionId: inserted.rows[0]?.id ?? null,
    rateMissing: false,
  };
}
