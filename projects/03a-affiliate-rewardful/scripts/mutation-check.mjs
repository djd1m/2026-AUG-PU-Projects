import { cp, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../packages/db/src/migrate.ts';
import { onboardingExperiments } from './onboarding-mutation-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const namespace = process.env.N3A_DISPOSABLE_TEST_NAMESPACE;
const url = process.env.TEST_DATABASE_URL_MIGRATE;
if (!/^n3a-foundation-[a-f0-9]{12}$/.test(namespace ?? '') || !url || new URL(url).username !== 'n3a_migrator' || new URL(url).pathname !== '/n3a') {
  throw new Error('mutation_requires_isolated_foundation_test_namespace');
}
const experiments = [
  ...onboardingExperiments,
  { name: 'runtime-startup-config', file: 'scripts/start-web.ts', from: 'readRuntimeConfig(process.env);', to: '', test: 'tests/startup.test.ts' },
  { name: 'kdf-capacity', file: 'apps/web/src/lib/auth/kdf-admission.ts', from: 'this.active < 2', to: 'this.active < 3', test: 'apps/web/tests/kdf-admission.test.ts' },
  { name: 'session-revocation', file: 'packages/db/src/auth-repository.ts', from: 'AND s.revoked_at IS NULL', to: '', test: 'packages/db/tests/auth-repository.integration.test.ts' },
  { name: 'session-expiry', file: 'packages/db/src/auth-repository.ts', from: 'AND s.expires_at > COALESCE($2::timestamptz, statement_timestamp())', to: 'AND ($2::timestamptz IS NULL OR $2::timestamptz IS NOT NULL)', test: 'packages/db/tests/auth-repository.integration.test.ts' },
  { name: 'credential-state-race', file: 'packages/db/migrations/001_identity_sessions.sql', from: 'OR NOT current_user_row.enabled', to: '', test: 'apps/web/tests/credentials.integration.test.ts', sql: true },
  { name: 'migration-checksum', file: 'packages/db/src/migrate.ts', from: 'if (local.get(filename)?.checksum !== checksum)', to: 'if (false)', test: 'packages/db/tests/migrate.integration.test.ts' },
  { name: 'database-port', file: 'scripts/check-foundation-infra.mjs', from: "if (name !== 'web' && service.ports?.length)", to: 'if (false)', test: 'tests/infra.test.ts' },
  { name: 'idle-pool-error', file: 'packages/db/src/pool.ts', from: "pool.on('error', () => { console.error('database_idle_connection_error'); });", to: '', test: 'packages/db/tests/pool.integration.test.ts' },
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
async function resetFixture(directory) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Only the harness-created disposable database with a fresh namespace is accepted above.
    await client.query('DROP SCHEMA n3a CASCADE; CREATE SCHEMA n3a AUTHORIZATION n3a_migrator');
  } finally { await client.end(); }
  await runMigrations({ databaseUrl: url, directory });
}
const results = [];
let failure;
try {
  for (const experiment of experiments) {
    const directory = await mkdtemp(path.join(tmpdir(), 'n3a-mutant-'));
    for (const entry of ['apps', 'packages', 'scripts', 'tests', 'package.json', 'tsconfig.json']) {
      await cp(path.join(root, entry), path.join(directory, entry), { recursive: true,
        filter: (source) => !source.split(path.sep).some((part) => ['node_modules', '.next'].includes(part)) && !source.endsWith('.tsbuildinfo') });
    }
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    const original = await readFile(path.join(root, experiment.file), 'utf8');
    if (!original.includes(experiment.from)) throw new Error(`mutation_target_missing:${experiment.name}`);
    const changed = original.replace(experiment.from, experiment.to);
    await writeFile(path.join(directory, experiment.file), changed);
    const config = path.join(directory, 'mutation.config.mjs');
    await writeFile(config, `export default ${JSON.stringify({
      resolve: { alias: { '@n3a/db': path.join(directory, 'packages/db/src/index.ts') } },
      test: { include: [experiment.test], fileParallelism: false, maxWorkers: 1, testTimeout: 15000, hookTimeout: 15000 },
    })};\n`);
    await resetFixture(path.join(experiment.sql ? directory : root, 'packages/db/migrations'));
    const report = path.join(directory, 'result.json');
    const child = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--root', directory,
      '--config', config, '--reporter=json', '--outputFile', report], { cwd: directory, env: process.env, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    let parsed;
    try { parsed = JSON.parse(await readFile(report, 'utf8')); } catch { throw new Error(`mutation_report_missing:${experiment.name}`); }
    const failures = (parsed.testResults ?? []).flatMap((test) => test.assertionResults ?? []).filter((test) => test.status === 'failed').map((test) => test.fullName);
    if (child.status !== 1 || failures.length === 0) throw new Error(`mutation_not_killed_by_assertion:${experiment.name}`);
    if (digest(await readFile(path.join(root, experiment.file))) !== digest(original)) throw new Error('original_source_changed');
    results.push({ name: experiment.name, source: experiment.file, original_sha256: digest(original), mutant_sha256: digest(changed), exit_code: child.status, failed_tests: failures });
    console.log(`KILLED ${experiment.name}: ${failures.length} failed assertion test(s)`);
  }
} catch (error) { failure = error; }
finally {
  await resetFixture(path.join(root, 'packages/db/migrations'));
}
await writeFile(path.join(root, '.runtime/mutation-results.json'), JSON.stringify({ namespace, results, restored: true, status: failure ? 'failed' : 'passed' }, null, 2));
if (failure) throw failure;
console.log(`PASS ${results.length} behavioral mutations; original source untouched and fixture schema restored`);
