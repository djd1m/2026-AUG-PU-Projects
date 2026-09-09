import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import pg from 'pg';
import { MIGRATION_LOCK, runMigrations } from '../src/migrate';
import { testUrls } from './helpers';
const url = testUrls().migrate;
const client = new pg.Client({ connectionString: url, statement_timeout: 5_000 });
const schema = 'test_migrations_' + randomUUID().replaceAll('-', '');
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'n3a-migrations-'));
  await client.connect(); await client.query(`CREATE SCHEMA "${schema}"`);
});
afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end(); if (directory) await rm(directory, { recursive: true, force: true });
});
const run = (lockTimeoutMs?: number) => runMigrations({ databaseUrl: url, directory, schema, lockTimeoutMs });
it('migrations serialize and reject changed or missing applied history', async () => {
  const first = `CREATE TABLE "${schema}".once_only(id integer PRIMARY KEY); SELECT pg_sleep(0.05);`;
  await writeFile(path.join(directory, '001_first.sql'), first);
  const results = await Promise.all([run(), run()]);
  expect(results.map((r) => r.applied.length).sort()).toEqual([0, 1]);
  expect((await run()).skipped).toEqual(['001_first.sql']);
  const journal = await client.query(`SELECT * FROM "${schema}".schema_migrations`);
  expect(journal.rows).toHaveLength(1);
  expect(journal.rows[0].checksum).toBe(createHash('sha256').update(first).digest('hex'));
  // A new EARLIER file must not run before discovering drift in later history.
  await writeFile(path.join(directory, '000_earlier.sql'), `CREATE TABLE "${schema}".must_not_exist(id integer);`);
  await writeFile(path.join(directory, '001_first.sql'), first + '\n-- changed');
  await expect(run()).rejects.toThrow('changed_applied_migration');
  expect((await client.query('SELECT to_regclass($1) AS relation', [schema + '.must_not_exist'])).rows[0].relation).toBeNull();
  await rm(path.join(directory, '001_first.sql'));
  await expect(run()).rejects.toThrow('missing_applied_migration');
  await writeFile(path.join(directory, '001_first.sql'), first);
  await rm(path.join(directory, '000_earlier.sql'));
  await writeFile(path.join(directory, '002_failure.sql'), `CREATE TABLE "${schema}".rolled_back(id integer); SELECT 1/0;`);
  await expect(run()).rejects.toThrow('migration_apply_failed');
  expect((await client.query('SELECT to_regclass($1) AS relation', [schema + '.rolled_back'])).rows[0].relation).toBeNull();
  expect((await client.query(`SELECT count(*)::int AS n FROM "${schema}".schema_migrations`)).rows[0].n).toBe(1);
  await writeFile(path.join(directory, '002_failure.sql'), `CREATE TABLE "${schema}".rolled_back(id integer);`);
  expect((await run()).applied).toEqual(['002_failure.sql']);
  for (const row of (await client.query(`SELECT filename, checksum FROM "${schema}".schema_migrations`)).rows) {
    expect(row.checksum).toBe(createHash('sha256').update(await readFile(path.join(directory, row.filename))).digest('hex'));
  }
});
it('advisory lock acquisition is finite and failed runner releases its connection', async () => {
  await client.query('SELECT pg_advisory_lock($1,$2)', [...MIGRATION_LOCK]);
  const start = performance.now();
  try { await expect(run(100)).rejects.toThrow('migration_lock_timeout'); }
  finally { await client.query('SELECT pg_advisory_unlock($1,$2)', [...MIGRATION_LOCK]); }
  expect(performance.now() - start).toBeLessThan(2_000);
  expect((await run()).applied).toHaveLength(0);
});
it('legacy journal shape is rejected without a baseline path', async () => {
  const legacy = schema + '_old';
  await client.query(`CREATE SCHEMA "${legacy}"`);
  try {
    await client.query(`CREATE TABLE "${legacy}".schema_migrations(filename text PRIMARY KEY, applied_at timestamptz DEFAULT now())`);
    await expect(runMigrations({ databaseUrl: url, directory, schema: legacy })).rejects.toThrow('incompatible_migration_journal');
  } finally { await client.query(`DROP SCHEMA "${legacy}" CASCADE`); }
});
