// Заглушка-репозиторий дневника (03_architecture.md, «Размещение по пакетам и сервисам»,
// FR-consent-and-telegram-auth-7): `scan-pipeline` ПОДКЛЮЧИТСЯ к этой функции вместо того,
// чтобы заново реализовывать проверку согласия — два места проверки одного факта разошлись
// бы молча (`deployment-seams.md`). Реальные поля записи (расчёт `kcal_total`, `items` и т.д.)
// вводит `scan-pipeline`; здесь только ГРАНИЦА и минимальная форма, достаточная для теста
// стража по исходнику (`tests/unit/consent-guard-source.test.ts`).
//
// Правка по review-report.md RV-consent-and-telegram-auth-08:
//   1. `ownerKey` записи БОЛЬШЕ НЕ принимается отдельным параметром — он ВСЕГДА `input.owner.id`,
//      тот же самый идентификатор, для которого проверено согласие. Раньше независимый
//      `ownerKey` позволял прямому вызову передать согласившегося A в `owner` и несогласившегося
//      B в `ownerKey`: проверка проходила для A, а запись создавалась на B.
//   2. Проверка согласия и `INSERT` выполняются в ОДНОЙ транзакции с блокировкой строки
//      владельца (`enforceConsentBeforeDiaryWrite` с `client`, не с `pool`) — иначе конкурентный
//      `withdraw_consent` мог отозвать согласие МЕЖДУ проверкой и записью.

import { withTransaction, type DbPool } from '@n4/db';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';

export type CreateDiaryEntryResult =
  | { readonly outcome: 'created'; readonly id: string }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' };

export interface CreateDiaryEntryInput {
  readonly owner: ConsentOwnerRef;
  readonly recognitionId: string;
  readonly eatenOn: string;
  readonly mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  readonly items: unknown;
  readonly kcalTotal: number;
  readonly proteinTotal: number;
  readonly fatTotal: number;
  readonly carbTotal: number;
  readonly sourceSnapshot: unknown;
}

const INSERT_DIARY_ENTRY_SQL = `
  INSERT INTO diary_entry
    (owner_key, recognition_id, eaten_on, meal_slot, items, kcal_total, protein_total, fat_total, carb_total, source_snapshot)
  VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
  RETURNING id
`;

/**
 * ЕДИНСТВЕННЫЙ путь записи `diary_entry` в этом каталоге: проверяет согласие ПЕРЕД `INSERT`,
 * в ОДНОЙ транзакции с блокировкой строки владельца, и никогда после. Обход этой функции — тот
 * самый обход границы, который стережёт `enforce-before-diary-write.ts`
 * (AC-consent-and-telegram-auth-11: «в том числе гипотетический прямой вызов репозитория, минуя
 * маршрут»).
 */
export async function createDiaryEntryGuarded(pool: DbPool, input: CreateDiaryEntryInput): Promise<CreateDiaryEntryResult> {
  return withTransaction(pool, async (client) => {
    const enforcement = await enforceConsentBeforeDiaryWrite(client, input.owner);
    if (enforcement.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

    const result = await client.query<{ id: string }>(INSERT_DIARY_ENTRY_SQL, [
      // `owner.id` — ЕДИНСТВЕННЫЙ источник владельца записи, тот же, для которого только что
      // проверено согласие (RV-08): нет отдельного параметра, который мог бы разойтись с ним.
      input.owner.id,
      input.recognitionId,
      input.eatenOn,
      input.mealSlot,
      JSON.stringify(input.items),
      input.kcalTotal,
      input.proteinTotal,
      input.fatTotal,
      input.carbTotal,
      JSON.stringify(input.sourceSnapshot),
    ]);
    const row = result.rows[0];
    if (row === undefined) throw new Error('запись дневника не создана');
    return { outcome: 'created', id: row.id };
  });
}
