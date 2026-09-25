// из N5: projects/05-podcast-clips-opus/packages/db/src/migrate.ts — свой номер advisory-lock, текст про 19 сущностей
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPool, type Pool } from './index.js';

export async function migrate(pool: Pool, directory = path.resolve(__dirname, '../migrations')): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(60925001)");
    // Служебный журнал миграций не является двадцатой сущностью продукта (канон §4: 19).
    await client.query('CREATE TABLE IF NOT EXISTS _schema_migration (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(directory)).filter((f) => /^\d+_[a-z0-9_]+\.sql$/.test(f)).sort()) {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const sha = createHash('sha256').update(sql).digest('hex');
      const old = await client.query<{ sha256: string }>('SELECT sha256 FROM _schema_migration WHERE name = $1', [name]);
      if (old.rows[0]) {
        if (old.rows[0].sha256 !== sha) throw new Error(`Миграция ${name} изменена после применения: схема не воспроизводима`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO _schema_migration (name, sha256) VALUES ($1, $2)', [name, sha]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) throw new Error('DATABASE_URL не задан: миграции не смогут подготовить ограничения базы');
  const pool = createPool(databaseUrl);
  migrate(pool).catch(() => { console.error('Миграция не выполнена: проверьте доступность БД и неизменность применённых SQL'); process.exitCode = 1; })
    .finally(() => pool.end());
}
