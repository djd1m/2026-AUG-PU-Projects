import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { assert, AppError } from '../domain/common.mjs';
import { migration } from './schema.mjs';

export async function databaseConfig(options = {}) {
  let config = options.database ?? (typeof options.databaseUrl === 'object' ? options.databaseUrl : {});
  if (typeof options.databaseUrl === 'string') config = { connectionString: options.databaseUrl, ...config };
  config = { ...config };
  if (!config.password && !config.connectionString) {
    const path = process.env.PGPASSWORD_FILE;
    assert(path, 'DATABASE_SECRET_REQUIRED', 503, 'Не настроен секрет базы данных');
    config.password = (await readFile(path, 'utf8')).trim();
  }
  const password = config.password ?? decodeURIComponent(new URL(config.connectionString).password);
  assert(typeof password === 'string' && password.length >= 24 && !['postgres', 'password', 'n3_app'].includes(password),
    'DATABASE_SECRET_REQUIRED', 503, 'Недопустимый секрет базы данных');
  return { ...config, max: 4, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
    statement_timeout: 5000, lock_timeout: 2000, application_name: 'n3-fixture-api' };
}
export async function openDatabase(options) {
  if (options.schema) assert(/^n3_test_[a-z0-9_]{1,60}$/.test(options.schema));
  const config = await databaseConfig(options);
  if (options.schema) config.options = `-c search_path=${options.schema},public`;
  const pool = new pg.Pool(config);
  // A disconnected idle client must not terminate the process or expose connection details.
  pool.on('error', () => {});
  try {
    await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(330803)');
      if (options.schema) {
        assert(/^n3_test_[a-z0-9_]{1,60}$/.test(options.schema));
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${options.schema}"`);
      }
      await client.query(migration);
    });
  } catch (error) { await pool.end(); throw error; }
  return pool;
}
export async function transaction(pool, operation) {
  let client;
  try {
    client = await pool.connect(); await client.query('BEGIN');
    const result = await operation(client); await client.query('COMMIT'); return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Client release below discards broken connection. */ } }
    if (error instanceof AppError) throw error;
    throw new AppError('DATABASE_UNAVAILABLE', 503, 'Хранилище недоступно; повторите запрос с прежним ключом');
  } finally { client?.release(); }
}
