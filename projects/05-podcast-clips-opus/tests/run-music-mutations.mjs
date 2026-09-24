import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const music = 'apps/worker/src/render/music.ts', loudness = 'apps/worker/src/render/loudness.ts';
const cases = [
  ['selection', music, 'return catalogue[((index % catalogue.length) + catalogue.length) % catalogue.length]!', 'return catalogue[0]', 'tests/music.test.ts', 'selection cycles'],
  ['selected-measure', music, 'measureLoudness(track.path,', 'measureLoudness(MUSIC_TRACKS[0].path,', 'tests/music.test.ts', 'selected track drives'],
  ['selected-input', 'apps/worker/src/render/ffmpeg.ts', "['-i', music.path]", "['-i', selectTrack(0).path]", 'tests/music.test.ts', 'selected track drives'],
  ['selected-contract', music, '`${track.id}:${track.sha256}`', '`${MUSIC_TRACKS[0].id}:${MUSIC_TRACKS[0].sha256}`', 'tests/pack-shot-contract.test.ts', 'hash comes'],
  ['index-passing', 'apps/worker/src/workers/render.ts', ', clipIndex: input.index', '', 'tests/pack-shot-contract.test.ts', 'hash comes'],
  ['index-origin', 'apps/worker/src/render/ffmpeg.ts', 'options.clipIndex - 1', 'options.clipIndex', 'tests/pack-shot-contract.test.ts', 'hash comes'],

  ['gain-rounding', music, 'Math.round(gain * 10) / 10', 'gain', 'tests/music.test.ts', 'gain rounds'],
  ['measure-timeout', loudness, 'timeoutMs = MUSIC_MEASURE_TIMEOUT_MS', 'timeoutMs = 900_000', 'tests/music.test.ts', 'measurement default timeout'],
  ['timeout-skip', music, " || error.reason === 'ffmpeg_timeout'", '', 'tests/music.test.ts', 'measurement ffmpeg_timeout'],

  ['G1', music, 'inputs=2:duration=first:normalize=0', 'inputs=2:duration=first:normalize=1', 'tests/music-media.test.ts', 'G1'],
  ['G2', music, 'volume=${gainDb}dB', 'volume=0dB', 'tests/music-media.test.ts', 'G2'],
  ['G3', music, 'volume=${gainDb}dB', 'volume=${gainDb + 20}dB', 'tests/music-media.test.ts', 'G3'],
  ['parser-NaN', loudness, 'return value ? Number(value[1]) : NaN;', 'return NaN;', 'tests/music-media.test.ts', 'real render'],
  ['off-input', 'apps/worker/src/render/ffmpeg.ts', "...(music ? ['-i', music.path] : [])", "...['-i', music?.path ?? 'unexpected-music.mp3']", 'tests/music.test.ts', 'off arguments'],
  ['contract', 'apps/worker/src/workers/render.ts', '...(rendered.music ?', '...(false ?', 'tests/render-worker.test.ts', 'music contract'],
  ['strict', 'apps/web/src/server/upload-contract.ts', 'compact: z.boolean().optional() }).strict()', 'compact: z.boolean().optional() })', 'tests/music.test.ts', 'strict upload'],
  ['skip-throws', music, "return skip('speech_too_quiet');", "throw new Error('quiet');", 'tests/music.test.ts', 'quiet/invalid speech'],
  ['catalogue', music, '73efb557d8cfcca0f5cf3b435d3a0157bf9a702115b55266b8a2529f3997b542', '0'.repeat(64), 'tests/music.test.ts', 'catalogue'],
  ['gain-ceiling', music, 'gain > MUSIC_MAX_GAIN_DB', 'false', 'tests/music.test.ts', 'gain ceiling'],
];
const root = process.env.MUSIC_MUTATION_DIR ?? 'tests/artifacts/music-bed';
mkdirSync(root, { recursive: true });
const results = [];
const selected = process.argv.slice(2);
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target ${id}`);
  const run = phase => {
    const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${root}/${id}-${phase}.json`], { encoding: 'utf8', timeout: 240000 });
    const report = JSON.parse(readFileSync(`${root}/${id}-${phase}.json`, 'utf8'));
    const measured = { exit: result.status, failed: report.numFailedTests, passed: report.numPassedTests };
    writeFileSync(`${root}/${id}-${phase}.log`, JSON.stringify(measured) + '\n' + result.stdout + result.stderr);
    return measured;
  };
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = run('red'); }
  finally { writeFileSync(file, source); }
  const green = run('green');
  const item = { id, red, green, passed: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0 };
  results.push(item); console.log(JSON.stringify(item));
}
const prior = selected.length && existsSync(`${root}/mutations.json`) ? JSON.parse(readFileSync(`${root}/mutations.json`, 'utf8')).filter(r => !selected.includes(r.id)) : [];
writeFileSync(`${root}/mutations.json`, JSON.stringify([...prior, ...results], null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
