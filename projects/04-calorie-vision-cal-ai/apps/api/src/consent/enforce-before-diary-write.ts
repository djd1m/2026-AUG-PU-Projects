// EnforceConsentBeforeDiaryWrite (FR-consent-and-telegram-auth-7, AC-consent-and-telegram-auth-11).
//
// ЕДИНСТВЕННАЯ граница, через которую ОБЯЗАН пройти ЛЮБОЙ код перед записью `diary_entry` ИЛИ
// `share_card` (03_architecture.md, «Границы, которые фича обязана сохранить») — `scan-pipeline`
// ИМПОРТИРУЕТ эту функцию и не реализует свою проверку согласия: два места проверки одного
// факта разошлись бы молча (`deployment-seams.md`).
//
// Исключения для анонимного владельца НЕТ (DEC-A-019): владелец разрешается в `account`, если
// сессия связана, ИНАЧЕ в саму `device_session` — та же таблица, что читает и пишет
// `GrantOrDeclineConsent`. Недоступность строки владельца (сбой чтения) трактуется КАК
// отсутствие согласия (`fail-closed-defaults.md`): нет отдельной ветки «проверить не смогли —
// пропустим».

import type { DbClient, DbPool } from '@n4/db';

export type ConsentOwnerTable = 'account' | 'device_session';

export interface ConsentOwnerRef {
  readonly table: ConsentOwnerTable;
  readonly id: string;
}

export type ConsentEnforcement =
  | { readonly outcome: 'granted' }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' };

const SELECT_SQL: Readonly<Record<ConsentOwnerTable, string>> = {
  account: 'SELECT consent_at FROM account WHERE id = $1',
  device_session: 'SELECT consent_at FROM device_session WHERE id = $1',
};

export async function enforceConsentBeforeDiaryWrite(
  executor: DbPool | DbClient,
  owner: ConsentOwnerRef,
): Promise<ConsentEnforcement> {
  try {
    const result = await executor.query<{ consent_at: Date | null }>(SELECT_SQL[owner.table], [owner.id]);
    const row = result.rows[0];
    if (row === undefined || row.consent_at === null) {
      // Решением DEC-A-016 это ОДИНАКОВО покрывает «согласия никогда не было» И «согласие
      // отозвано» (`withdraw_consent` обнуляет `consent_at`) — второго признака нет.
      return { outcome: 'refused', reason: 'consent_required' };
    }
    return { outcome: 'granted' };
  } catch {
    return { outcome: 'refused', reason: 'consent_required' };
  }
}
