import pg from 'pg';

// Пул: 10 соединений, получение соединения не дольше 5 с (Architecture → Scalability): недоступность БД — отказ,
// а не вечное ожидание (shared-resource-verification: pg.Pool без таймаута ждёт бесконечно).
export const POOL_MAX = 10;
export const POOL_CONNECT_TIMEOUT_MS = 5000;

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL не задан: приложение не может обратиться к БД');
  return new pg.Pool({
    connectionString,
    max: POOL_MAX,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
  });
}
