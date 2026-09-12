// Раннер миграций (FR-foundation-3).
//
// Происхождение: форма журнала с контрольной суммой и «одна транзакция на файл» взята из
// projects/03a-affiliate-rewardful/packages/db/src/migrate.ts и переписана под N4
// (роль n4_migrate через SET ROLE, журнал schema_migration(version, …), проверка
// однозначности номера). Импорта чужого проекта в рантайме нет.
//
// Свойства, которые обязаны выполняться:
//   * файлы применяются по ВОЗРАСТАНИЮ номера, и два файла с одним номером — ошибка ДО
//     применения: порядок обязан быть однозначным, а не «как отсортировалось»;
//   * повторный прогон применяет НОЛЬ файлов и завершается кодом 0;
//   * изменённый после применения файл — ОШИБКА с названной версией. Молчаливое
//     переприменение запрещено: оно означало бы, что схема и журнал разошлись;
//   * DDL выполняет роль n4_migrate. Подключение идёт под n4_admin (единственная учётная
//     запись в docker-compose.yml), и раннер делает SET ROLE — четвёртый секрет ради
//     названия роли не заводится.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));
/** Владелец схемы. DDL выполняется только из-под него. */
export const MIGRATION_ROLE = 'n4_migrate';
const ADVISORY_LOCK = [740_004, 1] as const;

export interface MigrationOptions {
  readonly databaseUrl: string;
  readonly directory?: string;
  readonly role?: string;
}

export interface MigrationResult {
  readonly applied: string[];
  readonly skipped: string[];
}

interface MigrationFile {
  readonly version: number;
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

/** Имя файла обязано начинаться с номера: `001_init.sql`. Иначе порядок не определён. */
export async function inventory(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));
  if (sqlFiles.length === 0) throw new Error(`каталог миграций пуст: ${directory}`);

  const files: MigrationFile[] = [];
  const seen = new Map<number, string>();
  for (const entry of sqlFiles) {
    const match = /^(\d+)_[A-Za-z0-9._-]+\.sql$/.exec(entry.name);
    if (!match || match[1] === undefined) {
      throw new Error(`имя файла миграции не начинается с номера: ${entry.name}`);
    }
    const version = Number.parseInt(match[1], 10);
    const duplicate = seen.get(version);
    if (duplicate !== undefined) {
      // Два файла с одним номером — ошибка ДО применения, а не «применим оба как-нибудь».
      throw new Error(`два файла миграции с номером ${version}: ${duplicate} и ${entry.name}`);
    }
    seen.set(version, entry.name);
    const bytes = await readFile(path.join(directory, entry.name));
    files.push({
      version,
      filename: entry.name,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      sql: bytes.toString('utf8'),
    });
  }
  return files.sort((a, b) => a.version - b.version);
}

export async function runMigrations(options: MigrationOptions): Promise<MigrationResult> {
  if (!options.databaseUrl || options.databaseUrl.trim() === '') {
    // Недоступность источника истины — отказ, а не «наверное, схема уже есть».
    throw new Error('DATABASE_URL не задан: применять миграции некуда');
  }
  const role = options.role ?? MIGRATION_ROLE;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error(`недопустимое имя роли миграций: ${role}`);
  const files = await inventory(options.directory ?? MIGRATIONS_DIRECTORY);

  const client = new pg.Client({
    connectionString: options.databaseUrl,
    connectionTimeoutMillis: 5_000,
    application_name: 'n4-migrator',
  });
  await client.connect();
  let locked = false;
  try {
    // Один раннер за раз: два параллельных прогона применили бы один файл дважды.
    await client.query('SELECT pg_advisory_lock($1, $2)', [...ADVISORY_LOCK]);
    locked = true;
    await client.query(`SET ROLE ${role}`);

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      version     integer PRIMARY KEY,
      filename    text        NOT NULL,
      checksum    text        NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`);

    const journal = await client.query<{ version: number; filename: string; checksum: string }>(
      'SELECT version, filename, checksum FROM schema_migration',
    );
    const applied = new Map(journal.rows.map((row) => [row.version, row]));
    const local = new Map(files.map((file) => [file.version, file]));

    // Вся история проверяется ДО первого нового файла: расхождение в старом файле
    // означает, что схема уже не та, о которой говорит журнал.
    for (const [version, row] of applied) {
      const file = local.get(version);
      if (file === undefined) throw new Error(`применённая миграция ${row.filename} (версия ${version}) отсутствует в каталоге`);
      if (file.checksum !== row.checksum) {
        throw new Error(`файл миграции ${file.filename} (версия ${version}) изменён после применения: контрольная сумма не совпала`);
      }
    }

    const result: MigrationResult = { applied: [], skipped: [] };
    for (const file of files) {
      if (applied.has(file.version)) {
        result.skipped.push(file.filename);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO schema_migration (version, filename, checksum) VALUES ($1, $2, $3)', [
          file.version,
          file.filename,
          file.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`миграция ${file.filename} не применена: ${(error as Error).message}`);
      }
      result.applied.push(file.filename);
    }
    return result;
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1, $2)', [...ADVISORY_LOCK]);
    } finally {
      await client.end();
    }
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrations({ databaseUrl: process.env.DATABASE_URL ?? '' })
    .then((result) => {
      console.log(JSON.stringify({ applied: result.applied, skipped: result.skipped }));
    })
    .catch((error: unknown) => {
      console.error(`миграции не применены: ${(error as Error).message}`);
      process.exitCode = 1;
    });
}
