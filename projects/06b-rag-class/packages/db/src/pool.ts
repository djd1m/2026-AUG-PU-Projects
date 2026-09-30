import pg from 'pg';

// Пул: 10 соединений, получение соединения не дольше 5 с (Architecture → Scalability): недоступность БД — отказ,
// а не вечное ожидание (shared-resource-verification: pg.Pool без таймаута ждёт бесконечно).
export const POOL_MAX = 10;
export const POOL_CONNECT_TIMEOUT_MS = 5000;

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

/** Пул на ОДНОГО пользователя входа: кабинет (n6b_app_tenant) и служебные пути (n6b_app_service) — разные пулы. */
export function createPool(connectionString: string, name = 'DATABASE_URL'): pg.Pool {
  if (!connectionString) throw new Error(`${name} не задан: приложение не может обратиться к БД`);
  return new pg.Pool({
    connectionString,
    max: POOL_MAX,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
  });
}
