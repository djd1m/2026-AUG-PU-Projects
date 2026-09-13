// DeleteDiaryEntry (FR-diary-and-streak-4, AC-diary-and-streak-9/10/17).
//
// Мягкое удаление и пересчёт итога дня — В ОДНОЙ транзакции: удалённая запись обязана исчезнуть
// из итога одновременно с исчезновением из списка (`.claude/rules/deployment-seams.md`, стык
// модулей, а не отдельная гарантия).

import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import { recomputeDayTotals, type DayTotalsResult } from './day-totals.js';

export type DeleteDiaryEntryResult =
  | { readonly outcome: 'deleted'; readonly totals: DayTotalsResult }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'already_deleted' };

const DELETE_ENTRY = `
  UPDATE diary_entry SET deleted_at = now()
  WHERE id = $1 AND owner_key = $2 AND deleted_at IS NULL
  RETURNING owner_key, eaten_on
`;

// Ноль затронутых строк означает ОДИН из двух случаев (02_pseudocode.md, DeleteDiaryEntry
// шаг 3): строка чужая/не существует, ЛИБО уже удалена. Различаем ВТОРЫМ чтением по `id` БЕЗ
// условия владения — только факт существования, не раскрывая чужому содержимое.
const SELECT_EXISTS = `SELECT owner_key, deleted_at FROM diary_entry WHERE id = $1`;

export async function deleteDiaryEntry(pool: DbPool, entryId: string, ownerKey: string): Promise<DeleteDiaryEntryResult> {
  return withTransaction(pool, async (client: DbClient) => {
    const result = await client.query<{ owner_key: string; eaten_on: string }>(DELETE_ENTRY, [entryId, ownerKey]);
    const row = result.rows[0];
    if (row === undefined) {
      const check = await client.query<{ owner_key: string; deleted_at: Date | null }>(SELECT_EXISTS, [entryId]);
      const existing = check.rows[0];
      if (existing === undefined || existing.owner_key !== ownerKey) return { outcome: 'not_found' as const };
      return { outcome: 'already_deleted' as const };
    }
    // Пересчёт В ТОЙ ЖЕ транзакции: коммит `deleted_at` и коммит наблюдаемого итога — ОДНО
    // событие, не два последовательных (иначе последующий GET в узком окне увидел бы старый итог
    // при уже удалённой записи — ровно тот стык, который правило деплой-швов запрещает).
    const totals = await recomputeDayTotals(client, row.owner_key, row.eaten_on);
    return { outcome: 'deleted' as const, totals };
  });
}
