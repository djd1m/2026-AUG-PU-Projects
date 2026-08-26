// FR-GROWTH-004 — партнёрские коды, anti-fraud и когортный дашборд.
// Источник: Pseudocode §8, §10.

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';

export const FRAUD_SCOPE = 'signup_via_partner_code';
export const FRAUD_WINDOW = { seconds: 600 }; // 10 минут — Pseudocode §8
export const FRAUD_THRESHOLD = 50; // регистраций с одного IP

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // без 0/O/1/I — код диктуют голосом

/**
 * Pseudocode §10 generateCode: человекочитаемая часть + случайный суффикс.
 * Имя партнёра берётся в код, чтобы он был узнаваем в письме и в разговоре,
 * но само по себе оно не уникально — уникальность даёт суффикс.
 */
export function generateCode(partnerName: string): string {
  const base = partnerName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  const suffix = Array.from(randomBytes(4))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
  return base ? `${base}-${suffix}` : suffix;
}

/** Pseudocode §10 issuePartnerCode. Административное действие — партнёрского self-signup в MVP нет. */
export async function issuePartnerCode(
  client: PoolClient,
  partnerName: string,
  options: { actorId: string; ownerAccountId?: string | null; commissionRate?: number | null } = {
    actorId: 'admin',
  },
): Promise<{ id: string; code: string }> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = generateCode(partnerName);
    const { rows } = await client.query<{ id: string }>(
      `insert into partner_codes (code, partner_name, status, commission_rate, owner_account_id)
       values ($1, $2, 'active', $3, $4)
       on conflict (code) do nothing
       returning id`,
      [code, partnerName, options.commissionRate ?? null, options.ownerAccountId ?? null],
    );
    if (rows[0]) {
      await client.query(
        `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
         values (null, 'partner_code', $1, $2, 'partner_code_issued', $3)`,
        [rows[0].id, options.actorId, partnerName],
      );
      return { id: rows[0].id, code };
    }
    // Коллизия суффикса — пробуем ещё. ON CONFLICT DO NOTHING вместо «проверить, потом
    // вставить»: последнее оставляет окно между проверкой и записью.
    attempt += 1;
    if (attempt > 10) throw new Error('не удалось подобрать уникальный код партнёра за 10 попыток');
  }
}

/**
 * Pseudocode §8 revokePartnerCode. Отзыв действует только на НОВЫЕ атрибуции —
 * история immutable, уже начисленное не откатывается.
 */
export async function revokePartnerCode(client: PoolClient, code: string, actorId: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    "update partner_codes set status = 'revoked' where code = $1 and status = 'active' returning id",
    [code],
  );
  if (!rows[0]) return false;
  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
     values (null, 'partner_code', $1, $2, 'partner_code_revoked', 'revoked_by_admin')`,
    [rows[0].id, actorId],
  );
  return true;
}

/**
 * Pseudocode §8 onSignupViaPartnerCode — детект МАССОВОЙ накрутки с одного IP.
 *
 * Отличие от self-referral (§7.2) принципиальное: там один недобросовестный партнёр,
 * здесь — поток фиктивных регистраций. Поэтому и мера другая: регистрация НЕ блокируется
 * (среди 50 могут быть живые люди за одним NAT), блокируется только АТРИБУЦИЯ.
 */
export async function onSignupViaPartnerCode(
  client: PoolClient,
  ip: string,
  newAccountId: string,
  code: string,
): Promise<{ flagged: boolean; count: number }> {
  await rateLimit.record(FRAUD_SCOPE, ip, client);
  const count = await rateLimit.count(FRAUD_SCOPE, ip, FRAUD_WINDOW, client);
  if (count < FRAUD_THRESHOLD) return { flagged: false, count };

  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
     values (null, 'account', $1, $2, 'suspected_fraud_flagged', $3)`,
    // IP хешируется: audit_log живёт долго, а сырой адрес — персональные данные без нужды.
    [newAccountId, newAccountId, `suspected_fraud code=${code} ip_hash=${hashIp(ip)}`],
  );

  // status='blocked' — getPendingAttribution (§7.2) её больше не найдёт, начисления не будет.
  await client.query(
    "update referral_attributions set status = 'blocked', reason = 'suspected_fraud' where account_id = $1 and status = 'pending'",
    [newAccountId],
  );

  return { flagged: true, count };
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export interface CohortDashboard {
  partner_name: string;
  code_status: string;
  cohort: {
    signups: number;
    conversions: number;
    /** null ≠ 0: «нет данных» и «0%» — разные ответы (Pseudocode §10). */
    conversion_rate: number | null;
    total_commission: number;
  };
}

/** Pseudocode §10 getPartnerCohortDashboard. */
export async function getPartnerCohortDashboard(
  client: PoolClient,
  code: string,
): Promise<CohortDashboard | null> {
  const { rows } = await client.query<{ id: string; partner_name: string; status: string }>(
    'select id, partner_name, status from partner_codes where code = $1',
    [code],
  );
  const partner = rows[0];
  if (!partner) return null;

  const stats = await client.query<{ signups: string; conversions: string }>(
    `select count(*)::text as signups,
            count(*) filter (where status = 'converted')::text as conversions
       from referral_attributions where partner_code_id = $1`,
    [partner.id],
  );
  const commission = await client.query<{ total: string }>(
    `select coalesce(sum(c.amount), 0)::text as total
       from commissions c
       join referral_attributions ra on ra.id = c.referral_attribution_id
      where ra.partner_code_id = $1`,
    [partner.id],
  );

  const signups = Number(stats.rows[0]?.signups ?? 0);
  const conversions = Number(stats.rows[0]?.conversions ?? 0);

  return {
    partner_name: partner.partner_name,
    code_status: partner.status,
    cohort: {
      signups,
      conversions,
      conversion_rate: signups > 0 ? conversions / signups : null,
      total_commission: Number(commission.rows[0]?.total ?? 0),
    },
  };
}
