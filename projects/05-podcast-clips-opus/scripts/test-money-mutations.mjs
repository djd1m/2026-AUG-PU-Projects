import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Never mutate the caller's working tree. DATABASE_URL must point to an isolated
// PostgreSQL 16 *_test database; no real model requests or deployment required.
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-money-mutations-'));
mkdirSync(resolve('tests/artifacts'), { recursive: true });
const output = mkdtempSync(join(resolve('tests/artifacts'), 'money-mutations-'));
const replace = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error(`Mutation anchor is not unique: ${before}`);
  return source.replace(before, after);
};
const mutations = [
  { id: 'RM-003', file: 'docker-compose.yml', test: 'tests/model-spend.test.ts', count: 1,
    mutate: source => {
      if (source.split('      - model-spend:/work/spend\n').length !== 3) throw new Error('Expected two shared mounts');
      return source.replaceAll('      - model-spend:/work/spend\n', '');
    } },
  { id: 'RM-004', file: 'packages/db/src/transcription.ts', test: 'tests/transcription.integration.test.ts', count: 1,
    mutate: source => {
      source = replace(source, 'interface Current { account_id:', 'interface Current { stt_calls: Record<string, number>; account_id:');
      source = replace(source, 'v.minutes_charged,j.started_at', 'v.minutes_charged,j.started_at,j.stt_calls');
      const start = source.indexOf('    const current = await tx.query<{ stt_calls:');
      const end = source.indexOf('    if (previous !== expectedPrevious)', start);
      if (start < 0 || end < 0) throw new Error('Missing STT read anchor');
      source = source.slice(0, start) + '    const previous = row.stt_calls[String(chunkIndex)] ?? 0;\n' + source.slice(end);
      return replace(source, 'AND COALESCE((stt_calls->>$3::text)::int,0)=$4::int AND $4::int < $5', 'AND $4::int < $5');
    } },
  { id: 'RM-005', file: 'apps/worker/src/workers/stt.ts', test: 'tests/transcription-order.test.ts', count: 2,
    mutate: source => replace(source, "unit: 'seconds', quantity: chunk.durationSeconds",
      "unit: 'minutes', quantity: Math.ceil(chunk.durationSeconds / 60)") },
  { id: 'RM-006', file: 'apps/worker/src/workers/select.ts', test: 'tests/selection-order.test.ts', count: 1,
    mutate: source => replace(source,
      "    await spend(deps.spendPath, { ...event, phase: 'outcome', result: outcome });\n    await failSelection(deps.pool, attempt, outcome === 'schema_violation' ? 'schema_violation' : 'stalled');",
      "    await failSelection(deps.pool, attempt, outcome === 'schema_violation' ? 'schema_violation' : 'stalled');\n    await spend(deps.spendPath, { ...event, phase: 'outcome', result: outcome });") },
];
const results = [];
try {
  const requested = process.argv.slice(2);
  if (requested.some(id => !mutations.some(mutation => mutation.id === id))) throw new Error('Unknown RM mutation');
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'docker-compose.yml']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  for (const mutation of mutations) {
    if (requested.length && !requested.includes(mutation.id)) continue;
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    const entry = { id: mutation.id, source_sha256: createHash('sha256').update(source).digest('hex'),
      test_sha256: createHash('sha256').update(readFileSync(join(directory, mutation.test))).digest('hex'),
      baseline: null, red: null, green: null, passed: false };
    results.push(entry);
    if (mutation.id === 'RM-004' && !process.env.DATABASE_URL) {
      entry.reason = 'DATABASE_URL absent: real PostgreSQL race and mutation NOT EXECUTED';
      console.log(`${mutation.id}: red=NOT EXECUTED; green=NOT EXECUTED (PostgreSQL unavailable)`);
      continue;
    }
    const run = phase => {
      const json = join(output, `${mutation.id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', mutation.test,
        '-t', mutation.id, '--reporter=json', `--outputFile=${json}`],
      { cwd: directory, encoding: 'utf8', timeout: 60_000, env: { ...process.env, N5_ACCEPTANCE: '0' } });
      writeFileSync(join(output, `${mutation.id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      let report;
      try { report = JSON.parse(readFileSync(json, 'utf8')); } catch { return { exit: result.status, verified: false }; }
      const selected = report.testResults.flatMap(test => test.assertionResults).filter(test => test.fullName.includes(mutation.id));
      const verified = selected.length === mutation.count && selected.every(test => phase === 'red'
        ? test.status === 'failed' && test.failureMessages.some(message => message.includes('AssertionError'))
        : test.status === 'passed');
      return { exit: result.status, verified };
    };
    entry.baseline = run('baseline');
    if (entry.baseline.exit !== 0 || !entry.baseline.verified) { entry.reason = 'Baseline failed or skipped'; continue; }
    const mutant = mutation.mutate(source);
    entry.mutant_sha256 = createHash('sha256').update(mutant).digest('hex');
    writeFileSync(join(output, `${mutation.id}-mutant.txt`), mutant);
    try { writeFileSync(path, mutant); entry.red = run('red'); }
    finally { writeFileSync(path, source); }
    entry.green = run('green');
    entry.passed = entry.red.exit === 1 && entry.red.verified && entry.green.exit === 0 && entry.green.verified;
    console.log(`${mutation.id}: red=${JSON.stringify(entry.red)}; green=${JSON.stringify(entry.green)}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Evidence: ${output}`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
