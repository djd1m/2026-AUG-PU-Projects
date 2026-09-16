// Связывание сессии устройства с аккаунтом — ОДИН код для входа через Telegram
// (`routes/auth-telegram.ts`) и по почте (`routes/auth-email.ts`).
//
// Пять переносов в ОДНОЙ транзакции входа; порядок и причины — из истории ревью фичи
// consent-and-telegram-auth (RV-01, RV-05, RV-06), см. комментарии по месту. Вторая копия этого
// списка в другом маршруте разошлась бы с первой молча — поэтому он здесь и только здесь.

import type { DbClient } from '@n4/db';

export interface LinkOutcome {
  /** Сколько записей дневника перенесено с сессии на аккаунт. */
  readonly diaryMigrated: number;
}

export async function linkSessionToAccount(
  client: DbClient,
  input: { readonly sessionId: string; readonly accountId: string; readonly sessionWasUnlinked: boolean },
): Promise<LinkOutcome> {
  const { sessionId, accountId, sessionWasUnlinked } = input;

  // Сессия СВЯЗЫВАЕТСЯ, не заменяется; cookie остаётся тем же значением.
  await client.query(`UPDATE device_session SET account_id = $2 WHERE id = $1`, [sessionId, accountId]);

  // Перенос дневника ЦЕЛИКОМ, добавлением к уже перенесённому (AC-consent-and-telegram-auth-6).
  const migrated = await client.query(`UPDATE diary_entry SET owner_key = $2 WHERE owner_key = $1`, [sessionId, accountId]);

  // Перенос владения анонимными карточками (RV-01): иначе отзыв согласия и эразура, работающие
  // по `owner_key = account_id`, молча пропускают карточку, а `DELETE FROM recognition` падает
  // на `ON DELETE RESTRICT`, оставляя аккаунт `erasing` навсегда.
  await client.query(`UPDATE share_card SET owner_key = $2 WHERE owner_key = $1`, [sessionId, accountId]);

  // Перенос владения анонимными распознаваниями (RV-06): эразура ищет сканы по
  // `recognition.account_id`; созданные до входа иначе переживают `erase_all`.
  await client.query(`UPDATE recognition SET account_id = $2 WHERE device_session_id = $1 AND account_id IS NULL`, [sessionId, accountId]);

  // Перенос согласия — ТОЛЬКО при ПЕРВОМ связывании ЭТОЙ сессии (RV-05) и только если у
  // аккаунта своего согласия ещё нет: иначе withdraw_consent отменялся бы историческим
  // согласием уже связанной сессии на следующем входе.
  if (sessionWasUnlinked) {
    await client.query(
      `UPDATE account SET consent_version = ds.consent_version, consent_text_hash = ds.consent_text_hash, consent_at = ds.consent_at
       FROM device_session ds
       WHERE account.id = $1 AND ds.id = $2 AND account.consent_at IS NULL AND ds.consent_at IS NOT NULL`,
      [accountId, sessionId],
    );
  }

  return { diaryMigrated: migrated.rowCount ?? 0 };
}
