import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-selection-mutations-'));
const output = resolve('tests/artifacts/selection-and-score/mutations'); mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['provider-pin', 'apps/worker/src/llm/provider.ts', 'only: config.model', 'ignored_only: config.model', 'tests/selection.test.ts', 'source guard requires'],
    ['local-ranges', 'packages/shared/src/fragments.ts', 'export function validFragment(f: Fragment, duration: number): boolean {',
      'export function validFragment(f: Fragment, duration: number): boolean { return true;', 'tests/selection.test.ts', 'our code rejects invalid'],
    ['word-boundaries', 'packages/shared/src/fragments.ts', "start_seconds: nearest(f.start_seconds, 'start'), end_seconds: nearest(f.end_seconds, 'end')",
      'start_seconds: f.start_seconds, end_seconds: f.end_seconds', 'tests/selection.test.ts', 'snaps to WORD'],
    ['quota-order', 'apps/worker/src/workers/select.ts',
      'const input = await authorizeSelection(deps.pool, attempt, deps.limits, deps.model);',
      `const input = { duration: 360, transcript: { language: 'ru', words: Array.from({length:360}, (_,i) => ({word:'слово',start:i,end:i+1})), segments: [] } };`,
      'tests/selection-order.test.ts', 'user_llm consumed BEFORE'],
    ['attempt-count', 'apps/worker/src/workers/select.ts', 'await spend(deps.spendPath, event);', '',
      'tests/selection-order.test.ts', 'counts attempts including'],
    ['honest-count', 'packages/shared/src/fragments.ts', 'return accepted;',
      'while (accepted.length > 0 && accepted.length < 3) accepted.push({ ...accepted[0]! }); return accepted;',
      'tests/selection.test.ts', 'honest count'],
  ];
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    writeFileSync(path, source.replace(before, after));
    // The quota-order mutant debits only after dispatch, as specified by the brief.
    if (id === 'quota-order') writeFileSync(path, readFileSync(path, 'utf8').replace(
      'fragments = validateFragments(response, input.transcript, input.duration);',
      'await authorizeSelection(deps.pool, attempt, deps.limits, deps.model);\n    fragments = validateFragments(response, input.transcript, input.duration);'));
    const run = phase => {
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title],
        { cwd: directory, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return result.status;
    };
    const red = run('red'); writeFileSync(path, source); const green = run('green');
    results.push({ id, red, green, passed: red === 1 && green === 0 });
    console.log(`${id}: red=${red}, green=${green}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
