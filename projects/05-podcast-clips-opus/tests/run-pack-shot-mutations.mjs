import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const pack = 'apps/worker/src/render/packshot.ts', render = 'apps/worker/src/render/ffmpeg.ts';
const unit = 'tests/pack-shot.test.ts', media = 'tests/pack-shot-media.test.ts';
const cases = [
  ['duration', pack, "return `eq=brightness=", "return `tpad=start_duration=1:start_mode=clone,eq=brightness=", media, 'video duration'],
  ['placement', pack, 'adelay=${packshot.t0_ms}', 'adelay=0', media, 'audio placement'],
  ['level', pack, 'volume=${packshot.gain_db}dB', 'volume=0dB', media, 'audio placement'],
  ['peak', pack, 'volume=${packshot.gain_db}dB', 'volume=${packshot.gain_db + 20}dB', media, 'audio placement'],
  ['flash-timing', pack, 'const t0 = t0Ms / 1000', 'const t0 = 0', media, 'video duration'],
  ['flash-shape', pack, 'if(lt(t,${t0}),0,if(lt(t,${peak}),(t-${t0})/0.05,max(0,1-(t-${peak})/${2 * FLASH_HALF_WIDTH_SECONDS})))',
    'max(0,1-abs(t-${peak})/0.25)', media, 'video duration'],
  ['envelope-contract', 'apps/worker/src/workers/render.ts', 'envelope: STINGER_ENVELOPE,', "envelope: 'atrim=0:0.8,afade=t=out:st=0.6:d=0.2',", 'tests/pack-shot-contract.test.ts', 'hash comes'],
  ['watermark', render, 'if (flash) filters.push(flash);\n  if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));',
    'if (watermark) filters.push(buildWatermarkDrawtext(width, height, origin, code));\n  if (flash) filters.push(flash);', media, 'video duration'],
  ['off-input', render, "...(music ? ['-i', music.path] : [])", "...['-i', music?.path ?? 'unexpected-music.mp3']", 'tests/music.test.ts', 'off arguments'],
  ['music-catalogue', 'apps/worker/src/render/music.ts', '3a7298ca305fda5f4b77dc14df1b6b0d9c7c3294dec806ca29539ea7e8ff9a67', '0'.repeat(64), 'tests/music.test.ts', 'catalogue'],
  ['off', render, "...(packshot ? ['-i', STINGERS[0].path] : [])", "...['-i', STINGERS[0].path]", 'tests/music.test.ts', 'off arguments'],
  ['skip', pack, "return skip('measure_failed')", "(() => { throw error; })()", unit, 'music-only baseline'],
  ['contract', 'apps/worker/src/workers/render.ts', '...(rendered.packshot ?', '...(false ?', 'tests/pack-shot-contract.test.ts', 'hash comes'],
  ['contract-absent', 'apps/worker/src/workers/render.ts', "flash: `${FLASH_SHAPE_VERSION}:${FLASH_PEAK}:${FLASH_HALF_WIDTH_SECONDS}` } } : {})", "flash: `${FLASH_SHAPE_VERSION}:${FLASH_PEAK}:${FLASH_HALF_WIDTH_SECONDS}` } } : { packshot: null })", 'tests/pack-shot-contract.test.ts', 'hash comes'],
  ['catalogue', 'apps/worker/src/render/music.ts', 'be2b8ddc62e4a24c91e2e77793de98549ce216faf2f323a917e7d6f34321ff97', '0'.repeat(64), unit, 'catalogue'],
  ['cache', pack, 'sampleMeasurement ?? await', 'await', unit, 'successful finite sample'],
  ['cache-error', pack, "signal?.throwIfAborted();\n    if (error instanceof", "sampleMeasurement = { integrated: -16, peak: -4 };\n    signal?.throwIfAborted();\n    if (error instanceof", unit, 'sample cache does not retain'],
  ['clock', pack, 'Math.round((duration - STINGER_SECONDS) * 1000)', 'Math.round(duration - STINGER_SECONDS) * 1000', unit, 'fractional clock'],
  ['peak-ceiling', pack, ', -3 - sample.peak', ', Infinity', unit, 'gain respects'],
  ['gain-ceiling', pack, 'gain > MUSIC_MAX_GAIN_DB', 'false', unit, 'gain respects'],
  ['ui', 'apps/web/src/app/upload/Uploader.tsx', 'Добавить музыку и финальный акцент', 'Добавить фоновую музыку', 'tests/pack-shot-uploader.test.ts', 'checkbox names'],
];
const root = process.env.PACK_SHOT_MUTATION_DIR ?? 'tests/artifacts/pack-shot/mutations'; mkdirSync(root, { recursive: true });
const selected = process.argv.slice(2), results = [];
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target ${id}`);
  function run(phase) {
    const path = `${root}/${id}-${phase}.json`;
    const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern,
      '--reporter=json', `--outputFile=${path}`], { encoding: 'utf8', timeout: 300000 });
    const report = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
    const measured = { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
    writeFileSync(`${root}/${id}-${phase}.log`, JSON.stringify(measured) + '\n' + result.stdout + result.stderr);
    console.log(JSON.stringify({ id, phase, ...measured }));
    return measured;
  }
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = run('red'); }
  finally { writeFileSync(file, source); }
  const green = run('green');
  results.push({ id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 });
}
const prior = selected.length && existsSync(`${root}/results.json`) ? JSON.parse(readFileSync(`${root}/results.json`, 'utf8')).filter(r => !selected.includes(r.id)) : [];
writeFileSync(`${root}/results.json`, JSON.stringify([...prior, ...results], null, 2) + '\n');
if (results.some(r => !r.passed)) process.exitCode = 1;
