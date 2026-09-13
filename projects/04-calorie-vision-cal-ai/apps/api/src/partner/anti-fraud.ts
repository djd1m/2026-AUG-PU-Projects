// AntiFraudOnCode (FR-partner-codes-and-cabinet-3, AC-partner-codes-and-cabinet-9/10,
// NFR-partner-codes-and-cabinet-2).
//
// Выполняется ВНУТРИ транзакции `ApplyPartnerCode`, ПОД тем же codeLock, и ТОЛЬКО если код
// уже прошёл проверку `blocked` (шаг 4 вызывающего) — заблокированный код НЕ доходит до
// подсчёта: это и есть AC-10, окно НЕ пересчитывается повторно на уже заблокированном коде.
//
// Под codeLock шаг подсчёта выполняется СЕРИАЛИЗОВАННО для одного кода: при N одновременных
// применениях каждый вызов ждёт своей очереди на лок, поэтому `count` каждого следующего
// вызова УЖЕ учитывает применения предыдущих в очереди — блокировка срабатывает РОВНО один
// раз, на первом вызове, чей `count` превысил порог (AC-9б).

import type { DbClient } from '@n4/db';
import type { Logger } from '@n4/shared';

/** Порог — 51-е применение блокирует код (`> 50`). Окно — 10 минут (канон §7, `security.md`). */
export const ANTI_FRAUD_THRESHOLD = 50;

const COUNT_RECENT_APPLICATIONS = `
  SELECT count(*)::int AS n
  FROM growth_event ge
  JOIN device_session ds ON ds.id = ge.device_session_id
  WHERE ge.type = 'code_applied'
    AND ge.partner_code_id = $1
    AND ds.ip_prefix = $2
    AND ge.created_at > now() - interval '10 minutes'
`;

const BLOCK_CODE = `
  UPDATE partner_code
  SET status = 'blocked', blocked_reason = 'antifraud_ip_burst', blocked_at = now()
  WHERE id = $1
`;

export type AntiFraudDecision = { readonly outcome: 'allow' } | { readonly outcome: 'block' };

export interface AntiFraudInput {
  readonly partnerCodeId: string;
  readonly ipPrefix: string;
  readonly requestId: string;
}

/**
 * Тип функции — а не только реализация — чтобы AC-10 мог проверить ЧИСЛО ОБРАЩЕНИЙ к
 * подсчёту через тестовый шпион, не заглядывая внутрь SQL.
 */
export type AntiFraudCheck = (client: DbClient, input: AntiFraudInput) => Promise<AntiFraudDecision>;

export function createAntiFraudCheck(logger: Logger): AntiFraudCheck {
  return async (client, input) => {
    const counted = await client.query<{ n: number }>(COUNT_RECENT_APPLICATIONS, [input.partnerCodeId, input.ipPrefix]);
    const count = counted.rows[0]?.n ?? 0;
    if (count <= ANTI_FRAUD_THRESHOLD) return { outcome: 'allow' };

    await client.query(BLOCK_CODE, [input.partnerCodeId]);
    // NFR-partner-codes-and-cabinet-2: ip_prefix, НЕ полный адрес.
    logger.warn('antifraud_ip_burst', { request_id: input.requestId, partner_code_id: input.partnerCodeId, ip_prefix: input.ipPrefix });
    return { outcome: 'block' };
  };
}
