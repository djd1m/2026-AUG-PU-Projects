import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
export const migrationDirectory = path.resolve(process.env.N8_MIGRATIONS_DIR ?? path.join(process.cwd(), 'packages/db/src/migrations'));
export async function migrationFiles(directory = migrationDirectory) {
  const names = (await readdir(directory)).filter(name => /^\d+[-\w]*\.sql$/.test(name)).sort();
  return Promise.all(names.map(async name => { const sql = await readFile(`${directory}/${name}`, 'utf8'); return {name,sql,sha:createHash('sha256').update(sql).digest('hex')}; }));
}
export async function schemaReady(pool: Pool): Promise<boolean> {
  try { const expected = await migrationFiles(); const {rows} = await pool.query<{name:string;sha:string}>('SELECT name,sha FROM _schema_migration ORDER BY name');
    return rows.length===expected.length && expected.every((file,i)=>rows[i]?.name===file.name && rows[i]?.sha===file.sha);
  } catch { return false; }
}
