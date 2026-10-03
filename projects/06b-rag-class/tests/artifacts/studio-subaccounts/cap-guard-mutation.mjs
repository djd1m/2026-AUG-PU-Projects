// Coordinator-only: run inside the existing PG test runner after verifying the frozen source.
// No Docker, installs or environment provisioning here; the existing integration global setup applies migrations.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const name of ['TEST_DATABASE_URL_OWNER', 'TEST_TENANT_PASSWORD', 'TEST_SERVICE_PASSWORD']) {
  if (!process.env[name]) throw new Error(`${name} absent; real-PG mutation NOT performed`);
}
const root = new URL('../../../', import.meta.url);
const path = new URL('packages/db/src/studio.ts', root);
const output = new URL('tests/artifacts/studio-subaccounts/', root);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = readFileSync(path);
const expected = JSON.parse(readFileSync(new URL('implementation-source-hashes.json', output), 'utf8'));
for (const [file, digest] of Object.entries(expected.files)) {
  if (hash(readFileSync(new URL(file, root))) !== digest) throw new Error(`Frozen source mismatch: ${file}`);
}
const guard = "if (Number(count.n) >= 5) return 'cap';";
const text = original.toString('utf8');
if (text.split(guard).length !== 2) throw new Error('Expected exactly one cap guard');
const mutated = Buffer.from(text.replace(guard, "if (Number(count.n) >= 500) return 'cap';"));
const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.int.config.ts',
  'apps/web/tests/int/studio-clients.int.test.ts', '-t', 'eight concurrent creates produce exactly five clients'];
const run = (name) => {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 90000 });
  writeFileSync(new URL(name, output), (result.stdout ?? '') + (result.stderr ?? '') +
    (result.error ? `\n${result.error.message}\n` : ''));
  return result.status;
};
let red;
try { writeFileSync(path, mutated); red = run('cap-guard-red.txt'); }
finally { writeFileSync(path, original); }
if (hash(readFileSync(path)) !== hash(original)) throw new Error('Exact restoration failed');
const green = run('cap-guard-restored-green.txt');
const record = { run_id: expected.run_id, snapshot_sha256: expected.snapshot_sha256,
  guard: 'STU-02 real cap five under eight concurrent creates', command: [process.execPath, ...args],
  original_sha256: hash(original), mutated_sha256: hash(mutated), restored_sha256: hash(readFileSync(path)),
  red_exit: red, restored_green_exit: green, captured_at: new Date().toISOString() };
writeFileSync(new URL('cap-guard-mutation.json', output), JSON.stringify(record, null, 2) + '\n');
// Fixed oracle: eight concurrent HTTP requests => five 201, three exact-message 409, exactly five child DB rows.
if (red !== 1 || green !== 0) throw new Error(`Required red(1)/green(0) not met: ${red}/${green}`);
console.log(JSON.stringify(record));
