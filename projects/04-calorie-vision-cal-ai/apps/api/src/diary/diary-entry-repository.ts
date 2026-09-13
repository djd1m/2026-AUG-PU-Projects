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
//
// Правка RV-consent-and-telegram-auth-01 (четвёртый обзор): пункт 1 был неполон — `input.owner.id`
// это ИСХОДНЫЙ идентификатор (может быть `session_id` уже связанной сессии), а не обязательно тот
// же, для которого guard РЕАЛЬНО проверил согласие (для связанной сессии это `account_id`).
// `INSERT` теперь пишет `enforcement.ownerKey` — канонический владелец из результата проверки.
//
// Правка `diary-and-streak` (FR-diary-and-streak-1, AC-diary-and-streak-5): `INSERT` получил
// `ON CONFLICT (recognition_id) DO NOTHING RETURNING *` — уникальность добавлена миграцией
// `006_diary_entry_recognition_unique.sql`. «Прочитать, потом вставить» здесь ЗАПРЕЩЁН
// (`shared-resource-verification.md`): между чтением и записью помещается конкурентный вызов, и
// обе реализации проходят последовательный тест, различает их только конкурентный прогон. Пустой
// результат `INSERT` (строка уже создана РАНЕЕ — двойной тап, повтор сети) читает существующую
// строку по `recognition_id` и возвращает её КАК УСПЕХ — повторный `confirm` идемпотентен, а не
// ошибка.

import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';

export interface DiaryEntryRow {
  readonly id: string;
  readonly owner_key: string;
  readonly recognition_id: string;
  readonly eaten_on: string;
  readonly meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  readonly items: unknown;
  readonly kcal_total: number;
  readonly protein_total: string;
  readonly fat_total: string;
  readonly carb_total: string;
  readonly source_snapshot: unknown;
  readonly user_corrected: boolean;
  readonly deleted_at: Date | null;
}

export type CreateDiaryEntryResult =
  | { readonly outcome: 'created'; readonly entry: DiaryEntryRow }
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
  ON CONFLICT (recognition_id) DO NOTHING
  RETURNING *
`;

const SELECT_BY_RECOGNITION_ID = `SELECT * FROM diary_entry WHERE recognition_id = $1`;

/**
 * ЕДИНСТВЕННЫЙ путь записи `diary_entry` в этом каталоге: проверяет согласие ПЕРЕД `INSERT`,
 * в ОДНОЙ транзакции с блокировкой строки владельца, и никогда после. Обход этой функции — тот
 * самый обход границы, который стережёт `enforce-before-diary-write.ts`
 * (AC-consent-and-telegram-auth-11: «в том числе гипотетический прямой вызов репозитория, минуя
 * маршрут»).
 */
export async function createDiaryEntryGuarded(pool: DbPool, input: CreateDiaryEntryInput): Promise<CreateDiaryEntryResult> {
  return withTransaction(pool, async (client: DbClient) => {
    const enforcement = await enforceConsentBeforeDiaryWrite(client, input.owner);
    if (enforcement.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

    const result = await client.query<DiaryEntryRow>(INSERT_DIARY_ENTRY_SQL, [
      // `enforcement.ownerKey` — КАНОНИЧЕСКИЙ владелец, за которого guard реально проверил
      // согласие (RV-01, четвёртый обзор); НЕ `input.owner.id` — для связанной сессии это разные
      // значения, и запись обязана принадлежать тому, чьё согласие проверено.
      enforcement.ownerKey,
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
    const inserted = result.rows[0];
    if (inserted !== undefined) return { outcome: 'created', entry: inserted };

    // Конфликт по `recognition_id`: строка уже создана РАНЕЕ конкурентным/повторным вызовом.
    // Повторный `confirm` идемпотентен — читаем и возвращаем ту же строку, а не поднимаем ошибку.
    const existing = await client.query<DiaryEntryRow>(SELECT_BY_RECOGNITION_ID, [input.recognitionId]);
    const existingRow = existing.rows[0];
    if (existingRow === undefined) throw new Error('конфликт recognition_id без существующей строки diary_entry');
    return { outcome: 'created', entry: existingRow };
  });
}
