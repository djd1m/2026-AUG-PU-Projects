// Adapted from N2 packages/db/src/migrate.ts: ordered files, checksum journal,
// per-file BEGIN/COMMIT/ROLLBACK. N3a adds full-inventory preflight and bounded lock.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

export const MIGRATION_LOCK = [730_003, 1] as const;
export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));
export interface MigrationOptions {
  databaseUrl: string;
  directory?: string;
  /** Separate disposable migration experiments only; SQL files are not rewritten. */
  schema?: string;
  lockTimeoutMs?: number;
}
interface MigrationFile { filename: string; checksum: string; sql: string }
async function inventory(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter((e) => e.name.endsWith('.sql'));
  if (!names.length || names.some((e) => !e.isFile())) throw new Error('invalid_migration_inventory');
  return Promise.all(names.sort((a, b) => a.name < b.name ? -1 : 1).map(async (entry) => {
    const bytes = await readFile(path.join(directory, entry.name));
    return { filename: entry.name, checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') };
  }));
}
async function prepareJournal(client: pg.Client, schema: string, table: string): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
    filename text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'schema_migrations' ORDER BY ordinal_position`, [schema],
  );
  const signature = rows.map((r) => `${r.column_name}:${r.data_type}:${r.is_nullable}`).join('|');
  if (signature !== 'filename:text:NO|checksum:text:NO|applied_at:timestamp with time zone:NO') {
    throw new Error('incompatible_migration_journal');
  }
  const constraints = await client.query<{ kind: string; definition: string }>(
    'SELECT contype AS kind, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass',
    [table],
  );
  if (!constraints.rows.some((r) => r.kind === 'p' && r.definition === 'PRIMARY KEY (filename)') ||
      !constraints.rows.some((r) => r.kind === 'c' && r.definition.includes("checksum ~ '^[0-9a-f]{64}$'"))) {
    throw new Error('incompatible_migration_journal');
  }
}
export async function runMigrations(options: MigrationOptions): Promise<{ applied: string[]; skipped: string[] }> {
  if (!options.databaseUrl) throw new Error('DATABASE_URL_MIGRATE_required');
  const schema = options.schema ?? 'n3a';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('invalid_migration_schema');
  const budget = options.lockTimeoutMs ?? 5_000;
  if (!Number.isFinite(budget) || budget <= 0 || budget > 5_000) throw new Error('invalid_lock_budget');
  const files = await inventory(options.directory ?? MIGRATIONS_DIRECTORY);
  const table = `"${schema}"."schema_migrations"`;
  const client = new pg.Client({ connectionString: options.databaseUrl,
    connectionTimeoutMillis: 1_000, statement_timeout: 5_000, lock_timeout: 1_000,
    application_name: 'n3a-migrator' });
  let connected = false;
  let locked = false;
  try {
    await client.connect(); connected = true;
    const deadline = performance.now() + budget;
    while (!locked) {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1, $2) AS locked', [...MIGRATION_LOCK]);
      locked = result.rows[0]?.locked === true;
      if (!locked) {
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw new Error('migration_lock_timeout');
        await delay(Math.min(25, remaining));
      }
    }
    await prepareJournal(client, schema, table);
    const appliedRows = await client.query<{ filename: string; checksum: string }>(`SELECT filename, checksum FROM ${table}`);
    const applied = new Map(appliedRows.rows.map((r) => [r.filename, r.checksum]));
    const local = new Map(files.map((f) => [f.filename, f]));
    // Validate ALL history before the first new SQL, including missing later files.
    for (const [filename, checksum] of applied) {
      if (!local.has(filename)) throw new Error('missing_applied_migration');
      if (local.get(filename)?.checksum !== checksum) throw new Error('changed_applied_migration');
    }
    const result: { applied: string[]; skipped: string[] } = { applied: [], skipped: [] };
    for (const file of files) {
      if (applied.has(file.filename)) { result.skipped.push(file.filename); continue; }
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(`INSERT INTO ${table}(filename, checksum) VALUES ($1, $2)`, [file.filename, file.checksum]);
        await client.query('COMMIT');
        result.applied.push(file.filename);
      } catch {
        await client.query('ROLLBACK');
        throw new Error('migration_apply_failed');
      }
    }
    return result;
  } finally {
    try { if (connected && locked) await client.query('SELECT pg_advisory_unlock($1, $2)', [...MIGRATION_LOCK]); }
    finally { await client.end(); }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).length) {
    console.error('migration_arguments_unsupported'); process.exitCode = 1;
  } else {
    runMigrations({ databaseUrl: process.env.DATABASE_URL_MIGRATE ?? '' }).then((result) => {
      console.log(JSON.stringify({ applied: result.applied, skipped: result.skipped }));
    }).catch(() => { console.error('migration_failed'); process.exitCode = 1; });
  }
}
