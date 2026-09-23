import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-units-mutations-'));
const output = process.env.N5_MUTATION_OUTPUT
  ? resolve(process.env.N5_MUTATION_OUTPUT)
  : mkdtempSync(resolve('tests/artifacts/units-mutations-'));
mkdirSync(output, { recursive: true });
const mutations = [
  ['RV-1-monitor', 'docs/Completion.md', 'Секунды STT в сутки', 'Минуты STT в сутки', 'tests/units-and-guards.test.ts', 'RV-1'],
  ['RV-1-writer', 'apps/worker/src/workers/stt.ts', "unit: 'seconds', quantity: chunk.durationSeconds", "unit: 'minutes', quantity: Math.ceil(chunk.durationSeconds / 60)", 'tests/units-and-guards.test.ts', 'RV-1'],
  ['RV-2', 'packages/shared/src/watermark.ts', 'Сократите адрес в N5_PUBLIC_ORIGIN или уменьшите N5_SHORT_CODE_LENGTH', 'Измените конфигурацию', 'tests/watermark-startup.test.ts', 'uses configured length'],
  ['RV-3', 'scripts/test-render-mutations.mjs', 'partial: requested.length > 0, ', '', 'tests/units-and-guards.test.ts', 'RV-3'],
  ['RV-4', 'tests/render-media.test.ts', 'expect((light + 0.05) / (dark + 0.05), `${color} ${name} contrast`).toBeGreaterThanOrEqual(4.5);', 'expect(pixels.filter(p => p < 50).length).toBeGreaterThan(100);', 'tests/render-media.test.ts', 'real ffmpeg'],
];
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  mkdirSync(join(directory, 'docs'));
  cpSync('docs/Completion.md', join(directory, 'docs/Completion.md'));
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'Dockerfile', 'docker-compose.yml', '.env.example']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    const run = phase => {
      const receipt = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test, '-t', title,
        '--reporter=json', `--outputFile=${receipt}`], { cwd: directory, encoding: 'utf8', timeout: 120_000,
        env: { ...process.env, DATABASE_URL: '', REDIS_URL: '' } });
      writeFileSync(join(output, `${id}-${phase}.txt`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
      const report = JSON.parse(readFileSync(receipt, 'utf8'));
      return { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests,
        tests: report.testResults.flatMap(suite => suite.assertionResults.map(t => ({ name: t.fullName, status: t.status }))) };
    };
    writeFileSync(path, source.replace(before, after));
    const red = run('red');
    writeFileSync(path, source);
    const green = run('green');
    const whiteFailed = id !== 'RV-4' || red.tests.some(t => t.name.includes('(white)') && t.status === 'failed');
    results.push({ id, red, green, passed: whiteFailed && red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${red.exit} (${red.failed} failed), green=${green.exit} (${green.passed} passed)`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ requested: [], total: mutations.length, partial: false, results }, null, 2) + '\n');
  if (results.some(result => !result.passed)) process.exitCode = 1;
  console.log(`MUTATION_OUTPUT=${output}`);
} finally { rmSync(directory, { recursive: true, force: true }); }
