import { readFile } from 'node:fs/promises';
import pg from 'pg';
export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 6, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, statement_timeout: 3000, application_name: 'n7f01' });
}
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7, 101)');
    const existing = await client.query("SELECT to_regclass('public.schema_migration') AS present");
    const applied = existing.rows[0]?.present ? await client.query('SELECT version FROM schema_migration WHERE version = 1') : null;
    if (!applied?.rowCount) await client.query(await readFile(new URL('../db/001-init.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function ready(pool: pg.Pool): Promise<boolean> {
  try { return (await pool.query('SELECT version FROM schema_migration WHERE version = 1')).rowCount === 1; } catch { return false; }
}
