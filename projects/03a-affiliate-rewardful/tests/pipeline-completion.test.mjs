import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { patchCompletionChecker, UPSTREAM_SHA256 } from '../scripts/check-pipeline-completion.mjs';

const ownProject = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The optional target lets a work unit test a coordinator's real candidate before integration.
const candidate = resolve(process.env.N3A_PIPELINE_CANDIDATE_ROOT ?? ownProject);
const upstream = join(ownProject, 'node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh');
const adapter = join(ownProject, 'scripts/check-pipeline-completion.mjs');
const roleArgs = ['--role-map-source', resolve(candidate, '../../.claude/commands/feature.md'),
  '--project-role-map-source', resolve(candidate, '../../.claude/skills/sparc-prd-mini/SKILL.md')];
function invoke(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: candidate, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, ...env }, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return { status: result.status, output: result.stdout + result.stderr };
}
function corrected(root, extra = [], env = {}) {
  return invoke(process.execPath, [adapter, root, '--completion', ...extra, ...roleArgs], env);
}

test('original real checker exposes doubled path and corrected real candidate passes all requested checks', () => {
  const originalBytes = readFileSync(upstream);
  const originalHash = createHash('sha256').update(originalBytes).digest('hex');
  assert.equal(originalHash, UPSTREAM_SHA256);
  const before = invoke('bash', [upstream, candidate, '--completion', ...roleArgs]);
  assert.equal(before.status, 2, before.output);
  assert.ok(before.output.includes(`path=${candidate}/docs/${candidate}/docs/Completion.md missing`), before.output);
  const privateTmp = mkdtempSync(join(tmpdir(), 'n3a-completion-cleanup-test-'));
  try {
    const after = corrected(candidate, ['--traceability', '--report-revision', '--criterion-scenarios'], { TMPDIR: privateTmp });
    assert.equal(after.status, 0, after.output);
    for (const mode of ['completion', 'traceability', 'report-revision', 'criterion-scenarios']) {
      assert.match(after.output, new RegExp(`VERDICT ${mode}=PASS`));
    }
    assert.deepEqual(readdirSync(privateTmp), []);
  } finally { rmSync(privateTmp, { recursive: true, force: true }); }
  assert.equal(createHash('sha256').update(readFileSync(upstream)).digest('hex'), originalHash);
  assert.throws(() => patchCompletionChecker(Buffer.concat([originalBytes, Buffer.from('\n# unknown upstream')])));
});

test('corrected real checker still rejects missing and malformed actual criterion mappings', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'n3a-completion-fixture-'));
  const feature = join(temporary, 'docs/features/foundation');
  mkdirSync(feature, { recursive: true });
  try {
    // Temporary fixtures retain the real candidate's specification, mappings and
    // substantive test files. No persistent duplicate document or symlink workaround.
    cpSync(join(candidate, 'docs/features/foundation/01_specification.md'), join(feature, '01_specification.md'));
    const completion = readFileSync(join(candidate, 'docs/features/foundation/05_completion.md'), 'utf8');
    const target = join(feature, '05_completion.md');
    writeFileSync(target, completion);
    for (const line of completion.split('\n').filter((value) => value.startsWith('| AC-'))) {
      const relative = line.split('|')[2].trim();
      const destination = join(temporary, relative);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(candidate, relative), destination);
    }
    const valid = corrected(temporary);
    assert.equal(valid.status, 0, valid.output);
    writeFileSync(target, completion.split('\n').filter((line) => !line.startsWith('| AC-foundation-7 |')).join('\n'));
    const missing = corrected(temporary);
    assert.equal(missing.status, 1, missing.output);
    assert.match(missing.output, /AC-foundation-7 has no row in Criterion coverage/);
    writeFileSync(target, completion.replace('| Criterion | Test file | Test title |', '| broken header |'));
    const malformed = corrected(temporary);
    assert.equal(malformed.status, 2, malformed.output);
    assert.match(malformed.output, /Criterion coverage table missing or malformed/);
    writeFileSync(target, completion);
    assert.equal(corrected(temporary).status, 0);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
