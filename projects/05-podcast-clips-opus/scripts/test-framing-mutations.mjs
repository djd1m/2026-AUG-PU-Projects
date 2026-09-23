import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-framing-mutations-'));
const output = resolve(process.argv[2] ?? 'tests/artifacts/framing/mutations');
mkdirSync(output, { recursive: true });
const format = 'apps/worker/src/render/format.ts', ffmpeg = 'apps/worker/src/render/ffmpeg.ts';
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['center-instead-of-dual', format, "return 'dual';", "return 'center';", 'tests/framing.test.ts', 'landscape uses both'],
    ['vertical-dual', format, "if (source.width <= source.height) return 'center';", '', 'tests/framing.test.ts', 'vertical or square'],
    ['narrow-dual', format, "if (Math.floor(source.width / 2) < 480) return 'center';", '', 'tests/framing.test.ts', 'narrow'],
    ['watermark-first', ffmpeg, 'if (watermark) filters.push(', 'if (watermark) filters.unshift(', 'tests/framing.test.ts', 'assembly precedes'],
    ['odd-window', format, '2 * Math.floor(value / 2)', 'Math.floor(value)', 'tests/framing-media.test.ts', 'real odd source'],
    ['both-panels-left', format, 'crop(panelWindow(source, 1))', 'crop(panelWindow(source, 0))', 'tests/framing-media.test.ts', 'real render'],
    ['ass-before-assembly', ffmpeg, 'if (assFilePath !== null) filters.push(', 'if (assFilePath !== null) filters.unshift(', 'tests/framing.test.ts', 'assembly precedes'],
  ];
  for (const [id, file, before, after, test, title] of mutations) {
    const path = join(directory, file), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    const run = phase => {
      const reportPath = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', test,
        '-t', title, '--reporter=json', `--outputFile=${reportPath}`],
      { cwd: directory, encoding: 'utf8', timeout: 120000, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '', N5_ACCEPTANCE: '' } });
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const measured = { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
      writeFileSync(join(output, `${id}-${phase}.txt`), JSON.stringify(measured) + '\n' + `${result.stdout ?? ''}${result.stderr ?? ''}`);
      return measured;
    };
    writeFileSync(path, source.replace(before, after));
    const red = run('red');
    writeFileSync(path, source);
    const green = run('green');
    results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
    console.log(`${id}: red=${JSON.stringify(red)}, green=${JSON.stringify(green)}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
