// ComputeSoftStreak (FR-diary-and-streak-7, AC-diary-and-streak-15, AC-diary-and-streak-16).
//
// Идёт НАЗАД от сегодняшнего дня (`Europe/Moscow`, передаётся вызывающим — этот модуль сам времени
// не знает, только считает). Один пропущенный день НЕ обнуляет счёт и попадает в `frozen_days`;
// ДВА пропущенных подряд обрывают счёт на этом месте (root `Pseudocode.md`, `ComputeSoftStreak`).
//
// Изолированность одиночного пропуска проверяется ЗАГЛЯДЫВАНИЕМ на один день дальше в прошлое:
// если более старый день ТОЖЕ пуст, это уже начало пробега из двух — счёт обрывается ПРЯМО на
// текущем дне, а не «замораживается» задним числом (иначе AC-diary-and-streak-16, два пропуска
// подряд без записей вообще перед ними, ошибочно дал бы `frozen_days` вместо немедленного обрыва).

import type { DbClient, DbPool } from '@n4/db';

export interface StreakResult {
  readonly days: number;
  readonly frozenDays: readonly string[];
}

const WINDOW_DAYS = 60;

const SELECT_RECENT_DAYS = `
  SELECT DISTINCT eaten_on FROM diary_entry
  WHERE owner_key = $1 AND deleted_at IS NULL AND eaten_on >= $2::date AND eaten_on <= $3::date
`;

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Вычитание календарных суток на строке `YYYY-MM-DD` — чистая арифметика, без часового пояса. */
export function subtractDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  const at = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - days));
  return at.toISOString().slice(0, 10);
}

export async function computeSoftStreak(executor: DbPool | DbClient, ownerKey: string, today: string): Promise<StreakResult> {
  const windowStart = subtractDays(today, WINDOW_DAYS);
  const result = await executor.query<{ eaten_on: Date | string }>(SELECT_RECENT_DAYS, [ownerKey, windowStart, today]);
  const withEntries = new Set(result.rows.map((row) => toIsoDate(row.eaten_on)));

  let days = 0;
  const frozenDays: string[] = [];
  let offset = 0;

  while (offset < WINDOW_DAYS) {
    const current = subtractDays(today, offset);
    if (withEntries.has(current)) {
      days += 1;
      offset += 1;
      continue;
    }
    // Текущий день пуст: заглядываем на один день СТАРШЕ, чтобы отличить изолированный
    // пропуск (можно заморозить и продолжить) от начала пробега из двух (обрыв здесь и сейчас).
    const older = subtractDays(today, offset + 1);
    if (offset + 1 < WINDOW_DAYS && withEntries.has(older)) {
      frozenDays.push(current);
      offset += 1;
      continue;
    }
    break;
  }

  return { days, frozenDays };
}
