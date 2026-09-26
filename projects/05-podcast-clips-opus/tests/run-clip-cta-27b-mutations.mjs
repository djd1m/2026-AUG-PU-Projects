// Фича 27b clip-cta: каждый страж обязан показать красное на внедрённом дефекте и зелёное после восстановления.
// Запуск: node tests/run-clip-cta-27b-mutations.mjs [id…]. Интеграционные — только при DATABASE_URL, медиа — только при
// ffmpeg ≥ 6 (оба условия выполняются в образе test); иначе строка «not_run» с причиной, а не зелёное.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'tests/artifacts/clip-cta/27b';
mkdirSync(root, { recursive: true });
const service = 'apps/web/src/server/video-cta.ts', overlay = 'apps/worker/src/render/cta-overlay.ts';
const unit = 'tests/clip-cta-render.test.ts', integration = 'tests/clip-cta-rerender.integration.test.ts', media = 'tests/cta-media.test.ts';
const cases = [
  ['busy-check', service, 'if (busy.rowCount) throw', 'if (false) throw', integration, 'уже идёт смена музыки'],
  ['quota-one', service, "'rerender', clips.length, now)", "'rerender', 1, now)", integration, 'одним списанием на N'],
  ['quota-per-clip', service, "const quota = await checkAndConsumeQuota(tx, this.limits, account, 'rerender', clips.length, now);",
    "const quota = { granted: true, scope: 'user_rerenders' }; for (const _clip of clips) { if (!(await checkAndConsumeQuota(tx, this.limits, account, 'rerender', 1, now)).granted) break; }",
    integration, 'остатка меньше'],
  ['pixels-always', 'packages/shared/src/cta.ts', 'return readCtaKind(from) !== readCtaKind(to);', 'return true;', integration, 'смена только адреса'],
  ['geometry-fail-closed', overlay, 'if (plateHeight > zone.bottom - zone.top || textWidth > available) continue;', 'if (textWidth > available) continue;', unit, 'fail-closed'],
  ['none-renders', overlay, 'const safe = readCtaKind(kind);', "const safe = readCtaKind(kind) === 'none' ? 'watch_full' : readCtaKind(kind);", unit, 'надписи нет'],
  ['none-renders-media', overlay, 'const safe = readCtaKind(kind);', "const safe = readCtaKind(kind) === 'none' ? 'watch_full' : readCtaKind(kind);", media, 'надпись призыва'],
  ['filter-dropped', 'apps/worker/src/render/ffmpeg.ts', '  if (cta) filters.push(cta);\n', '', unit, 'renderClip'],
  ['filter-dropped-media', 'apps/worker/src/render/ffmpeg.ts', '  if (cta) filters.push(cta);\n', '', media, 'надпись призыва'],
  ['worker-kind', 'apps/worker/src/workers/render.ts', 'cta: input.cta_kind })', 'cta: null })', 'tests/clip-cta-worker.test.ts', 'вид из базы'],
];
const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
const major = Number(ffmpeg.stdout?.match(/ffmpeg version (\d+)/)?.[1] ?? 0);
const selected = process.argv.slice(2), results = [];
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  const reason = test === integration && !process.env.DATABASE_URL ? 'DATABASE_URL unavailable; real PostgreSQL required'
    : test === media && major < 6 ? `ffmpeg ${major || 'absent'} < 6; image 8.1 required` : null;
  if (reason) { const result = { id, status: 'not_run', reason }; results.push(result); console.log(JSON.stringify(result)); continue; }
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    const fd = openSync(`${root}/${id}-${phase}.log`, 'w');
    let child;
    try { child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`],
      { stdio: ['ignore', fd, fd], timeout: 300000 }); }
    finally { closeSync(fd); }
    if (child.error || !existsSync(path)) throw child.error ?? new Error(`No receipt: ${path}`);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const result = { id, phase, exit: child.status, passed: report.numPassedTests, failed: report.numFailedTests };
    console.log(JSON.stringify(result)); return result;
  };
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = run('red'); }
  finally { writeFileSync(file, source); }
  const green = run('green');
  results.push({ id, red, green, status: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.passed > 0 ? 'killed' : 'failed' });
}
const prior = existsSync(`${root}/mutations.json`)
  ? JSON.parse(readFileSync(`${root}/mutations.json`, 'utf8')).filter(result => !results.some(r => r.id === result.id)) : [];
writeFileSync(`${root}/mutations.json`, JSON.stringify([...prior, ...results], null, 2) + '\n');
console.log(JSON.stringify({ summary: results.map(r => `${r.id}:${r.status}`) }));
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
