// ApplyPartnerCode (FR-partner-codes-and-cabinet-2/4/5/6, AC-partner-codes-and-cabinet-2..8,
// NFR-partner-codes-and-cabinet-1, ADR-008).
//
// Блокировки: codeLock ВСЕГДА ДО sessionLock — обратный порядок в любом алгоритме фичи
// создал бы возможность deadlock с `ActivateAttributionOnRecognition`, которая берёт ТОЛЬКО
// codeLock (`03_architecture.md`). Оба — `pg_advisory_xact_lock`: держатся до
// `COMMIT`/`ROLLBACK` текущей транзакции, снимаются автоматически.
//
// Порядок операций (`security-operation-order.md`, `04_refinement.md`): лок кода ДО чтения
// его статуса (иначе лок — бутафория), `blocked`-проверка ДО anti-fraud (иначе окно
// пересчитывается на уже заблокированном коде, AC-10), все три проверки ДО записи
// `attribution` (ADR-008), `growth_event(code_applied)` ПОСЛЕ решения, той же транзакцией.
//
// ТРИ реализационно разных завершения транзакции, и путать их нельзя:
//   - `blocked`/`self_referral` — ROLLBACK (throw): ничего в этой транзакции ещё не
//     записано, откатывать нечего, но исключение — обязательный способ прервать колбэк
//     `withTransaction` без коммита (`security-operation-order`).
//   - anti-fraud заблокировал код — COMMIT (return): блокировка кода ОБЯЗАНА сохраниться,
//     а больше в транзакции ничего не менялось, поэтому обычный COMMIT делает то же самое,
//     что «зафиксировать только блокировку» (`02_pseudocode.md`, конец `AntiFraudOnCode`).
//   - `conflict` — COMMIT (return) без изменений: транзакция пуста, коммитить нечего, но
//     теми же путём — не ROLLBACK, потому что ничего не отменяется, оба исхода эквивалентны
//     на пустой транзакции, и код проще с одним путём завершения.

import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';
import { normalizeAndFindCode } from './normalize-code.js';
import { createAntiFraudCheck, type AntiFraudCheck } from './anti-fraud.js';

export type ApplySource = 'explicit' | 'deeplink' | 'cookie';
export type RejectReason = 'code_blocked' | 'self_referral' | 'antifraud_ip_burst';

export type ApplyOutcome =
  | { readonly outcome: 'applied' }
  | { readonly outcome: 'conflict' }
  | { readonly outcome: 'invalid' }
  | { readonly outcome: 'rejected'; readonly reason: RejectReason };

export interface ApplyPartnerCodeInput {
  readonly rawCode: string;
  readonly source: ApplySource;
  readonly deviceSessionId: string;
  readonly ipPrefix: string;
  readonly requestId: string;
}

export interface ApplyPartnerCodeDeps {
  readonly pool: DbPool;
  readonly logger: Logger;
  /** Инъекция ТОЛЬКО для AC-10: число обращений к подсчёту проверяется шпионом. */
  readonly antiFraudCheck?: AntiFraudCheck;
}

/** Прерывает `withTransaction` с ROLLBACK — ничего не записано, откатывать нечего по факту. */
class RejectedBeforeWrite extends Error {
  constructor(readonly reason: 'code_blocked' | 'self_referral') {
    super(`rejected: ${reason}`);
  }
}

const WEAK_SOURCES = new Set<ApplySource>(['cookie', 'deeplink']);

const SELECT_CODE_STATUS = `SELECT status::text AS status FROM partner_code WHERE id = $1`;
const SELECT_SESSION_ACCOUNT = `SELECT account_id FROM device_session WHERE id = $1`;
const SELECT_ATTRIBUTION_FOR_UPDATE = `
  SELECT id, source::text AS source, partner_code_id FROM attribution WHERE device_session_id = $1 FOR UPDATE
`;
const INSERT_ATTRIBUTION = `
  INSERT INTO attribution (device_session_id, partner_code_id, source, replaced_source, status)
  VALUES ($1, $2, $3, NULL, 'pending')
`;
const REPLACE_ATTRIBUTION = `
  UPDATE attribution SET partner_code_id = $2, replaced_source = $3, source = 'explicit' WHERE id = $1
`;
const INSERT_CODE_APPLIED_EVENT = `
  INSERT INTO growth_event (type, device_session_id, partner_code_id) VALUES ('code_applied', $1, $2)
`;

export async function applyPartnerCode(input: ApplyPartnerCodeInput, deps: ApplyPartnerCodeDeps): Promise<ApplyOutcome> {
  // Шаг 1: нормализация и поиск ДО открытия транзакции — `invalid` не трогает ни одной строки.
  const found = await normalizeAndFindCode(deps.pool, input.rawCode);
  if (found.kind === 'invalid') return { outcome: 'invalid' };
  const code = found.code;
  const antiFraudCheck = deps.antiFraudCheck ?? createAntiFraudCheck(deps.logger);

  try {
    return await withTransaction<ApplyOutcome>(deps.pool, async (client: DbClient) => {
      // Шаг 3: codeLock — сериализует ВСЕ одновременные применения ЭТОГО кода.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [code.id]);

      // Шаг 4: перечитать статус ПОСЛЕ захвата лока — свежее значение, а не то, что было в
      // шаге 1 (могло устареть, пока лок ждал очереди).
      const statusRow = await client.query<{ status: string }>(SELECT_CODE_STATUS, [code.id]);
      if (statusRow.rows[0]?.status === 'blocked') {
        deps.logger.warn('code_blocked', { request_id: input.requestId, partner_code_id: code.id });
        throw new RejectedBeforeWrite('code_blocked');
      }

      // Шаг 5: самореферал — device_session.account_id (если проставлен) равен владельцу кода.
      const sessionRow = await client.query<{ account_id: string | null }>(SELECT_SESSION_ACCOUNT, [input.deviceSessionId]);
      const accountId = sessionRow.rows[0]?.account_id ?? null;
      if (accountId !== null && code.owner_account_id !== null && accountId === code.owner_account_id) {
        deps.logger.warn('self_referral', { request_id: input.requestId, partner_code_id: code.id, device_session_id: input.deviceSessionId });
        throw new RejectedBeforeWrite('self_referral');
      }

      // Шаг 6: anti-fraud — ПОД тем же codeLock, ТОЛЬКО если код ещё не blocked (AC-10).
      const antiFraud = await antiFraudCheck(client, { partnerCodeId: code.id, ipPrefix: input.ipPrefix, requestId: input.requestId });
      if (antiFraud.outcome === 'block') {
        // COMMIT нормальным путём: блокировка кода ОБЯЗАНА сохраниться, больше в этой
        // транзакции ничего не менялось (`02_pseudocode.md`, конец `AntiFraudOnCode`).
        return { outcome: 'rejected', reason: 'antifraud_ip_burst' };
      }

      // Шаг 7: sessionLock — ВСЕГДА после codeLock, никогда наоборот (deadlock-freedom).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [input.deviceSessionId]);

      // Шаг 8: существующая атрибуция сессии, FOR UPDATE.
      const existing = await client.query<{ id: string; source: ApplySource; partner_code_id: string }>(SELECT_ATTRIBUTION_FOR_UPDATE, [
        input.deviceSessionId,
      ]);
      const existingRow = existing.rows[0];

      let applied: boolean;
      if (existingRow === undefined) {
        // Шаг 9: строки нет — создать.
        await client.query(INSERT_ATTRIBUTION, [input.deviceSessionId, code.id, input.source]);
        applied = true;
      } else if (WEAK_SOURCES.has(existingRow.source) && input.source === 'explicit') {
        // Шаг 10: слабый источник заменяется явным кодом.
        await client.query(REPLACE_ATTRIBUTION, [existingRow.id, code.id, existingRow.source]);
        // AC-3: журнал несёт ОБА кода — новый (partner_code_id) и заменённый (old_partner_code_id).
        deps.logger.info('replaced_weaker_source', {
          request_id: input.requestId,
          device_session_id: input.deviceSessionId,
          partner_code_id: code.id,
          old_partner_code_id: existingRow.partner_code_id,
          source: 'explicit',
          replaced_source: existingRow.source,
        });
        applied = true;
      } else {
        // Шаг 11: explicit+любой (включая тот же код) ИЛИ слабый+слабый — конфликт, COMMIT
        // без изменений (ничего не менялось).
        applied = false;
      }

      if (!applied) return { outcome: 'conflict' };

      // Шаг 12: событие применения — РОВНО при исходе applied, той же транзакцией.
      await client.query(INSERT_CODE_APPLIED_EVENT, [input.deviceSessionId, code.id]);
      return { outcome: 'applied' };
    });
  } catch (error) {
    if (error instanceof RejectedBeforeWrite) return { outcome: 'rejected', reason: error.reason };
    throw error;
  }
}
