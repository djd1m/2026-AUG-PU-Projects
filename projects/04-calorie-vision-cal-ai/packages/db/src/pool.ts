// Единственный пул соединений на процесс.
//
// Пул создаётся ОДИН раз при старте процесса: экземпляр на запрос обнуляет и лимит
// соединений, и смысл самого пула. `connectionTimeoutMillis` обязателен — `pg.Pool` без
// него ждёт БЕСКОНЕЧНО, и недоступность базы становится отказом без сигнала
// (`fail-closed-defaults`, `shared-resource-verification`).

import pg from 'pg';

// Колонки `date` (oid 1082, `diary_entry.eaten_on`) БЕЗ этого приходят JS-объектом `Date`,
// сконструированным `pg-types` В ЛОКАЛЬНОЙ таймзоне процесса (`new Date(year, month, day)`).
// Все сервисы этого проекта запускаются с `TZ=Europe/Moscow` (`docker-compose.yml`: `api`,
// `recognizer`, `test`) — то есть такой `Date` представляет МОСКОВСКУЮ полночь. Любое
// последующее `.toISOString()` (а JSON-сериализация ответа маршрута ТОЖЕ вызывает его через
// `Date.prototype.toJSON`) переводит эту полночь в UTC и получает МОСКВА−3ЧАСА = ПРЕДЫДУЩИЕ
// сутки — заслуженный дефект `diary-and-streak`: без этой строки `GET /diary?date=` отдавал бы
// клиенту `eaten_on` на день раньше сохранённого, а `ComputeSoftStreak` сравнивал бы даты,
// молча сдвинутые на сутки назад. Отключаем разбор ЦЕЛИКОМ — весь код проекта уже трактует
// `eaten_on` как строку `YYYY-MM-DD` (`DiaryEntryRow.eaten_on: string`), и получает её отсюда
// без искажения.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

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
