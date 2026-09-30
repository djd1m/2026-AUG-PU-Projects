// Раннер миграций (перенос N1 packages/db/src/migrate.ts, адаптирован): применяет migrations/*.sql по имени, каждую
// в своей транзакции, под advisory-блокировкой (два одновременных migrate не применяют одну миграцию дважды).
// В конце ставит пароль роли приложения n6b_app из N6B_DB_APP_PASSWORD — пароль не печатается и не попадает в журнал.
// Запуск: DATABASE_URL_OWNER=… N6B_DB_APP_PASSWORD=… node packages/db/dist/migrate.js

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const LOCK_KEY = 6_020_930; // произвольная константа advisory-блокировки миграций N6b

export interface MigrateOptions {
  ownerUrl: string;
  appPassword: string;
  log?: (line: string) => void;
}

export async function migrate({ ownerUrl, appPassword, log = console.log }: MigrateOptions): Promise<string[]> {
  if (!ownerUrl) throw new Error('DATABASE_URL_OWNER не задан: миграции некуда применять');
  if (!appPassword) throw new Error('N6B_DB_APP_PASSWORD не задан: роль приложения n6b_app не сможет подключиться');
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows
      .map((r) => r.filename));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    if (files.length === 0) throw new Error(`нет миграций в ${MIGRATIONS_DIR}: проверка схемы НЕ выполнена`);
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`миграция ${file} не применена: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file);
      log(`apply ${file}`);
    }
    // ALTER ROLE не принимает bind-параметры: литерал экранирует сама БД через format(%L).
    const { rows } = await client.query<{ sql: string }>(
      "SELECT format('ALTER ROLE n6b_app WITH LOGIN PASSWORD %L', $1::text) AS sql", [appPassword]);
    await client.query(rows[0]!.sql);
    log(`миграции: применено ${applied.length}, всего ${files.length}; роль n6b_app обновлена`);
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  migrate({ ownerUrl: process.env.DATABASE_URL_OWNER ?? '', appPassword: process.env.N6B_DB_APP_PASSWORD ?? '' })
    .catch((error: unknown) => {
      console.error(`migrate: ${(error as Error).message}`);
      process.exitCode = 1;
    });
}
