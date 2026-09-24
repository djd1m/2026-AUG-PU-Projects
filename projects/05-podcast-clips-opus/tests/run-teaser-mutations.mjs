import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const teaser = 'apps/worker/src/render/teaser.ts', render = 'apps/worker/src/render/ffmpeg.ts';
const worker = 'apps/worker/src/workers/render.ts', ui = 'apps/web/src/app/upload/Uploader.tsx';
const unit = 'tests/teaser.test.ts';
const cases = [
  ['width', teaser, 'const text = normalize(title), available = width - 2 * 54;', 'const text = normalize(title), available = width * 100;', unit, 'layout measured'],
  ['glyph', teaser, '} catch { return null; }', '} catch (error) { throw error; }', unit, 'normalization and glyph'],
  ['textfile', teaser, "drawtext=textfile='${escapeFFmpegPath(path)}'", "drawtext=text='${escapeFFmpegPath(path)}'", unit, 'injection stays'],
  ['center', teaser, 'text_align=C', 'text_align=L', unit, 'injection stays'],
  ['normalization', teaser, "title.replace(/\\s+/gu, ' ').trim()", 'title.trim()', unit, 'normalization and glyph'],
  ['newline', teaser, "layout.lines.join('\\n'), { encoding:", "layout.lines.join('\\n') + '\\n', { encoding:", unit, 'injection stays'],
  ['window', teaser, 'TEASER_SECONDS = 2.5', 'TEASER_SECONDS = 25', unit, 'order is'],
  ['intersection', teaser, 'TEASER_Y = 0.17', 'TEASER_Y = 0.8', unit, 'safe area'],
  ['order', render, '  if (teaser) filters.push(teaser);\n', '', unit, 'order is'],
  ['order-top', render, '  if (teaser) filters.push(teaser);\n  if (flash) filters.push(flash);\n  if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));',
    '  if (flash) filters.push(flash);\n  if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));\n  if (teaser) filters.push(teaser);', unit, 'order is'],
  ['off', render, 'const teaser = options.teaser ?', 'const teaser = true ?', unit, 'render uses textfile'],
  ['strict', 'apps/web/src/server/upload-contract.ts', 'teaser: z.boolean().optional() }).strict()', 'teaser: z.boolean().optional() })', unit, 'strict teaser schema'],
  ['conflict', 'apps/web/src/server/video.ts', 'row.teaser !== (body.teaser ?? false)', 'false', 'tests/teaser-upload.test.ts', 'default false persists'],
  ['ui', ui, 'const [teaser, setTeaser] = useState(true)', 'const [teaser, setTeaser] = useState(false)', 'tests/teaser-uploader.test.ts', 'default on'],
  ['resume', ui, 'teaser: saved.teaser === true', 'teaser: saved.teaser !== false', 'tests/teaser-uploader.test.ts', 'resume restores'],
  ['contract', worker, '...(rendered.teaser ?', '...(false ?', 'tests/teaser-contract.test.ts', 'actual teaser bytes'],
  ['contract-lines', worker, 'lines: rendered.teaser.lines.length,', 'lines: rendered.teaser.lines,', 'tests/teaser-contract.test.ts', 'actual teaser bytes'],
  ['fallback-log', render, "console.info(JSON.stringify({ event: 'music_track_fallback' }));", '', unit, 'invalid clip index'],
  ['window-pixels', teaser, 'TEASER_SECONDS = 2.5', 'TEASER_SECONDS = 25', 'tests/teaser-media.test.ts', 'real teaser window'],
];
const root = process.env.TEASER_MUTATION_DIR ?? 'tests/artifacts/teaser-headline/mutations';
mkdirSync(root, { recursive: true });
const selected = process.argv.slice(2), results = [];
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target ${id}`);
  async function run(phase) {
    const path = `${root}/${id}-${phase}.json`;
    let exit = 0, stdout = '', stderr = '';
    try { ({ stdout, stderr } = await exec(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern,
      '--reporter=json', `--outputFile=${path}`], { timeout: 300000, maxBuffer: 8_000_000 })); }
    catch (error) { exit = error.code; stdout = error.stdout ?? ''; stderr = error.stderr ?? ''; }
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const measured = { exit, failed: report.numFailedTests, passed: report.numPassedTests, skipped: report.numPendingTests };
    writeFileSync(`${root}/${id}-${phase}.log`, JSON.stringify(measured) + '\n' + stdout + stderr);
    console.log(JSON.stringify({ id, phase, ...measured }));
    return measured;
  }
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = await run('red'); }
  finally { writeFileSync(file, source); }
  const green = await run('green');
  const unavailable = red.exit === 0 && green.exit === 0 && red.passed === 0 && green.passed === 0;
  results.push({ id, red, green, status: unavailable ? 'NOT_EXECUTED' :
    red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 ? 'PASS' : 'FAIL' });
}
writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2) + '\n');
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
if (results.some(r => r.status === 'NOT_EXECUTED')) {
  process.exitCode ||= 2;
  console.error('НЕ ВЫПОЛНЕН: media mutation; see logs, requires ffmpeg >= 6.1');
}
