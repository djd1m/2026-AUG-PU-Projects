// Фича 28 landing-demo: каждый страж обязан показать красное на внедрённом дефекте и зелёное после восстановления.
// Запуск: node tests/run-landing-demo-mutations.mjs [id…]. Виды: unit — где угодно; db — только при DATABASE_URL (образ test);
// browser — только на хосте с Docker (контейнер Playwright через scripts/check-responsive.sh --test). Иначе строка
// «not_run» с причиной, а не зелёное.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'tests/artifacts/landing-demo/mutations';
mkdirSync(root, { recursive: true });
const shared = 'packages/shared/src/showcase.ts', handler = 'apps/web/src/server/showcase-file.ts';
const retention = 'apps/web/src/server/retention.ts', shortLink = 'apps/web/src/server/short-link.ts';
const demo = 'apps/web/src/app/LandingDemo.tsx', css = 'apps/web/src/app/globals.css';
const unit = 'tests/landing-demo.test.ts', db = 'tests/landing-demo.integration.test.ts', retentionDb = 'tests/retention.integration.test.ts';
const browser = 'tests/browser/responsive-check.test.ts';
// [id, kind, file, original, mutation, test, pattern]
const cases = [
  ['set-membership', 'unit', shared, 'return SHOWCASE_CLIPS.find(clip => clip.code === code) ?? null;', 'return SHOWCASE_CLIPS[0] ?? null;', unit, 'вне набора'],
  ['set-membership-db', 'db', shared, 'return SHOWCASE_CLIPS.find(clip => clip.code === code) ?? null;', 'return SHOWCASE_CLIPS[0] ?? null;', db, 'того же формата'],
  ['link-code-db', 'db', handler, 'l.clip_id=c.id AND l.code=$2 AND l.revoked_at IS NULL', 'l.clip_id=c.id AND $2::text IS NOT NULL AND l.revoked_at IS NULL', db, 'ДРУГОМУ клипу'],
  ['done-only-db', 'db', handler, "WHERE c.id=$1 AND c.status='done' AND", 'WHERE c.id=$1 AND', db, 'не done'],
  // Параметр $3 остаётся (иначе красное дал бы сбой привязки параметров, а не стёртая витрина) — выключается само исключение.
  ['retention-exclusion', 'unit', retention, 'AND NOT (c.id = ANY($3::uuid[]))', 'AND NOT (c.id = ANY($3::uuid[]) AND false)', unit, 'исключает SHOWCASE_CLIP_IDS'],
  ['retention-exclusion-db', 'db', retention, 'AND NOT (c.id = ANY($3::uuid[]))', 'AND NOT (c.id = ANY($3::uuid[]) AND false)', retentionDb, 'showcase clip survives'],
  ['preview-showcase', 'unit', shortLink, ' && !isShowcaseClip(link.clip_id)', '', unit, '«ready»'],
  ['playsinline', 'browser', demo, '<video controls playsInline preload="none"', '<video controls preload="none"', browser, 'видео с playsinline'],
  ['demo-below-fold', 'browser', css, 'width:clamp(7rem,38vw,9.5rem); height:auto;', 'width:clamp(16rem,80vw,22rem); height:auto;', browser, 'демо и действие в первом экране'],
];
const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
const selected = process.argv.slice(2), results = [];
for (const [id, kind, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  const reason = kind === 'db' && !process.env.DATABASE_URL ? 'DATABASE_URL unavailable; real PostgreSQL required (run in image test)'
    : kind === 'browser' && docker.status !== 0 ? 'Docker unavailable; Playwright container required (run on host)' : null;
  if (reason) { const result = { id, status: 'not_run', reason }; results.push(result); console.log(JSON.stringify(result)); continue; }
  const source = readFileSync(file, 'utf8');
  if (source.split(original).length !== 2) throw new Error(`Mutation target missing or not unique: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    const fd = openSync(`${root}/${id}-${phase}.log`, 'w');
    const args = ['run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`];
    let child;
    try {
      child = kind === 'browser'
        ? spawnSync('bash', ['scripts/check-responsive.sh', '--test', ...args.slice(1)], { stdio: ['ignore', fd, fd], timeout: 600000 })
        : spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', ...args], { stdio: ['ignore', fd, fd], timeout: 300000 });
    } finally { closeSync(fd); }
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
