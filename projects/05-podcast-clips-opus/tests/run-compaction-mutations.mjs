// Run sequentially, never alongside another test process reading these sources.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const plan = 'apps/worker/src/render/compaction.ts', render = 'apps/worker/src/render/ffmpeg.ts';
const cases = [
  ['max-pause', plan, 'length > COMPACT_MAX_PAUSE', 'false', 'tests/compaction.test.ts', 'only interior'],
  ['min-length', plan, 'duration < 20 + 1 / COMPACT_FPS', 'false', 'tests/compaction.test.ts', 'minimum output'],
  ['min-saving', plan, '(end - start - duration) / (end - start) < COMPACT_MIN_SAVING', 'false', 'tests/compaction.test.ts', 'minimum output'],
  ['keep-without-xfade', plan, 'frame(length - COMPACT_KEEP_SECONDS - COMPACT_XFADE_SECONDS)', 'frame(length - COMPACT_KEEP_SECONDS)', 'tests/compaction-media.test.ts', 'real VFR'],
  ['retry-recompute', 'apps/worker/src/workers/render.ts', 'if (input.compact && !cutPlan)', 'if (input.compact)', 'tests/compaction-worker.test.ts', 'persist/reread'],
  ['subtitle-clock', render, 'start: mapTime(cuts, w.start), end: mapTime(cuts, w.end)', 'start: w.start, end: w.end', 'tests/compaction-render.test.ts', 'mp3 compact'],
  ['packshot-clock', render, 'preparePackshot(options.inputPath, options.startTime, duration,', 'preparePackshot(options.inputPath, options.startTime, sourceDuration,', 'tests/compaction-render.test.ts', 'mp3 compact'],
  ['force-compaction', 'apps/worker/src/workers/render.ts', 'if (input.compact && !cutPlan)', 'if (!cutPlan)', 'tests/compaction-worker.test.ts', 'off never'],
  ['strict', 'apps/web/src/server/upload-contract.ts', 'compact: z.boolean().optional() }).strict()', 'compact: z.boolean().optional() })', 'tests/compaction-upload.test.ts', 'default false'],
  ['ui-default', 'apps/web/src/app/upload/Uploader.tsx', 'const [compact, setCompact] = useState(true)', 'const [compact, setCompact] = useState(false)', 'tests/compaction-uploader.test.ts', 'default on'],
];
for (const [id, file, original, replacement, test, pattern] of cases) {
  if (process.argv.length > 2 && !process.argv.slice(2).includes(id)) continue;
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target ${id}`);
  const run = async phase => {
    let result;
    try { result = (await exec(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json'], { encoding: 'utf8', timeout: 60000, maxBuffer: 8_000_000 })).stdout; }
    catch (e) { if (!e.stdout?.length) throw e; result = e.stdout; }
    const json = JSON.parse(result);
    console.log(JSON.stringify({ id, phase, failed: json.numFailedTests, passed: json.numPassedTests }));
    return json;
  };
  let red;
  try { writeFileSync(file, source.replace(original, replacement)); red = await run('red'); }
  finally { writeFileSync(file, source); }
  const green = await run('green');
  if (!red.numFailedTests || green.numFailedTests || !green.numPassedTests) throw new Error(`Guard did not discriminate: ${id}`);
}
