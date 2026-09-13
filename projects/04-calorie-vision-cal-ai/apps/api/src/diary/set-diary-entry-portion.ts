// SetDiaryEntryPortion (FR-diary-and-streak-3, NFR-diary-and-streak-1,
// AC-diary-and-streak-6/7/8/11).
//
// Владение проверяется в `WHERE` чтения — чужая и несуществующая запись дают ОДИН и тот же 404,
// `403` этот маршрут не возвращает никогда. Валидация ЦЕЛИКОМ ПЕРЕД записью: граница входа не
// пишет ничего, пока обе проверки (индекс, масса) не пройдены (`02_pseudocode.md`,
// `SetDiaryEntryPortion`).
//
// Правка RV-diary-and-streak-03 (review-report.md): чтение (`SELECT`) и запись (`UPDATE`)
// раньше были ДВУМЯ отдельными операциями БЕЗ блокировки строки между ними. Два конкурентных
// `set_portion` на РАЗНЫЕ индексы ОДНОЙ записи оба читали один и тот же старый `items`, каждый
// правил свой индекс в СВОЕЙ копии массива и записывал её ЦЕЛИКОМ — второй `UPDATE` (условие
// `WHERE` совпадает, `deleted_at IS NULL` не спасает) МОЛЧА затирал правку первого, откатывая
// СОСЕДНЮЮ позицию к старой массе. Теперь чтение и запись — В ОДНОЙ транзакции, чтение — с
// `SELECT … FOR UPDATE`: вторая конкурентная правка ждёт коммита первой и потому читает УЖЕ
// обновлённый массив, применяя свою правку поверх него, а не поверх устаревшего снимка
// (`.claude/rules/shared-resource-verification.md`: «правка проверяется на разделяемом
// ресурсе», здесь разделяемый ресурс — сама строка `diary_entry`, а не пул или блокировка).

import { withTransaction, type DbClient, type DbPool } from '@n4/db';
import { isValidItemIndex, isValidPortionMassG } from './portion-bounds.js';
import { applyMassToItem, recomputeEntryTotals, type RawItem } from './recompute-entry-from-snapshot.js';
import { recomputeDayTotals, type DayTotalsResult } from './day-totals.js';
import type { DiaryEntryRow } from './diary-entry-repository.js';

export type SetDiaryEntryPortionResult =
  | { readonly outcome: 'updated'; readonly entry: DiaryEntryRow; readonly totals: DayTotalsResult }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'already_deleted' }
  | { readonly outcome: 'invalid'; readonly code: 'portion_out_of_range' | 'index_out_of_range' };

// `FOR UPDATE` — вторая конкурентная правка ЭТОЙ ЖЕ строки ждёт здесь коммита первой, а не
// читает параллельно с ней (RV-diary-and-streak-03, шапка файла).
const SELECT_OWNED_ENTRY_FOR_UPDATE = `SELECT * FROM diary_entry WHERE id = $1 AND owner_key = $2 AND deleted_at IS NULL FOR UPDATE`;

const UPDATE_ENTRY = `
  UPDATE diary_entry
  SET items = $3::jsonb, kcal_total = $4, protein_total = $5, fat_total = $6, carb_total = $7, user_corrected = true
  WHERE id = $1 AND owner_key = $2 AND deleted_at IS NULL
  RETURNING *
`;

// Гонка с конкурентным `delete` (AC-diary-and-streak-17, `.claude/rules/shared-resource-
// verification.md`): различаем ПОВТОРНЫМ чтением по `id` БЕЗ условия `owner_key` — только
// факт «была удалена», без раскрытия чужого содержимого. На шаге чтения выше запись СУЩЕСТВОВАЛА
// у ЭТОГО владельца, поэтому здесь возможен только один исход — `409`, никогда «чужая».
const SELECT_DELETED_AT = `SELECT deleted_at FROM diary_entry WHERE id = $1`;

export interface SetDiaryEntryPortionDeps {
  readonly pool: DbPool;
  readonly ownerKey: string;
  readonly entryId: string;
  readonly index: unknown;
  readonly massG: unknown;
}

export async function setDiaryEntryPortion(deps: SetDiaryEntryPortionDeps): Promise<SetDiaryEntryPortionResult> {
  return withTransaction(deps.pool, async (client: DbClient) => {
    const existingResult = await client.query<DiaryEntryRow>(SELECT_OWNED_ENTRY_FOR_UPDATE, [deps.entryId, deps.ownerKey]);
    const existing = existingResult.rows[0];
    if (existing === undefined) return { outcome: 'not_found' };

    const items = Array.isArray(existing.items) ? (existing.items as RawItem[]) : [];
    if (!isValidItemIndex(deps.index, items.length)) return { outcome: 'invalid', code: 'index_out_of_range' };
    if (!isValidPortionMassG(deps.massG)) return { outcome: 'invalid', code: 'portion_out_of_range' };

    const index = deps.index;
    const massG = deps.massG;
    const snapshots = Array.isArray(existing.source_snapshot) ? (existing.source_snapshot as Array<RawItem | null>) : [];
    const updatedItems = items.map((item, position) => (position === index ? applyMassToItem(item, massG, snapshots[position] ?? null) : item));
    const totals = recomputeEntryTotals(updatedItems, snapshots);

    const updateResult = await client.query<DiaryEntryRow>(UPDATE_ENTRY, [
      deps.entryId,
      deps.ownerKey,
      JSON.stringify(updatedItems),
      totals.kcal,
      totals.protein,
      totals.fat,
      totals.carb,
    ]);
    const updated = updateResult.rows[0];
    if (updated === undefined) {
      // Строка держалась под `FOR UPDATE` этой же транзакцией — 0 затронутых строк здесь
      // означает ТОЛЬКО «удалена конкурентно между чтением и этим UPDATE», условие владения не
      // изменится: на шаге чтения выше запись УЖЕ существовала у ЭТОГО владельца.
      const check = await client.query<{ deleted_at: Date | null }>(SELECT_DELETED_AT, [deps.entryId]);
      const row = check.rows[0];
      if (row !== undefined && row.deleted_at !== null) return { outcome: 'already_deleted' };
      return { outcome: 'not_found' };
    }

    const dayTotals = await recomputeDayTotals(client, updated.owner_key, updated.eaten_on);
    return { outcome: 'updated', entry: updated, totals: dayTotals };
  });
}
