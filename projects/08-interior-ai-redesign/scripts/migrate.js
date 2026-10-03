import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../web/config.js';
import { createPool, transaction } from '../web/db.js';
export async function migrate(pool) {
  const migrations = await Promise.all(['001-foundation.sql','002-generation.sql','003-quality.sql','004-payments.sql','005-attribution.sql','006-sharing.sql','007-replicate.sql'].map(file=>readFile(new URL('../db/'+file, import.meta.url),'utf8')));
  await transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(801001)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migration(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (let index=0;index<migrations.length;index++) {
      const version=index+1;
      const applied = await client.query('SELECT version FROM schema_migration WHERE version=$1',[version]);
      if (!applied.rowCount) { await client.query(migrations[index]); await client.query('INSERT INTO schema_migration(version) VALUES($1)',[version]); }
    }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try { pool = createPool(readConfig().databaseUrl); await migrate(pool); console.log('migration_complete'); }
  catch { console.error('migration_failed'); process.exitCode = 1; }
  finally { await pool?.end(); }
}
