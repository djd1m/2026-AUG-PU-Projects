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

/**
 * Порог — РОВНО 50 засчитанных применений допускается; 51-е блокирует код и само
 * НЕ засчитывается (AC-partner-codes-and-cabinet-9: «Given код с 50 засчитанными …
 * When выполняется 51-е применение … Then код переходит в blocked, 51-я попытка получает
 * rejected»). Сравнение — с EXISTING count (до вставки текущей попытки, шаг 2
 * `AntiFraudOnCode`): `existing >= 50` блокирует, поэтому счётчик никогда не превышает 50.
 * Окно — 10 минут (канон §7, `security.md`).
 */
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
  /**
   * ОБЯЗАН быть значением, ХРАНИМЫМ на `device_session.ip_prefix` текущей сессии, а НЕ
   * свежепосчитанным из заголовка ТЕКУЩЕГО HTTP-запроса (`RV-partner-codes-and-cabinet-03`).
   * Историю (`COUNT_RECENT_APPLICATIONS` ниже) считает JOIN на ЭТУ ЖЕ колонку для всех
   * ПРОШЛЫХ сессий — ключ проверки и ключ хранения ОБЯЗАНЫ совпадать по источнику, иначе
   * смена сети между созданием сессии вызывающего и вызовом отвязывает текущую попытку от
   * собственной истории и порог обходится нулевым счётчиком. См. `routes/codes.ts`,
   * `requireSession`.
   */
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
    if (count < ANTI_FRAUD_THRESHOLD) return { outcome: 'allow' };

    await client.query(BLOCK_CODE, [input.partnerCodeId]);
    // NFR-partner-codes-and-cabinet-2: ip_prefix, НЕ полный адрес.
    logger.warn('antifraud_ip_burst', { request_id: input.requestId, partner_code_id: input.partnerCodeId, ip_prefix: input.ipPrefix });
    return { outcome: 'block' };
  };
}
