// ActivateAttributionOnRecognition (FR-partner-codes-and-cabinet-8,
// AC-partner-codes-and-cabinet-12/13/14, `03_architecture.md` «Интеграционная точка»).
//
// Контракт места вызова: эта функция обязана выполниться В ТОЙ ЖЕ транзакции БД, что и
// `UPDATE recognition SET status = 'done'` — сразу после него, ДО `COMMIT` — и принимает
// уже открытый клиент транзакции (`DbClient`, не пул), чтобы не открывать вторую,
// независимую транзакцию ради одного вызова.
//
// НА МОМЕНТ РЕАЛИЗАЦИИ этой фичи путь завершения распознавания (`source-and-correct`,
// седьмая фича в зависимостях этой) в этом worktree ЕЩЁ НЕ СЛИТ: `apps/recognizer/src/
// lease.ts` пишет `recognition.status = 'done'` ОДНИМ `pool.query`, вне `withTransaction`.
// Интеграция остаётся ИМЕННО ТЕМ именованным TODO, который допускает `03_architecture.md`:
// эта функция полностью реализована и покрыта тестами, вызывающими её напрямую (AC-12/13/14),
// но НЕ подключена к `lease.ts`/`recognize-scan.ts` — тот код принадлежит `scan-pipeline`
// и правится владельцем интеграционной точки, когда транзакция завершения появится.
// Опрос (`SELECT … WHERE status='done' AND processed_at IS NULL`) НЕ применяется намеренно:
// он завёл бы второй, рассинхронизируемый источник истины (см. `03_architecture.md`).
//
// TODO(AC-partner-codes-and-cabinet-12): вызвать `activateAttributionOnRecognition` внутри
// транзакции `source-and-correct`, сразу после `UPDATE recognition SET status = 'done'`.

import type { DbClient } from '@n4/db';

export type ActivateOutcome =
  | { readonly outcome: 'activated' }
  | { readonly outcome: 'rejected'; readonly reason: 'code_blocked' | 'self_referral' }
  | { readonly outcome: 'no_attribution' }
  | { readonly outcome: 'already_settled' };

const SELECT_ATTRIBUTION_FOR_UPDATE = `
  SELECT id, status::text AS status, partner_code_id FROM attribution WHERE device_session_id = $1 FOR UPDATE
`;
const SELECT_CODE_STATUS = `SELECT status::text AS status FROM partner_code WHERE id = $1`;
const SELECT_OWNER_ACCOUNT = `SELECT p.account_id AS owner_account_id FROM partner_code pc JOIN partner p ON p.id = pc.partner_id WHERE pc.id = $1`;
const SELECT_SESSION_ACCOUNT = `SELECT account_id FROM device_session WHERE id = $1`;
const REJECT_ATTRIBUTION = `UPDATE attribution SET status = 'rejected', reject_reason = $2 WHERE id = $1`;
const ACTIVATE_ATTRIBUTION = `UPDATE attribution SET status = 'activated', activated_at = now() WHERE id = $1`;
const INSERT_ACTIVATION_EVENT = `INSERT INTO growth_event (type, device_session_id, partner_code_id) VALUES ('activation', $1, $2)`;

export async function activateAttributionOnRecognition(client: DbClient, deviceSessionId: string): Promise<ActivateOutcome> {
  // Шаг 1: строки нет — сессия пришла без кода, самый частый случай, не ошибка.
  const attributionRow = await client.query<{ id: string; status: string; partner_code_id: string }>(SELECT_ATTRIBUTION_FOR_UPDATE, [
    deviceSessionId,
  ]);
  const attribution = attributionRow.rows[0];
  if (attribution === undefined) return { outcome: 'no_attribution' };

  // Шаг 2: идемпотентность — второе и последующие успешные распознавания не трогают
  // уже settled строку (AC-12).
  if (attribution.status !== 'pending') return { outcome: 'already_settled' };

  // Шаг 3: codeLock — тот же ключ, что в `ApplyPartnerCode`: активация не должна
  // разминуться с конкурентной блокировкой этого же кода.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [attribution.partner_code_id]);

  // Шаг 4: код заблокирован между применением и распознаванием (AC-13).
  const codeStatus = await client.query<{ status: string }>(SELECT_CODE_STATUS, [attribution.partner_code_id]);
  if (codeStatus.rows[0]?.status === 'blocked') {
    // Не аудируется: закрытый список из ПЯТИ событий (`01_specification.md`, «Решение:
    // аудит») принадлежит `ApplyPartnerCode`/`AntiFraudOnCode`/`ManualUnblockPartnerCode` —
    // AC-13 требует только смены строки `attribution`, без записи в журнал.
    await client.query(REJECT_ATTRIBUTION, [attribution.id, 'code_blocked']);
    return { outcome: 'rejected', reason: 'code_blocked' };
  }

  // Шаг 5: самореферал, обнаруженный ПОСЛЕ входа через Telegram (AC-14).
  const owner = await client.query<{ owner_account_id: string | null }>(SELECT_OWNER_ACCOUNT, [attribution.partner_code_id]);
  const session = await client.query<{ account_id: string | null }>(SELECT_SESSION_ACCOUNT, [deviceSessionId]);
  const ownerAccountId = owner.rows[0]?.owner_account_id ?? null;
  const sessionAccountId = session.rows[0]?.account_id ?? null;
  if (sessionAccountId !== null && ownerAccountId !== null && sessionAccountId === ownerAccountId) {
    await client.query(REJECT_ATTRIBUTION, [attribution.id, 'self_referral']);
    return { outcome: 'rejected', reason: 'self_referral' };
  }

  // Шаг 6: активация.
  await client.query(ACTIVATE_ATTRIBUTION, [attribution.id]);
  await client.query(INSERT_ACTIVATION_EVENT, [deviceSessionId, attribution.partner_code_id]);
  return { outcome: 'activated' };
}
