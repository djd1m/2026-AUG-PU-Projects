// GrantOrDeclineConsent (FR-consent-and-telegram-auth-5/6, DEC-A-019).
//
// Владелец — `account`, ЕСЛИ сессия связана, ИНАЧЕ сама `device_session`: маршрут не требует
// входа (DEC-A-019, «анонимного исключения нет»). Таблица-владелец — ЗАКРЫТОЕ множество,
// выбирается ВЕТКОЙ КОДА вызывающим, а не подставляется как параметр запроса: имя таблицы,
// пришедшее из запроса, было бы SQL-инъекцией.
//
// `decline` НЕ пишет `consent_at`: отсутствие поля УЖЕ есть состояние «согласия нет», а сам
// отказ фиксируется аудитом на уровне маршрута (структурный журнал), не отдельным столбцом.

import type { DbClient, DbPool } from '@n4/db';
import { computeConsentTextHash, isKnownConsentVersion } from './known-versions.js';

export type ConsentOwnerTable = 'account' | 'device_session';

export interface GrantOrDeclineInput {
  readonly ownerTable: ConsentOwnerTable;
  readonly ownerId: string;
  readonly decision: 'grant' | 'decline';
  readonly consentVersion: string;
  readonly consentTextHash: string;
}

export type GrantOrDeclineResult =
  | { readonly outcome: 'granted'; readonly consentVersion: string; readonly recordedAt: Date }
  | { readonly outcome: 'declined'; readonly consentVersion: string; readonly recordedAt: Date }
  | { readonly outcome: 'refused'; readonly reason: 'unknown_consent_version' };

const GRANT_SQL: Readonly<Record<ConsentOwnerTable, string>> = {
  account: `UPDATE account SET consent_version = $2, consent_text_hash = $3, consent_at = now() WHERE id = $1 RETURNING consent_at`,
  device_session: `UPDATE device_session SET consent_version = $2, consent_text_hash = $3, consent_at = now() WHERE id = $1 RETURNING consent_at`,
};

export async function grantOrDeclineConsent(
  executor: DbPool | DbClient,
  input: GrantOrDeclineInput,
): Promise<GrantOrDeclineResult> {
  if (input.decision === 'decline') {
    // Ни съёмка, ни результат распознавания не блокируются: запись дневника — единственное,
    // что остаётся закрытым, и её закрывает EnforceConsentBeforeDiaryWrite отдельно.
    return { outcome: 'declined', consentVersion: input.consentVersion, recordedAt: new Date() };
  }

  if (!isKnownConsentVersion(input.consentVersion)) {
    return { outcome: 'refused', reason: 'unknown_consent_version' };
  }
  const expectedHash = computeConsentTextHash(input.consentVersion);
  if (expectedHash === undefined || expectedHash !== input.consentTextHash) {
    // Тот же код, что неизвестная версия: согласие на чужой текст не является согласием.
    return { outcome: 'refused', reason: 'unknown_consent_version' };
  }

  const result = await executor.query<{ consent_at: Date }>(GRANT_SQL[input.ownerTable], [
    input.ownerId,
    input.consentVersion,
    input.consentTextHash,
  ]);
  const row = result.rows[0];
  if (row === undefined) throw new Error('согласие не записано: владелец не найден');
  return { outcome: 'granted', consentVersion: input.consentVersion, recordedAt: row.consent_at };
}
