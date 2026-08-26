// packages/db/src/migrate.ts
//
// Простой раннер миграций — читает packages/db/migrations/*.sql по порядку имён файлов,
// применяет ещё не применённые в отдельной транзакции каждый, отмечает в служебной таблице
// schema_migrations. Запуск: `npm run migrate --workspace packages/db` (или из корня —
// `npm run db:migrate`, см. package.json репозитория).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL не задан — см. packages/db/README.md и .env.example');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = await client.query<{ filename: string }>(
      'select filename from schema_migrations',
    );
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn(`Нет .sql файлов в ${MIGRATIONS_DIR}`);
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file} (уже применена)`);
        continue;
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`apply ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${file} упала: ${(err as Error).message}`, { cause: err });
      }
    }

    console.log('Миграции применены.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
