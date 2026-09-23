import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-mirror-mutations-'));
const output = resolve(process.env.N5_MUTATION_OUTPUT ?? 'tests/artifacts/mirror/mutations');
mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['ledger-replaces-original', 'apps/worker/src/workers/select.ts',
      "catch (recordError) { console.error('Не удалось записать исход выделения в журнал', recordError); }",
      'catch (recordError) { throw recordError; }', 'tests/selection-order.test.ts', 'RV-5 spend ledger unavailable'],
    ['database-loses-outcome', 'apps/worker/src/workers/select.ts',
      "try { await spend(deps.spendPath, { ...event, phase: 'outcome', result: outcome }); }",
      'try { /* mutant: outcome record lost */ }', 'tests/selection-order.test.ts', 'RV-5 database failure'],
    ['plate-absent', 'apps/worker/src/render/watermark.ts',
      '    `drawbox=x=${g.left}:y=${g.y}:w=${g.plateWidth}:h=${g.plateHeight}:color=black@${WATERMARK_OPACITY}:t=fill`,',
      '    // mutant: no plate, text and code chip remain', 'tests/render-media.test.ts', 'real ffmpeg'],
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
    writeFileSync(path, source.replace(before, after));
    const red = run('red');
    writeFileSync(path, source);
    const green = run('green');
    results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${red.exit} (${red.failed} failed), green=${green.exit} (${green.passed} passed)`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ requested: [], total: mutations.length, partial: false, results }, null, 2) + '\n');
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
