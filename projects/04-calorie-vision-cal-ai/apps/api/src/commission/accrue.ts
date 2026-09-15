// Начисление и обратное списание (`02_pseudocode.md` шаги 3-4, ADR-011…013).
//
// Работает ВНУТРИ транзакции вызывающего: платёж и обязательство перед партнёром ложатся
// одним коммитом. Частично применённое событие показало бы выручку без обязательства либо
// обязательство без выручки, и расхождение обнаружилось бы при сверке, а не при записи.

import type { DbClient } from '@n4/db';
import { accrualAmountMinor, maturesAt, DEFAULT_COMMISSION_RATE_BP } from '@n4/shared';

export interface AccrueInput {
  readonly paymentId: string;
  readonly accountId: string;
  readonly subscriptionId: string;
  readonly netMinor: number;
  readonly paidAt: Date;
  readonly holdDays: number;
}

export type AccrueResult =
  | { readonly kind: 'accrued'; readonly partnerId: string; readonly amountMinor: number }
  | { readonly kind: 'skipped'; readonly reason: 'no_attribution' | 'self_referral' | 'non_positive_net' | 'already_accrued' };

interface PartnerRow {
  readonly partner_id: string;
  readonly partner_account_id: string | null;
  readonly commission_rate_bp: number;
}

export async function accrueCommission(client: DbClient, input: AccrueInput): Promise<AccrueResult> {
  if (input.netMinor <= 0) return { kind: 'skipped', reason: 'non_positive_net' };

  // Шаг 3: партнёр фиксируется ПЕРВОЙ оплатой и дальше не меняется (ADR-012). Сначала
  // смотрим на уже зафиксированного — иначе поздняя смена кода крала бы доход у того, кто
  // клиента привёл, и появлялась бы атака «перебей атрибуцию перед продлением».
  const fixed = await client.query<PartnerRow>(
    `SELECT p.id AS partner_id, p.account_id AS partner_account_id, p.commission_rate_bp
     FROM subscription s JOIN partner p ON p.id = s.commission_partner_id
     WHERE s.id = $1`,
    [input.subscriptionId],
  );
  let partner = fixed.rows[0];

  if (partner === undefined) {
    const attributed = await client.query<PartnerRow>(
      `SELECT p.id AS partner_id, p.account_id AS partner_account_id, p.commission_rate_bp
       FROM attribution a
       JOIN partner_code pc ON pc.id = a.partner_code_id
       JOIN partner p ON p.id = pc.partner_id
       WHERE a.device_session_id IN (SELECT id FROM device_session WHERE account_id = $1)
         AND a.status = 'activated'
       ORDER BY a.created_at ASC LIMIT 1`,
      [input.accountId],
    );
    partner = attributed.rows[0];
    if (partner === undefined) return { kind: 'skipped', reason: 'no_attribution' };
    await client.query(`UPDATE subscription SET commission_partner_id = $2 WHERE id = $1 AND commission_partner_id IS NULL`, [input.subscriptionId, partner.partner_id]);
  }

  // Самореферал проверяется ПОВТОРНО здесь: при атрибуции он уже отбивался, но тогда за
  // него ничего не платили. Деньги делают попытку осмысленной.
  if (partner.partner_account_id !== null && partner.partner_account_id === input.accountId) {
    return { kind: 'skipped', reason: 'self_referral' };
  }

  const rateBp = Number.isInteger(partner.commission_rate_bp) ? partner.commission_rate_bp : DEFAULT_COMMISSION_RATE_BP;
  const amountMinor = accrualAmountMinor(input.netMinor, rateBp);
  if (amountMinor <= 0) return { kind: 'skipped', reason: 'non_positive_net' };

  // Двойное начисление на один платёж невозможно на уровне БАЗЫ (частичный уникальный
  // индекс), а не только на уровне кода: одновременные доставки одного события не увидят
  // друг друга в коде, но увидят в индексе.
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO commission_entry (partner_id, payment_id, kind, amount_minor, available_at)
     VALUES ($1, $2, 'accrual', $3, $4)
     ON CONFLICT DO NOTHING RETURNING id`,
    [partner.partner_id, input.paymentId, amountMinor, maturesAt(input.paidAt, input.holdDays)],
  );
  if (inserted.rows[0] === undefined) return { kind: 'skipped', reason: 'already_accrued' };
  return { kind: 'accrued', partnerId: partner.partner_id, amountMinor };
}

export type ClawbackResult =
  | { readonly kind: 'clawed_back'; readonly partnerId: string; readonly amountMinor: number }
  | { readonly kind: 'skipped'; readonly reason: 'no_accrual' | 'already_clawed_back' };

/**
 * Возврат и чарджбэк (ADR-013): КОМПЕНСИРУЮЩАЯ запись, а не правка начисления. Сумма берётся
 * из самого начисления, а не пересчитывается от возвращённого: частичный возврат при
 * пересчёте мог бы дать списание больше начисленного.
 */
export async function clawbackCommission(client: DbClient, paymentId: string): Promise<ClawbackResult> {
  const accrual = await client.query<{ partner_id: string; amount_minor: number }>(
    `SELECT partner_id, amount_minor FROM commission_entry WHERE payment_id = $1 AND kind = 'accrual'`,
    [paymentId],
  );
  const row = accrual.rows[0];
  if (row === undefined) return { kind: 'skipped', reason: 'no_accrual' };

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO commission_entry (partner_id, payment_id, kind, amount_minor, available_at)
     VALUES ($1, $2, 'clawback', $3, now())
     ON CONFLICT DO NOTHING RETURNING id`,
    [row.partner_id, paymentId, -row.amount_minor],
  );
  if (inserted.rows[0] === undefined) return { kind: 'skipped', reason: 'already_clawed_back' };
  return { kind: 'clawed_back', partnerId: row.partner_id, amountMinor: -row.amount_minor };
}
