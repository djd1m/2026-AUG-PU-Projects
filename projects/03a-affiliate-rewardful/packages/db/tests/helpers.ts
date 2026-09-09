import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createRuntimePool } from '../src/pool';
import { runMigrations } from '../src/migrate';

export function testUrls(): { app: string; migrate: string } {
  const app = process.env.TEST_DATABASE_URL;
  const migrate = process.env.TEST_DATABASE_URL_MIGRATE;
  if (!app || !migrate) throw new Error('Integration requires explicit disposable TEST_DATABASE_URL and TEST_DATABASE_URL_MIGRATE; no skip or fallback');
  if (app === migrate || new URL(app).username !== 'n3a_app' || new URL(migrate).username !== 'n3a_migrator') {
    throw new Error('Integration requires distinct actual n3a_app and n3a_migrator roles');
  }
  return { app, migrate };
}
export function fixturePools() {
  const urls = testUrls();
  const app = createRuntimePool(urls.app);
  const migrate = new pg.Pool({ connectionString: urls.migrate, max: 4,
    connectionTimeoutMillis: 1_000, statement_timeout: 5_000, lock_timeout: 1_000 });
  return { app, migrate, urls };
}
export async function migrateFixture(): Promise<void> { await runMigrations({ databaseUrl: testUrls().migrate }); }
export async function createUser(pool: pg.Pool, passwordHash: string, enabled = true) {
  const id = randomUUID(); const identityHash = randomBytes(32);
  await pool.query('INSERT INTO n3a.users(id, identity_hash, password_hash, enabled) VALUES ($1,$2,$3,$4)',
    [id, identityHash, passwordHash, enabled]);
  return { id, identityHash, passwordHash };
}
export async function removeUsers(pool: pg.Pool, ids: string[]): Promise<void> {
  await pool.query('DELETE FROM n3a.sessions WHERE user_id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM n3a.users WHERE id = ANY($1::uuid[])', [ids]);
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
