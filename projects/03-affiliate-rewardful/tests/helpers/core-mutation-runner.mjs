import { mkdtemp, cp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const mutations = [
  { name: 'tenant actor membership', file: 'shared/application/index.mjs',
    original: 'assert(session.actor_ids.includes(context.actorId),', changed: 'assert(true,',
    test: 'tests/core-access.test.mjs', pattern: 'SC-US-001-3' },
  { name: 'duplicate business payment', file: 'shared/domain/events.mjs',
    original: 'if (previous) { assert(previous.inputHash', changed: 'if (false && previous) { assert(previous.inputHash',
    test: 'tests/core-events.test.mjs', pattern: 'SC-US-002-1' },
  { name: 'stale registry source', file: 'shared/domain/registry.mjs',
    original: 'assert(revision.sourceVersion === state.sourceVersion,', changed: 'assert(true,',
    test: 'tests/core-registry.test.mjs', pattern: 'SC-US-004-2' },
];
function run(cwd, mutation) {
  return spawnSync(process.execPath, ['--test', `--test-name-pattern=${mutation.pattern}`, mutation.test],
    { cwd, env: process.env, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
}
for (const mutation of mutations) {
  const baseline = run(project, mutation);
  if (baseline.status !== 0) { process.stderr.write(baseline.stdout + baseline.stderr); throw new Error(`Baseline failed: ${mutation.name}`); }
  const isolated = await mkdtemp(join(tmpdir(), 'n3-core-mutant-'));
  try {
    await cp(join(project, 'shared'), join(isolated, 'shared'), { recursive: true });
    await cp(join(project, 'tests'), join(isolated, 'tests'), { recursive: true });
    await symlink(join(project, 'node_modules'), join(isolated, 'node_modules'));
    const target = join(isolated, mutation.file), original = await readFile(target, 'utf8');
    if (original.split(mutation.original).length !== 2) throw new Error(`Mutation anchor is not unique: ${mutation.name}`);
    await writeFile(target, original.replace(mutation.original, mutation.changed));
    const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    if (syntax.status !== 0) throw new Error(`Invalid mutant syntax: ${mutation.name}`);
    const result = run(isolated, mutation);
    if (result.status !== 1 || !result.stdout.includes('not ok') || !result.stdout.includes(mutation.pattern)) {
      process.stderr.write(result.stdout + result.stderr); throw new Error(`Mutant survived or run inconclusive: ${mutation.name}`);
    }
    process.stdout.write(JSON.stringify({ mutation: mutation.name, target: mutation.file,
      sourceSHA256: createHash('sha256').update(original).digest('hex'), baselineExit: baseline.status,
      mutantExit: result.status, killed: true, pattern: mutation.pattern }) + '\n');
  } finally { await rm(isolated, { recursive: true, force: true }); }
}
