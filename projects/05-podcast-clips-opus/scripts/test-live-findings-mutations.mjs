import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-live-findings-mutations-'));
const output = resolve(process.env.N5_MUTATION_OUTPUT ?? 'tests/artifacts/live-findings/mutations');
mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['LV-1', 'packages/shared/src/transcript.ts',
      '      time.start = previous;', '      throw new TranscriptError(issue);\n      time.start = previous;',
      'tests/transcription-word-order.test.ts', 'LV-1'],
    ['LV-2', 'packages/shared/src/transcript.ts',
      '      correctedWords++;', '      correctedWords++;\n      if (correctedWords / totalWords > 0.01) throw new TranscriptError(issue);',
      'tests/transcription-word-order.test.ts', 'LV-2'],
    ['LV-3', 'packages/shared/src/transcript.ts',
      '  if (start > duration) {', '  if (start < 0 || end < start || end > duration || start > duration) {',
      'tests/live-findings.test.ts', 'LV-3'],
    ['LV-4', 'packages/shared/src/fragments.ts',
      '  const parsed = parseCandidates(value).filter(f => validFragment(f, duration));',
      '  const parsed = parseCandidates(value);\n  if (parsed.some(f => !validFragment(f, duration))) return [];',
      'tests/live-findings.test.ts', 'LV-4'],
    ['LV-5', 'apps/worker/src/llm/prompts/selection.ts',
      '    transcript: { language: transcript.language, segments: transcript.segments } });',
      '    transcript });', 'tests/live-findings.test.ts', 'LV-5'],
  ];
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    const run = phase => {
      const receipt = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test,
        '-t', title, '--reporter=json', `--outputFile=${receipt}`],
      { cwd: directory, encoding: 'utf8', timeout: 180000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      const report = JSON.parse(readFileSync(receipt, 'utf8'));
      return { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
    };
    let red;
    try {
      writeFileSync(path, source.replace(before, after));
      red = run('red');
    } finally { writeFileSync(path, source); }
    const green = run('green');
    results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${red.exit} (${red.failed} failed), green=${green.exit} (${green.passed} passed)`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ requested: [], total: mutations.length, partial: false, results }, null, 2) + '\n');
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
