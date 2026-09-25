import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = process.argv.slice(2).some(id => id.startsWith('review-'))
  ? 'tests/artifacts/clip-music-choice/review-fixes' : 'tests/artifacts/clip-music-choice';
mkdirSync(root, { recursive: true });
const music = 'apps/worker/src/render/music.ts';
const service = 'apps/web/src/server/clip-music.ts';
const cases = [
  ['review-retention', 'apps/web/src/server/retention.ts', 'storage.eraseClipPrefix(`${prefix}/${clip.video_id}/${clip.id}`)', 'storage.erasePrefix(`${prefix}/${clip.video_id}/${clip.id}`)', 'tests/clip-music-review-fixes.test.ts', 'retention uses real'],
  ['review-skip', service, 'if (clip.music_skip_reason && target ===', 'if (false && target ===', 'tests/clip-music-review-fixes.test.ts', 'known skipped choice'],
  ['review-player', 'apps/web/src/app/clips/ClipCard.tsx', 'String(clip.published_render_version ?? clip.render_version ?? 1)', "`${clip.render_version ?? 1}${clip.rerendering ? '-pending' : ''}`", 'tests/clip-music-review-fixes.test.ts', 'known skipped choice'],
  ['review-failure', 'apps/web/src/app/clips/ClipCard.tsx', 'clip.rerender_failure &&', 'false &&', 'tests/clip-music-review-fixes.test.ts', 'known skipped choice'],
  ['review-orphans', 'packages/db/src/render.ts', 'if (!accepted) {', 'if (!accepted) return false;\n  if (!accepted) {', 'tests/clip-music-review-fixes.test.ts', 'rejected publication'],
  ['review-loudness', 'apps/worker/src/render/ffmpeg.ts', 'music_skip_reason: musicSkipReason', 'music_skip_reason: null', 'tests/clip-music-choice.test.ts', 'loudness skip'],
  ['review-start', 'apps/worker/src/workers/render.ts', "    if (!await setRenderDeferred(deps.pool, attempt, false)) return 'stale';", '', 'tests/render-worker.test.ts', 'attempt heartbeat precedes'],
  ['review-heartbeat', 'packages/db/src/render.ts', ',started_at=now()', '', 'tests/clip-music-choice.integration.test.ts', 'queued 25 minutes'],
  ['review-persist', 'packages/db/src/render.ts', 'music_skip_reason=$11', 'music_skip_reason=CASE WHEN $11::text IS NULL THEN NULL ELSE NULL END', 'tests/clip-music-choice.integration.test.ts', 'published loudness skip'],
  ['preview', 'apps/web/public/music-previews/holizna-bubbles.mp3', '', '', 'tests/clip-music-choice.test.ts', 'catalogue has nine'],
  ['none', music, "if (choice === 'none') return null;", "if (choice === 'none') return selectTrack(index);", 'tests/clip-music-choice.test.ts', 'none disables'],
  ['explicit', music, 'return track ?? null;', 'return null;', 'tests/clip-music-choice.test.ts', 'explicit id enables'],
  ['version', 'apps/worker/src/workers/render.ts', 'input.render_version > 1', 'false', 'tests/render-worker.test.ts', 'rerender uses v2'],
  ['startup', 'packages/shared/src/config.ts', 'const raw = required(env, name, consequences[name]);', "const raw = name === 'N5_LIMIT_USER_RERENDERS' ? env[name] ?? '20' : required(env, name, consequences[name]);", 'tests/clip-music-choice.test.ts', 'requires rerender limit'],
  ['strict', service, "'Неизвестный трек') }).strict();", "'Неизвестный трек') });", 'tests/clip-music-choice.test.ts', 'strict input'],
  ['owner', service, 'AND v.account_id=$2', 'AND ($2::uuid IS NOT NULL)', 'tests/clip-music-choice.integration.test.ts', 'ownership'],
  ['quota', 'packages/db/src/quota.ts', 'used::bigint + $4 <= $5', '($5::int > 0)', 'tests/clip-music-choice.integration.test.ts', '25 concurrent'],
  ['fence', 'packages/db/src/render.ts', 'c.render_fence=$3', '($3::int > 0)', 'tests/clip-music-choice.integration.test.ts', 'lease and all render gates'],
];
const selected = process.argv.slice(2), results = [];
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  if (test.includes('.integration.') && !process.env.DATABASE_URL) {
    const result = { id, status: 'not_run', reason: 'DATABASE_URL unavailable; real PostgreSQL required' };
    results.push(result); console.log(JSON.stringify(result)); continue;
  }
  const source = id === 'preview' ? null : readFileSync(file, 'utf8');
  if (source !== null && !source.includes(original)) throw new Error(`Missing mutation target: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`];
    const fd = openSync(`${root}/${id}-${phase}.log`, 'w');
    let child;
    try { child = spawnSync(command[0], command.slice(1), { stdio: ['ignore', fd, fd], timeout: 60000 }); }
    finally { closeSync(fd); }
    if (child.error || !existsSync(path)) throw child.error ?? new Error(`No receipt: ${path}`);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const result = { id, phase, exit: child.status, passed: report.numPassedTests, failed: report.numFailedTests };
    console.log(JSON.stringify(result)); return result;
  };
  let red;
  try {
    if (source === null) renameSync(file, `${file}.mutation-backup`);
    else writeFileSync(file, source.replace(original, mutation));
    red = run('red');
  } finally {
    if (source === null) renameSync(`${file}.mutation-backup`, file);
    else writeFileSync(file, source);
  }
  const green = run('green');
  results.push({ id, red, green, status: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.passed > 0 ? 'killed' : 'failed' });
}
const prior = selected.length && existsSync(`${root}/mutations.json`)
  ? JSON.parse(readFileSync(`${root}/mutations.json`, 'utf8')).filter(result => !selected.includes(result.id)) : [];
writeFileSync(`${root}/mutations.json`, JSON.stringify([...prior, ...results], null, 2) + '\n');
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
