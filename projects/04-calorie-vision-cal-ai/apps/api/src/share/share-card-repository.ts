// Заглушка-репозиторий карточки (03_architecture.md; FR-consent-and-telegram-auth-7, канон
// маршрут 5 `POST /api/v1/share-cards`, отказ `403 consent_required`). `scan-pipeline`
// подключится к этой функции, а не реализует свою проверку согласия — та же граница, что и
// у дневника (`enforce-before-diary-write.ts`).
//
// Правка по review-report.md RV-consent-and-telegram-auth-08 — та же, что в
// `diary-entry-repository.ts`: `ownerKey` больше не принимается отдельно (всегда `owner.id`),
// проверка согласия и `INSERT` — в одной транзакции с блокировкой строки владельца.
//
// Правка RV-consent-and-telegram-auth-01 (четвёртый обзор): `INSERT` пишет
// `enforcement.ownerKey` (канонический владелец, за которым `enforceConsentBeforeDiaryWrite`
// реально снял блокировку), а не `input.owner.id` — для связанной сессии это разные значения.
//
// Правка фичи `share-card-and-growth-events` (FR-9, AC-12, AC-17):
//   1. `badgeRendered` добавлен как параметр INSERT (тариф fail-closed, FR-3) — заполнялся
//      дефолтом `false` в заглушке, что нарушало fail-closed для анонимных владельцев.
//   2. `ON CONFLICT (recognition_id) DO NOTHING RETURNING id` — вторая линия защиты ПРОТИВ
//      гонки ДВУХ одновременных вызовов на один `recognition_id`: `UNIQUE` из миграции 007
//      делает конфликт возможным, и без `ON CONFLICT` он выбросил бы исключение клиенту
//      вместо идемпотентного `outcome: 'existing'` (AC-17 — 20 одновременных вызовов, ни
//      один не завершается неучтённой ошибкой). Проигравшая гонку транзакция читает
//      существующую строку ВНУТРИ ТОЙ ЖЕ транзакции (видит уже закоммиченную соседку —
//      она успела закоммититься раньше, иначе UNIQUE не сработал бы).
//   3. Порядок «блокировка строки владельца ПЕРВЫМ оператором, ДО решения» уже обеспечен
//      самой `enforceConsentBeforeDiaryWrite` (её `SELECT … FOR UPDATE` — первый оператор
//      этой транзакции) — Стык 2 закрыт ПЕРЕИСПОЛЬЗОВАНИЕМ уже дважды проверенного ревью
//      порядка (`account-delete.ts` RV-03: тот же лок, тот же порядок, симметрично
//      закрывает гонку с обеих сторон), а не повторной реализацией блокировки. Возврат
//      `refused` БЕЗ создания строки (а не «родить уже закрытой») — сознательное отклонение
//      от буквы `02_pseudocode.md` шага 8: чужая граница уже устроена как «отказ = ничего не
//      создано», и вводить для share_card второй, более сложный контракт (роутер отличает
//      403-с-фактически-созданной-строкой от 403-без-строки) не даёт дополнительной
//      гарантии — атомарность относительно отзыва обеспечивает ЛОК, а не форма ответа.

import { withTransaction, type DbPool } from '@n4/db';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';

export type CreateShareCardResult =
  | { readonly outcome: 'created'; readonly id: string }
  | { readonly outcome: 'existing'; readonly id: string }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' };

export interface CreateShareCardInput {
  readonly owner: ConsentOwnerRef;
  readonly recognitionId: string;
  readonly objectKey: string;
  readonly badgeRendered: boolean;
}

const INSERT_SHARE_CARD_SQL = `
  INSERT INTO share_card (owner_key, recognition_id, object_key, badge_rendered)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (recognition_id) DO NOTHING
  RETURNING id
`;

const SELECT_EXISTING_BY_RECOGNITION_SQL = `SELECT id FROM share_card WHERE recognition_id = $1`;

export async function createShareCardGuarded(pool: DbPool, input: CreateShareCardInput): Promise<CreateShareCardResult> {
  return withTransaction(pool, async (client) => {
    const enforcement = await enforceConsentBeforeDiaryWrite(client, input.owner);
    if (enforcement.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

    const result = await client.query<{ id: string }>(INSERT_SHARE_CARD_SQL, [
      enforcement.ownerKey,
      input.recognitionId,
      input.objectKey,
      input.badgeRendered,
    ]);
    const row = result.rows[0];
    if (row !== undefined) return { outcome: 'created', id: row.id };

    // Проиграли гонку `ON CONFLICT DO NOTHING` — строка уже существует (создана конкурентным
    // вызовом, закоммиченным раньше, чем этот дошёл до INSERT). Читаем её ВНУТРИ транзакции,
    // не создаём вторую и не теряем клиента без ответа (AC-17).
    const existing = await client.query<{ id: string }>(SELECT_EXISTING_BY_RECOGNITION_SQL, [input.recognitionId]);
    const existingRow = existing.rows[0];
    if (existingRow === undefined) throw new Error('конфликт уникальности без существующей строки share_card');
    return { outcome: 'existing', id: existingRow.id };
  });
}
