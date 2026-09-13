// GetDiaryDay (FR-diary-and-streak-5, AC-diary-and-streak-12/13/14).
//
// `owner_key` — ТОЛЬКО из сессии вызывающего; в маршруте нет параметра «чей дневник», и
// попросить чужой дневник нечем (`.claude/rules/security.md`, «Ответ на чужой ресурс»).
// Непригодная/будущая/вне-диапазона дата — `422` БЕЗ подстановки «сегодня»
// (`.claude/rules/fail-closed-defaults.md`).
//
// Правка RV-diary-and-streak-02 (review-report.md): список записей, итог дня и стрик раньше
// читались ТРЕМЯ отдельными вызовами `pool.query` — каждый в своей implicit-транзакции
// PostgreSQL. Конкурентное удаление могло зафиксироваться МЕЖДУ ними: `entries` увидел бы ещё
// не удалённую строку, а `totals` (запрошенный мгновением позже) — уже без неё. Ответ маршрута
// нёс бы удалённую запись В СПИСКЕ и сумму БЕЗ неё — расхождение внутри ОДНОГО ответа. Теперь
// все три чтения выполняются в ОДНОЙ транзакции `REPEATABLE READ READ ONLY` на одном
// соединении: снимок фиксируется на первом запросе транзакции и не меняется до её конца,
// поэтому `entries`, `totals` и `streak` в одном ответе гарантированно согласованы —
// возможно, слегка устаревшие относительно параллельного писателя, но никогда противоречивые
// друг другу (`.claude/rules/deployment-seams.md`: стык между «списком» и «суммой» — тот же
// класс дефекта, что и в самом `delete-diary-entry.ts`, только между МОДУЛЯМИ чтения, а не
// чтением и записью).

import type { DbClient, DbPool } from '@n4/db';
import { moscowDay } from '../quota/keys.js';
import { recomputeDayTotals, type DayTotalsResult } from './day-totals.js';
import { computeSoftStreak, type StreakResult } from './compute-soft-streak.js';
import type { DiaryEntryRow } from './diary-entry-repository.js';

export type GetDiaryDayResult =
  | {
      readonly outcome: 'ok';
      readonly date: string;
      readonly entries: readonly DiaryEntryRow[];
      readonly totals: DayTotalsResult;
      readonly streak: StreakResult;
    }
  | { readonly outcome: 'invalid_date' };

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
/** Нижняя граница диапазона — до запуска продукта разумных записей быть не может. */
const EARLIEST_DATE = '2020-01-01';

const SELECT_DAY_ENTRIES = `
  SELECT * FROM diary_entry WHERE owner_key = $1 AND eaten_on = $2 AND deleted_at IS NULL ORDER BY created_at
`;

/** `2026-13-40` синтаксически проходит `DATE_FORMAT`, но не является календарной датой. */
function isValidCalendarDate(value: string): boolean {
  if (!DATE_FORMAT.test(value)) return false;
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function getDiaryDay(pool: DbPool, ownerKey: string, rawDate: unknown, now: Date = new Date()): Promise<GetDiaryDayResult> {
  // Пустая/непонятная строка НЕ заменяется «сегодня» — отсутствие пригодного значения ЕСТЬ отказ.
  if (typeof rawDate !== 'string' || rawDate.trim() === '' || !isValidCalendarDate(rawDate)) {
    return { outcome: 'invalid_date' };
  }
  const today = moscowDay(now);
  // Сравнение строк `YYYY-MM-DD` лексикографически совпадает с хронологическим порядком.
  if (rawDate > today || rawDate < EARLIEST_DATE) return { outcome: 'invalid_date' };

  // ОДНА транзакция, ОДИН снимок (RV-diary-and-streak-02, шапка файла): `REPEATABLE READ`
  // фиксирует состояние базы на первом запросе транзакции — все три чтения ниже видят РОВНО
  // ту же версию `diary_entry`, независимо от того, что коммитит конкурентный писатель между
  // ними. `READ ONLY` — этот маршрут ничего не пишет, отказ выполнить запись здесь честен.
  const client: DbClient = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const entriesResult = await client.query<DiaryEntryRow>(SELECT_DAY_ENTRIES, [ownerKey, rawDate]);
    const totals = await recomputeDayTotals(client, ownerKey, rawDate);
    const streak = await computeSoftStreak(client, ownerKey, today);
    await client.query('COMMIT');
    return { outcome: 'ok', date: rawDate, entries: entriesResult.rows, totals, streak };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
