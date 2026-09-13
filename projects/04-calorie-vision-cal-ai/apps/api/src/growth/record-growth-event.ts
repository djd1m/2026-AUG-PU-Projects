// `RecordCardView` / `RecordShareClick` (02_pseudocode.md) — запись `growth_event`
// (FR-share-card-and-growth-events-7/8). Ни дедупликации, ни уникального ограничения НЕТ
// НАМЕРЕННО: метрика недели считает ФАКТ «есть ли хотя бы одно событие», кабинет партнёра —
// количество отдельных событий; схлопывание исказило бы ИМЕННО этот второй счётчик.

import type { DbClient, DbPool } from '@n4/db';

const INSERT_GROWTH_EVENT_SQL = `
  INSERT INTO growth_event (type, device_session_id, partner_code_id, share_card_id)
  VALUES ($1, $2, $3, $4)
`;

export async function recordShareClick(
  executor: DbPool | DbClient,
  input: { readonly shareCardId: string; readonly deviceSessionId: string; readonly partnerCodeId: string | null },
): Promise<void> {
  await executor.query(INSERT_GROWTH_EVENT_SQL, ['share_click', input.deviceSessionId, input.partnerCodeId, input.shareCardId]);
}

export async function recordCardView(
  executor: DbPool | DbClient,
  input: { readonly shareCardId: string; readonly deviceSessionId: string; readonly partnerCodeId: string | null },
): Promise<void> {
  await executor.query(INSERT_GROWTH_EVENT_SQL, ['card_view', input.deviceSessionId, input.partnerCodeId, input.shareCardId]);
}

/** Атрибуция ВЫЗЫВАЮЩЕЙ сессии (FR-8: «атрибуция вызывающего») — прямой запрос по device_session_id. */
export async function findAttributionForSession(executor: DbPool | DbClient, deviceSessionId: string): Promise<string | null> {
  const result = await executor.query<{ partner_code_id: string }>('SELECT partner_code_id FROM attribution WHERE device_session_id = $1', [deviceSessionId]);
  return result.rows[0]?.partner_code_id ?? null;
}

export interface OwnerGrowthContext {
  readonly deviceSessionId: string;
  readonly partnerCodeId: string | null;
}

/**
 * Разрешает `share_card.owner_key` (полиморфный текст — либо `device_session.id`, либо
 * `account.id`, канонический владелец из `enforceConsentBeforeDiaryWrite`) в
 * `device_session_id`, годный для `growth_event.device_session_id` (NOT NULL FK) — и
 * `partner_code_id` атрибуции этого владельца (FR-7).
 *
 * СТЫК, названный явно: схема НЕ несёт признака «чем является owner_key» (ни на
 * `share_card`, ни отдельной колонкой) — ни один документ Phase 1 этой фичи не решает,
 * какую ИЗ НЕСКОЛЬКИХ device_session одного аккаунта показывать «владельцем» для
 * растущих метрик. Решение этого файла: `owner_key` СОВПАДАЕТ с `device_session.id`
 * НАПРЯМУЮ (несвязанная сессия) — берём её; ИНАЧЕ (владелец — `account.id`) берём среди
 * связанных с ним сессий ту, у которой ЕСТЬ атрибуция (парт нёрская атрибуция ведётся по
 * `device_session_id`, `attribution_device_session_unique`), а при отсутствии атрибуции —
 * последнюю активную (`last_seen_at`). Единственная сессия без атрибуции для анонимного
 * владельца — типичный случай (несвязанная ветка выше), эта общая ветка обслуживает
 * связанный аккаунт с несколькими устройствами.
 */
export async function resolveOwnerGrowthContext(executor: DbPool | DbClient, ownerKey: string): Promise<OwnerGrowthContext | null> {
  const result = await executor.query<{ device_session_id: string; partner_code_id: string | null }>(
    `SELECT ds.id AS device_session_id, a.partner_code_id AS partner_code_id
     FROM device_session ds
     LEFT JOIN attribution a ON a.device_session_id = ds.id
     WHERE ds.id = $1 OR ds.account_id = $1
     ORDER BY (a.partner_code_id IS NOT NULL) DESC, ds.last_seen_at DESC
     LIMIT 1`,
    [ownerKey],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return { deviceSessionId: row.device_session_id, partnerCodeId: row.partner_code_id };
}
