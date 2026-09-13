// ActivateAttributionOnRecognition (FR-partner-codes-and-cabinet-8,
// AC-partner-codes-and-cabinet-12/13/14, `docs/features/partner-codes-and-cabinet/
// 03_architecture.md` «Интеграционная точка»).
//
// Живёт в `@n4/db`, а НЕ в `apps/api`, потому что вызывающая сторона — `@n4/recognizer`
// (`apps/recognizer/src/lease.ts`, `recordResult`), а `@n4/recognizer` НЕ зависит от
// `@n4/api` (разные приложения одного монорепо, `package.json` recognizer перечисляет
// только `@n4/db`/`@n4/shared`) — правка ревью RV-partner-codes-and-cabinet-01:
// производственный код НИКОГДА не вызывал эту функцию, потому что она была недостижима
// из места, где реально пишется `recognition.status = 'done'`.
//
// Контракт места вызова не изменился: функция обязана выполниться В ТОЙ ЖЕ транзакции БД,
// что и запись терминального статуса распознавания, ДО `COMMIT`, и принимает уже открытый
// клиент транзакции (`DbClient`, не пул).
//
// RV-partner-codes-and-cabinet-02 (порядок блокировок): `ApplyPartnerCode` ВСЕГДА берёт
// codeLock ДО sessionLock (известный код названivается на входе). Эта функция знает код
// ТОЛЬКО после чтения строки `attribution` по `deviceSessionId` — чтобы не менять порядок
// на обратный (sessionLock/row-lock раньше codeLock, что дало бы РЕАЛЬНЫЙ deadlock с
// `ApplyPartnerCode`, воспроизведённый ревью), код сперва ПОДСМАТРИВАЕТСЯ без лока,
// codeLock берётся ПЕРВЫМ, и значение ПЕРЕПРОВЕРЯЕТСЯ без удержания sessionLock — только
// когда оно стабильно, берётся sessionLock и делается авторитетное `FOR UPDATE`. Ни на
// одной итерации цикла НЕ запрашивается новый codeLock, пока уже удерживается sessionLock —
// именно это удерживало бы совместный порядок и не создавало обратной зависимости.

import type { DbClient } from './pool.js';

export type ActivateOutcome =
  | { readonly outcome: 'activated' }
  | { readonly outcome: 'rejected'; readonly reason: 'code_blocked' | 'self_referral' }
  | { readonly outcome: 'no_attribution' }
  | { readonly outcome: 'already_settled' };

interface AttributionPeek {
  readonly status: string;
  readonly partner_code_id: string;
}

const PEEK_ATTRIBUTION = `SELECT status::text AS status, partner_code_id FROM attribution WHERE device_session_id = $1`;
const SELECT_ATTRIBUTION_FOR_UPDATE = `
  SELECT id, status::text AS status, partner_code_id FROM attribution WHERE device_session_id = $1 FOR UPDATE
`;
const SELECT_CODE_STATUS = `SELECT status::text AS status FROM partner_code WHERE id = $1`;
const SELECT_OWNER_ACCOUNT = `SELECT p.account_id AS owner_account_id FROM partner_code pc JOIN partner p ON p.id = pc.partner_id WHERE pc.id = $1`;
const SELECT_SESSION_ACCOUNT = `SELECT account_id FROM device_session WHERE id = $1`;
const REJECT_ATTRIBUTION = `UPDATE attribution SET status = 'rejected', reject_reason = $2 WHERE id = $1`;
const ACTIVATE_ATTRIBUTION = `UPDATE attribution SET status = 'activated', activated_at = now() WHERE id = $1`;
const INSERT_ACTIVATION_EVENT = `INSERT INTO growth_event (type, device_session_id, partner_code_id) VALUES ('activation', $1, $2)`;

const MAX_STABILIZE_ATTEMPTS = 5;

/**
 * Стабилизирует codeLock ДО взятия sessionLock: подсматривает `partner_code_id` без лока,
 * берёт codeLock под него, перечитывает без лока ещё раз — если код успел смениться
 * конкурентной заменой слабого источника (`ApplyPartnerCode`, шаг 10), цикл берёт codeLock
 * под НОВОЕ значение и повторяет проверку. НИ РАЗУ в этом цикле не удерживается
 * sessionLock — поэтому лишний (устаревший) codeLock, оставшийся от предыдущей итерации,
 * не создаёт обратной зависимости с `ApplyPartnerCode` (который ждёт codeLock, ДЕРЖА
 * НИЧЕГО из сессионных ресурсов, ровно до захвата codeLock).
 */
async function stabilizeCandidateCode(client: DbClient, deviceSessionId: string): Promise<AttributionPeek | 'no_attribution' | 'already_settled'> {
  let candidate = await client.query<AttributionPeek>(PEEK_ATTRIBUTION, [deviceSessionId]);
  let row = candidate.rows[0];
  if (row === undefined) return 'no_attribution';
  if (row.status !== 'pending') return 'already_settled';

  for (let attempt = 0; attempt < MAX_STABILIZE_ATTEMPTS; attempt += 1) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [row.partner_code_id]);
    candidate = await client.query<AttributionPeek>(PEEK_ATTRIBUTION, [deviceSessionId]);
    const fresh = candidate.rows[0];
    if (fresh === undefined) return 'no_attribution';
    if (fresh.status !== 'pending') return 'already_settled';
    if (fresh.partner_code_id === row.partner_code_id) return fresh; // стабильно — codeLock верный
    row = fresh; // код сменился конкурентной заменой — берём codeLock под НОВОЕ значение
  }
  // Практически недостижимо (`MAX_STABILIZE_ATTEMPTS` попыток конкурентной замены подряд
  // ровно в этом окне) — честный отказ вместо тихого продолжения с неверным локом.
  throw new Error(`activateAttributionOnRecognition: код применения не стабилизировался за ${MAX_STABILIZE_ATTEMPTS} попыток`);
}

export async function activateAttributionOnRecognition(client: DbClient, deviceSessionId: string): Promise<ActivateOutcome> {
  const stabilized = await stabilizeCandidateCode(client, deviceSessionId);
  if (stabilized === 'no_attribution') return { outcome: 'no_attribution' };
  if (stabilized === 'already_settled') return { outcome: 'already_settled' };

  // sessionLock — ВСЕГДА ПОСЛЕ codeLock (тот же порядок, что `ApplyPartnerCode`). С этого
  // момента ни один конкурентный `ApplyPartnerCode` для ЭТОЙ сессии не сможет продвинуться
  // дальше своего шага 7 до нашего `COMMIT`/`ROLLBACK` — строка `attribution` стабильна.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [deviceSessionId]);

  const attributionRow = await client.query<{ id: string; status: string; partner_code_id: string }>(SELECT_ATTRIBUTION_FOR_UPDATE, [
    deviceSessionId,
  ]);
  const attribution = attributionRow.rows[0];
  if (attribution === undefined) return { outcome: 'no_attribution' };
  if (attribution.status !== 'pending') return { outcome: 'already_settled' };
  // Остаточная (не устранённая) узкая гонка: между последней проверкой без sessionLock и
  // взятием sessionLock конкурентная замена ВСЁ ЖЕ могла произойти. Заводить ЕЩЁ один
  // codeLock здесь означало бы запрашивать лок, УЖЕ удерживая sessionLock, — ровно тот
  // обратный порядок, который и был причиной RV-02. Решение: honest-configuration —
  // действовать по АВТОРИТЕТНОМУ значению строки (не по устаревшему codeLock), а не падать
  // и не удерживать невалидный лок молча. Окно — два последовательных round-trip против
  // потребности конкурента пройти ЦЕЛУЮ транзакцию `ApplyPartnerCode`, поэтому практическая
  // вероятность пренебрежимо мала; природа осталась НАЗВАННОЙ, а не скрытой.

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
