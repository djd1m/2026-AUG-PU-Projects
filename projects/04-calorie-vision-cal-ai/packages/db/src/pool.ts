// Единственный пул соединений на процесс.
//
// Пул создаётся ОДИН раз при старте процесса: экземпляр на запрос обнуляет и лимит
// соединений, и смысл самого пула. `connectionTimeoutMillis` обязателен — `pg.Pool` без
// него ждёт БЕСКОНЕЧНО, и недоступность базы становится отказом без сигнала
// (`fail-closed-defaults`, `shared-resource-verification`).

import pg from 'pg';

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

export interface PoolOptions {
  readonly databaseUrl: string;
  readonly applicationName: string;
  readonly max?: number;
  readonly connectionTimeoutMillis?: number;
  readonly statementTimeoutMillis?: number;
}

export function createPool(options: PoolOptions): DbPool {
  if (!options.databaseUrl || options.databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL не задан: пул соединений не создаётся');
  }
  return new pg.Pool({
    connectionString: options.databaseUrl,
    application_name: options.applicationName,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: options.statementTimeoutMillis ?? 10_000,
  });
}

/**
 * Транзакция с гарантированным откатом. Отказ ВНУТРИ колбэка обязан быть исключением:
 * штатный возврат из колбэка КОММИТИТ транзакцию вместе со всем, что успело записаться
 * до неудачной проверки (`security-operation-order` — заслуженный дефект потери оплаты).
 */
export async function withTransaction<T>(pool: DbPool, work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let value: T;
    try {
      value = await work(client);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    await client.query('COMMIT');
    return value;
  } finally {
    client.release();
  }
}
