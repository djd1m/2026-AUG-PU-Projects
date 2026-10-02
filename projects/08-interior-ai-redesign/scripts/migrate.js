import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../web/config.js';
import { createPool, transaction } from '../web/db.js';
export async function migrate(pool) {
  const sql = await readFile(new URL('../db/001-foundation.sql', import.meta.url), 'utf8');
  await transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(801001)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migration(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = await client.query('SELECT version FROM schema_migration WHERE version=1');
    if (!applied.rowCount) { await client.query(sql); await client.query('INSERT INTO schema_migration(version) VALUES(1)'); }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try { pool = createPool(readConfig().databaseUrl); await migrate(pool); console.log('migration_complete'); }
  catch { console.error('migration_failed'); process.exitCode = 1; }
  finally { await pool?.end(); }
}
