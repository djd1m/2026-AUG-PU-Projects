// Пул кабинета. Роль app_owner — под RLS.
import pg from 'pg';
import type { PoolClient } from 'pg';

function intFromEnv(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined || r === '') return d;
  const v = Number(r);
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${n}=${JSON.stringify(r)} — ожидается целое положительное`);
  return v;
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_OWNER,
  max: intFromEnv('PGPOOL_MAX', 10),
  connectionTimeoutMillis: intFromEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 2000),
});

/**
 * ЕДИНСТВЕННЫЙ способ выполнить запрос от имени арендатора.
 *
 * SET LOCAL живёт внутри транзакции: соединение, вернувшись в пул, не несёт чужого
 * контекста. Выполнять владельческие запросы МИМО этой обёртки нельзя — без контекста
 * RLS вернёт пустоту, и это правильный отказ, а не удобный обход.
 */
export async function withAccount<T>(accountId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Идентификатор приходит из ПРОВЕРЕННОЙ сессии, не из запроса клиента. Параметром,
    // а не конкатенацией — хоть это и uuid из нашей же базы.
    await client.query("select set_config('app.current_account_id', $1, true)", [accountId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> { await pool.end(); }
