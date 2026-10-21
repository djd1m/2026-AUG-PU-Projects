import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { freshDb } from '../helpers/db.js';
import { migrate } from '../../packages/db/src/migrate.js';
import { migrationFiles, schemaReady } from '../../packages/db/src/schema.js';
import { checkReady } from '../../apps/web/src/server/health.js';
import { readyHandler } from '../../apps/web/src/server/handlers.js';
import type { Base } from '../../apps/web/src/server/composition.js';

let db: Awaited<ReturnType<typeof freshDb>>, directory: string;
beforeAll(async () => { db = await freshDb(); directory = await mkdtemp(join(tmpdir(), 'n8-operations-')); });
afterAll(async () => { if (db) await db.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
const base = (assetDir: string) => ({ pool: db.pool, config: { assetDir } }) as Base;

describe('AC-integration-4 independent operational rejection probes', () => {
  it('real schema accepts a directory but rejects a file, symlink and absent storage without egress', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    try {
      const file = join(directory, 'file'), link = join(directory, 'link');
      await writeFile(file, 'private'); await symlink(directory, link);
      expect(await checkReady(base(directory))).toBe(true);
      for (const candidate of [file, link, join(directory, 'missing')]) expect(await checkReady(base(candidate))).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it('schema missing/extra/changed migration records fail closed and original records recover', async () => {
    const original = await migrationFiles();
    expect(await schemaReady(db.pool)).toBe(true);
    try {
      await db.pool.query("INSERT INTO _schema_migration(name,sha) VALUES('999-unexpected.sql','untrusted')");
      expect(await schemaReady(db.pool)).toBe(false);
      await db.pool.query("DELETE FROM _schema_migration WHERE name='999-unexpected.sql'");
      await db.pool.query('DELETE FROM _schema_migration WHERE name=$1', [original[0]!.name]);
      expect(await schemaReady(db.pool)).toBe(false);
      await db.pool.query('INSERT INTO _schema_migration(name,sha) VALUES($1,$2)', [original[0]!.name, 'changed']);
      expect(await schemaReady(db.pool)).toBe(false);
    } finally {
      await db.pool.query('INSERT INTO _schema_migration(name,sha) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET sha=EXCLUDED.sha', [original[0]!.name, original[0]!.sha]);
    }
    expect(await schemaReady(db.pool)).toBe(true);
  });

  it('readiness HTTP response redacts a DB failure containing credential and path sentinels', async () => {
    const sentinel = 'DO_NOT_EXPOSE_password_at_private_host';
    const broken = { ...base(directory), pool: { query: async () => { throw new Error(sentinel); } } } as unknown as Base;
    const response = await readyHandler(() => broken)(new Request('http://127.0.0.1/health/ready'));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body).data).toEqual({ status: 'not_ready' }); expect(body).not.toContain(sentinel); expect(body).not.toContain(directory);
  });

  it('actual worker entrypoint refuses invalid configuration with only redacted startup reason', () => {
    const sentinel = 'DO_NOT_EXPOSE_credentials';
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/worker/src/index.ts'], {
      cwd: process.cwd(), timeout: 5000, encoding: 'utf8',
      env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL: `postgresql://test:${sentinel}@127.0.0.1:1/test`, N8_PUBLIC_ORIGIN: 'http://127.0.0.1:3088', N8_SESSION_SECRET: 's'.repeat(32), N8_ASSET_DIR: directory, N8_AI_MODE: 'fake' },
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(result.stdout).toBe(''); expect(result.stderr.trim()).toBe('N8_WORKER_START_OR_LOOP_FAILED');
    expect(result.stderr).not.toContain(sentinel);
  });
});

describe('AC-integration-3 ephemeral PostgreSQL migration recovery', () => {
  it('failed later migration rolls back earlier DDL and migration records atomically', async () => {
    const migrations = join(directory, 'failing-migrations'); await mkdir(migrations);
    await writeFile(join(migrations, '901-first.sql'), 'CREATE TABLE operations_rollback_probe(id integer);');
    await writeFile(join(migrations, '902-fail.sql'), "SELECT 1/0;");
    const before = (await db.pool.query('SELECT name,sha FROM _schema_migration ORDER BY name')).rows;
    await expect(migrate(db.pool, migrations)).rejects.toMatchObject({ code: '22012' });
    expect((await db.pool.query("SELECT to_regclass('operations_rollback_probe') relation")).rows[0].relation).toBeNull();
    expect((await db.pool.query('SELECT name,sha FROM _schema_migration ORDER BY name')).rows).toEqual(before);
    expect(await schemaReady(db.pool)).toBe(true);
  });

  it('changed applied migration rejects without altering existing application data or ledger', async () => {
    const migrations = join(directory, 'changed-migrations'); await mkdir(migrations);
    const original = (await migrationFiles())[0]!;
    await writeFile(join(migrations, original.name), original.sql + '\n-- unauthorized rewrite\n');
    await db.pool.query('CREATE TABLE operations_surviving_data(value text NOT NULL)');
    await db.pool.query("INSERT INTO operations_surviving_data VALUES('retain existing data')");
    const before = (await db.pool.query('SELECT name,sha FROM _schema_migration ORDER BY name')).rows;
    await expect(migrate(db.pool, migrations)).rejects.toThrow('Migration changed:');
    expect((await db.pool.query('SELECT name,sha FROM _schema_migration ORDER BY name')).rows).toEqual(before);
    expect(await schemaReady(db.pool)).toBe(true);
    expect((await db.pool.query('SELECT value FROM operations_surviving_data')).rows).toEqual([{ value: 'retain existing data' }]);
  });
});
