// packages/db/src/rate-limit.ts
//
// Источник: docs/Architecture.md §3.4 (единый помощник на три требования, находка W-1),
// docs/Pseudocode.md §1 ("rateLimitCount(scope,key,window)" — COUNT без побочных эффектов;
// "rateLimitRecord(scope,key)" — INSERT, возвращает id для отката W-5;
// "rateLimitRevoke(id)" — DELETE строки при откате); .claude/rules/security.md §4.
//
// ОДИН механизм на все rate-limit/anti-fraud требования проекта (form_submission,
// signup_via_partner_code, project_created) — coding-style.md §4: "не писать отдельный стор под
// похожую задачу". Новый scope того же класса задачи расширяет `scope`, не добавляет новую таблицу.

import { pool } from './index';

/** Минимальный интерфейс, которому удовлетворяют и `pg.Pool`, и `pg.PoolClient` — позволяет
 * вызывать хелперы либо вне транзакции (по умолчанию — через общий pool), либо внутри уже
 * открытой транзакции (submitTestimonial и т.п. могут захотеть один client на весь запрос). */
export interface Executor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface RateLimitWindow {
  /** длина скользящего окна в секундах, напр. 3600 для "1 час", 600 для "10 минут" */
  seconds: number;
}

/** COUNT без побочных эффектов — сколько событий scope+key за последние window.seconds секунд. */
export async function count(
  scope: string,
  key: string,
  window: RateLimitWindow,
  executor: Executor = pool,
): Promise<number> {
  const { rows } = await executor.query<{ count: string }>(
    `select count(*)::text as count
       from rate_limit_events
      where scope = $1 and key = $2 and created_at > now() - ($3 || ' seconds')::interval`,
    [scope, key, window.seconds],
  );
  return Number(rows[0]?.count ?? 0);
}

/** INSERT — возвращает id новой строки (для возможного отката через revoke, W-5). */
export async function record(scope: string, key: string, executor: Executor = pool): Promise<string> {
  const { rows } = await executor.query<{ id: string }>(
    `insert into rate_limit_events (scope, key) values ($1, $2) returning id::text as id`,
    [scope, key],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error('rate-limit.record: INSERT не вернул id');
  }
  return id;
}

/**
 * DELETE строки при откате. W-5 (Pseudocode §1): единственный легитимный случай — инфраструктурный
 * сбой ПОСЛЕ списания квоты (напр. StorageError при сохранении отзыва), где вины автора запроса нет.
 * НЕ вызывать при обычном отказе валидации — квота должна списываться и за невалидные попытки.
 */
export async function revoke(id: string, executor: Executor = pool): Promise<void> {
  await executor.query(`delete from rate_limit_events where id = $1::bigint`, [id]);
}

/** Удобный помощник: count >= порог. Что делать при exceeded (429, forced_noindex, suspected_fraud)
 * решает вызывающий роут (Architecture §3.4 таблица требований) — не сам помощник. */
export async function exceeded(
  scope: string,
  key: string,
  window: RateLimitWindow,
  threshold: number,
  executor: Executor = pool,
): Promise<boolean> {
  return (await count(scope, key, window, executor)) >= threshold;
}

/**
 * services/worker: очистка строк старше `hours` часов, раз в час (Architecture §3.4 "Очистка" —
 * самый широкий порог среди трёх требований — 1 час, отдельный сервис под TTL не нужен).
 */
export async function cleanupOlderThan(hours: number, executor: Executor = pool): Promise<number> {
  const { rowCount } = await executor.query(
    `delete from rate_limit_events where created_at < now() - ($1 || ' hours')::interval`,
    [hours],
  );
  return rowCount ?? 0;
}
