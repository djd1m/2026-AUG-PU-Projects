import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-word-order-mutations-'));
const output = resolve('tests/artifacts/transcription-word-order/mutations');
mkdirSync(output, { recursive: true });
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    ['zero-tolerance', 'STT_WORD_ORDER_TOLERANCE_SECONDS = 0.5', 'STT_WORD_ORDER_TOLERANCE_SECONDS = 0', 'TR-010 jitter'],
    ['above-overlap', 'STT_WORD_ORDER_TOLERANCE_SECONDS = 0.5', 'STT_WORD_ORDER_TOLERANCE_SECONDS = 3', 'TR-010 disorder'],
    ['no-rounding-guard', 'STT_WORD_ORDER_TOLERANCE_SECONDS - roundingError', 'STT_WORD_ORDER_TOLERANCE_SECONDS', 'TR-010 decimal boundary'],
    ['no-ratio-guard', 'correctedWords / totalWords > STT_MAX_CORRECTED_WORD_RATIO', 'false', 'TR-010 ratio'],
    ['generic-message', "timingIssue?.reason === 'order' ? 'Таймкоды слов не по порядку' :", "timingIssue?.reason === 'order' ? 'Нет пригодных таймкодов слов' :", 'TR-010 messages'],
    ['no-clamp-journal', "console.warn(JSON.stringify({ event: 'stt_word_order_clamped'", "void(JSON.stringify({ event: 'stt_word_order_clamped'", 'TR-010 journal'],
  ];
  for (const [id, before, after, title] of mutations) {
    const path = join(directory, 'packages/shared/src/transcript.ts'), source = readFileSync(path, 'utf8');
    if (source.split(before).length !== 2) throw new Error(`Mutation anchor not unique: ${id}`);
    const run = phase => {
      const receipt = join(output, `${id}-${phase}.json`);
      const result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run',
        'tests/transcription-word-order.test.ts', '-t', title, '--reporter=json', `--outputFile=${receipt}`],
      { cwd: directory, encoding: 'utf8', timeout: 30000 });
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
  writeFileSync(join(output, 'results.json'), JSON.stringify({ total: mutations.length, partial: false, results }, null, 2) + '\n');
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
