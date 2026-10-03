// Coordinator only, with the existing isolated real PG environment and exclusive writer ownership.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const artifact = resolve(root, 'tests/artifacts/handover');
const file = resolve(root, 'packages/db/src/handover.ts');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshotFile = resolve(artifact, 'implementation-source-hashes.json');
const expected = JSON.parse(readFileSync(snapshotFile, 'utf8'));
function verifySnapshot() {
  for (const [path, hash] of Object.entries(expected)) {
    if (sha(readFileSync(resolve(root, path))) !== hash) throw new Error(`frozen candidate drift: ${path}`);
  }
}
verifySnapshot();
for (const key of ['TEST_DATABASE_URL_OWNER', 'TEST_TENANT_PASSWORD', 'TEST_SERVICE_PASSWORD']) {
  if (!process.env[key]) throw new Error(`required real-PG environment missing: ${key}; mutation NOT performed`);
}
const command = [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.int.config.ts',
  'apps/web/tests/int/handover.int.test.ts', '-t', 'HAN-04 claimed-keep-access guard'];
const original = readFileSync(file);
const before = sha(original);
const guard = '&& child.email === null && child.password_hash === null';
if (original.toString().split(guard).length !== 2) throw new Error('expected one locked UNCLAIMED guard');
mkdirSync(artifact, { recursive: true });
const result = { command: [process.execPath, ...command], sourceSha256Before: before, runs: [], status: 'failed' };
function run(label) {
  const startedAt = new Date().toISOString();
  const r = spawnSync(process.execPath, command, { cwd: root, env: process.env, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  writeFileSync(resolve(artifact, `${label}.log`), output);
  result.runs.push({ label, startedAt, endedAt: new Date().toISOString(), exit: r.status, signal: r.signal, error: r.error?.message ?? null });
  if (r.error || r.signal || r.status === null) throw new Error(`${label} execution unavailable`);
  return { exit: r.status, output };
}
try {
  const baseline = run('pg-mutation-baseline');
  if (baseline.exit !== 0 || !baseline.output.includes('1 passed')) throw new Error('real PG baseline did not execute exactly the fixed guard test');
  writeFileSync(file, original.toString().replace(guard, ''));
  const red = run('pg-mutation-red');
  if (red.exit !== 1 || !red.output.includes('1 failed') || !red.output.includes('claimed-keep-access guard')
    || !red.output.includes('AssertionError') || /test barrier deadline|ECONNREFUSED|Timed out|Cannot find/.test(red.output)) {
    throw new Error('mutation did not produce the required behavioral assertion failure');
  }
  result.behavioralRed = true;
} finally {
  writeFileSync(file, original);
  result.sourceSha256After = sha(readFileSync(file));
  try {
    if (result.sourceSha256After !== before) throw new Error('byte-exact restore failed');
    verifySnapshot(); // Compare final frozen candidate, never an old pre-implementation baseline.
    const green = run('pg-mutation-restored-green');
    if (result.behavioralRed && green.exit === 0 && green.output.includes('1 passed')) result.status = 'completed';
    verifySnapshot();
  } finally {
    writeFileSync(resolve(artifact, 'pg-mutation-result.json'), JSON.stringify(result, null, 2) + '\n');
  }
}
if (result.status !== 'completed') throw new Error('critical guard mutation incomplete');
console.log(JSON.stringify(result));
