// Изолированные копии исходника; рабочее дерево никогда не содержит внедрённый дефект.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const project = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n5-upload-fix-mutations-'));
const evidenceRoot = path.join(project, 'tests/artifacts/upload-fix-round3');
fs.mkdirSync(evidenceRoot, { recursive: true });
const evidence = fs.mkdtempSync(path.join(evidenceRoot, 'mutations-'));
const selected = process.argv.slice(2);
const receipt = [];
const tests = [
  ['RU-001-timeout', 'packages/s3/src/multipart.ts', 'COMPLETE_REQUEST_TIMEOUT_MS = 5 * 60_000', 'COMPLETE_REQUEST_TIMEOUT_MS = 5000', 'tests/upload-fix.test.ts', 'minutes-scale'],
  ['RU-001-body', 'packages/s3/src/multipart.ts', ', abortSignal: AbortSignal.timeout(COMPLETE_REQUEST_TIMEOUT_MS)', '', 'tests/upload-fix.test.ts', 'deadline covers'],
  ['RU-003-parallel', 'apps/web/src/lib/upload-parts.ts', 'pending.slice(0, 3)', 'pending.slice(0, 1)', 'tests/upload-fix.test.ts', 'three PUTs'],
  ['RU-003-renew', 'apps/web/src/lib/upload-parts.ts', 'if (!refresh) throw', 'if (true) throw', 'tests/upload-fix.test.ts', 'expired signatures refresh'],
  ['RU-006-account', 'apps/web/src/server/rate-limit.ts', 'account ? `account:${account}`', 'false ? `account:${account}`', 'tests/upload-fix.test.ts', 'saturated anonymous'],
  ['RU-008-cleanup', 'apps/web/src/server/video.ts', 'await this.cleanup(() => this.storage.abort(row.object_key, row.upload_id!), \'abort\')', 'await this.storage.abort(row.object_key, row.upload_id!)', 'tests/upload-fix.test.ts', 'abort failure still deletes'],
  // RI-001 заменяет прежний RU-009: возвращаем запрет Create без lifecycle.
  ['RI-001-lifecycle', 'packages/s3/src/multipart.ts',
    '  // Сироты старше суток:',
    `  const lifecycle = await ctx.client.send(new (await import('@aws-sdk/client-s3')).GetBucketLifecycleConfigurationCommand({ Bucket: ctx.bucket }), { requestTimeout: FAST_REQUEST_TIMEOUT_MS });
  if (!lifecycle.Rules?.some((rule) => rule.Status === 'Enabled'
    && rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation === 1
    && (!rule.Prefix || rule.Prefix === '')
    && (!rule.Filter || Object.keys(rule.Filter).length === 0
      || (Object.keys(rule.Filter).length === 1 && rule.Filter.Prefix === '')))) throw new Error('S3: требуется lifecycle');
  // Сироты старше суток:`, 'tests/upload-fix.test.ts', 'RI-001: initiation'],
  ['RU-002-pool', 'apps/web/src/server/video.ts', 'await this.storage.initiate(objectKey)', 'await transaction(this.pool, async () => this.storage.initiate(objectKey))', 'tests/upload-fix.integration.test.ts', 'pending initiate'],
  ['RU-004-day', 'packages/db/src/quota.ts', "'upload_refund', 1, chargedAt", "'upload_refund', 1, now", 'tests/upload-fix.integration.test.ts', 'midnight refund'],
  ['RU-004-rollback', 'packages/db/src/quota.ts', "if (!result.rowCount) await tx.query('ROLLBACK TO SAVEPOINT upload_refund');", '', 'tests/upload-fix.integration.test.ts', 'midnight refund'],
  ['RU-007-migration', 'packages/db/migrations/003_ipv6_legacy_cleanup.sql', /DELETE FROM[^;]+;/g, '', 'tests/upload-migration.integration.test.ts', 'legacy IPv6'],
];
function run(id, state, file, name, source) {
  const log = path.join(evidence, `${id}-${state}.txt`), fd = fs.openSync(log, 'wx');
  let result;
  try {
    result = spawnSync(process.execPath, [path.join(project, 'node_modules/vitest/vitest.mjs'), 'run', file, '-t', name],
      { cwd: root, env: process.env, stdio: ['ignore', fd, fd], timeout: 60000 });
  } finally { fs.closeSync(fd); }
  const entry = { id, state, exit_code: result.status, source_sha256: createHash('sha256').update(source).digest('hex'), log: path.relative(project, log) };
  if (result.error) entry.error = result.error.code;
  receipt.push(entry);
  if (result.error) throw result.error;
  console.log(`${id} ${state}: exit ${result.status}`);
  return result.status;
}
try {
  for (const directory of ['apps', 'packages', 'tests', 'scripts']) fs.cpSync(path.join(project, directory), path.join(root, directory), {
    recursive: true, filter: (file) => !['node_modules', 'dist', '.next', 'artifacts'].includes(path.basename(file)),
  });
  for (const file of ['package.json', 'vitest.config.ts', 'tsconfig.base.json']) fs.copyFileSync(path.join(project, file), path.join(root, file));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  for (const [id, file, from, to, test, name] of tests) {
    if (selected.length && !selected.some((prefix) => id.startsWith(prefix))) continue;
    if (test.includes('.integration.') && !process.env.DATABASE_URL) {
      receipt.push({ id, state: 'not_run', exit_code: null, reason: 'DATABASE_URL unavailable; requires real PostgreSQL in compose test' });
      console.log(`${id}: NOT RUN (real PostgreSQL required)`); continue;
    }
    const target = path.join(root, file), clean = fs.readFileSync(target, 'utf8'), mutant = clean.replace(from, to);
    if (mutant === clean) throw new Error(`${id}: mutation did not change bytes`);
    fs.writeFileSync(target, mutant);
    if (run(id, 'red', test, name, mutant) !== 1) throw new Error(`${id}: expected failing guard`);
    fs.writeFileSync(target, clean);
    if (run(id, 'green', test, name, clean) !== 0) throw new Error(`${id}: restored guard failed`);
  }
  if (receipt.some((r) => r.state === 'not_run')) process.exitCode = 2;
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  fs.writeFileSync(path.join(evidence, 'fix-mutations.json'), JSON.stringify(receipt, null, 2) + '\n');
  fs.rmSync(root, { recursive: true, force: true });
}
