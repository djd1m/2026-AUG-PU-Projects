// Исправления по кросс-семейному ревью фич 25–29 (Codex, 28.09.2026): каждый тронутый страж обязан показать красное на
// внедрённом дефекте и зелёное после восстановления. Критерий «убита» — упавший тест в СВЕЖЕМ отчёте этого запуска
// (старый отчёт удаляется до запуска), а не код возврата. db — только при DATABASE_URL (образ test), иначе not_run.
// Запуск в образе: node scripts/test-db.mjs && env -u N5_ACCEPTANCE node tests/run-review-25-29-mutations.mjs [id…]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'tests/artifacts/review-25-29/mutations';
mkdirSync(root, { recursive: true });
const tariff = 'packages/shared/src/tariff.ts', plan = 'packages/db/src/plan.ts', cta = 'apps/web/src/server/video-cta.ts';
const retention = 'apps/web/src/server/retention.ts', showcase = 'apps/web/src/server/showcase-file.ts', clipFile = 'apps/web/src/server/clip-file.ts';
const theme = 'tests/theme.test.ts', css = 'apps/web/src/app/globals.css';
// [id, kind, file, original, mutation, test, pattern]
const cases = [
  ['ts-showcase-exempt', 'unit', tariff, ' || isShowcaseClip(clip.clipId)) return null;', ') return null;', 'tests/landing-demo.test.ts', 'срок витрины одинаков'],
  ['ts-plan-equality', 'unit', tariff, "if (clip.plan === 'paid' ||", "if (clip.plan !== 'free' ||", 'tests/billing.unit.test.ts', 'срок хранения'],
  ['sql-showcase-exempt', 'unit', plan, "+ (showcase.length ? ` OR ${clip}.id IN (${showcase.join(',')})` : '')", "+ ''", 'tests/landing-demo.test.ts', 'исключает SHOWCASE_CLIP_IDS'],
  ['sql-showcase-exempt-db', 'db', plan, "+ (showcase.length ? ` OR ${clip}.id IN (${showcase.join(',')})` : '')", "+ ''", 'tests/retention.integration.test.ts', 'showcase clip survives'],
  ['single-place', 'unit', clipFile, 'const expires = clipExpiry(', 'const legacy = 3 * 86400_000; void legacy;\n      const expires = clipExpiry(', 'tests/billing.unit.test.ts', 'ровно в одном месте'],
  ['setcta-expiry-db', 'db', cta, 'return !expires || expires > now;', 'return true || expires;', 'tests/clip-cta-rerender.integration.test.ts', 'срок бесплатного клипа в setCta'],
  ['retention-cancels-rerender-db', 'db', retention, "failure_reason='stale_attempt_result',finished_at=$2\n            WHERE clip_id=$1 AND rerender", "failure_reason='stale_attempt_result',finished_at=$2\n            WHERE clip_id=$1 AND rerender AND false", 'tests/clip-cta-rerender.integration.test.ts', 'очистка после постановки пересборки'],
  // Круг 2: отказ хранилища глотается → ключи обнуляются без стирания, повтор потерян.
  ['retention-keys-after-erase', 'unit', retention, "await storage.eraseClipPrefix(`${prefix}/${clip.video_id}/${clip.id}`);",
    "await storage.eraseClipPrefix(`${prefix}/${clip.video_id}/${clip.id}`).catch(() => {});", 'tests/retention.test.ts', 'next pass retries'],
  ['retention-keys-after-erase-db', 'db', retention, "await storage.eraseClipPrefix(`${prefix}/${clip.video_id}/${clip.id}`);",
    "await storage.eraseClipPrefix(`${prefix}/${clip.video_id}/${clip.id}`).catch(() => {});", 'tests/clip-cta-rerender.integration.test.ts', 'отказ хранилища при очистке'],
  ['showcase-explicit-expiry-db', 'db', showcase, 'AND (c.expires_at IS NULL OR c.expires_at > now())', '', 'tests/landing-demo.integration.test.ts', 'явный expires_at витрины'],
  ['colour-guard-boundary', 'unit', theme, '(?<![-\\w])(?:white|black)(?![-\\w])', '\\bwhite\\b|\\bblack\\b', theme, 'colour guard'],
  ['visually-hidden-nowrap', 'unit', css, 'clip-path:inset(50%); white-space:nowrap; border:0;', 'clip-path:inset(50%); border:0;', theme, 'colour guard'],
];
const selected = process.argv.slice(2), results = [];
for (const [id, kind, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  if (kind === 'db' && !process.env.DATABASE_URL) {
    const result = { id, status: 'not_run', reason: 'DATABASE_URL unavailable; real PostgreSQL required (run in image test)' };
    results.push(result); console.log(JSON.stringify(result)); continue;
  }
  const source = readFileSync(file, 'utf8');
  if (source.split(original).length !== 2) throw new Error(`Mutation target missing or not unique: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    rmSync(path, { force: true });
    const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`],
      { encoding: 'utf8', timeout: 300000 });
    writeFileSync(`${root}/${id}-${phase}.log`, `${child.stdout ?? ''}${child.stderr ?? ''}`);
    if (!existsSync(path)) return { id, phase, exit: child.status, launch_failed: true };
    const report = JSON.parse(readFileSync(path, 'utf8'));
    return { id, phase, exit: child.status, passed: report.numPassedTests, failed: report.numFailedTests };
  };
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = run('red'); }
  finally { writeFileSync(file, source); }
  const green = run('green');
  const killed = !red.launch_failed && !green.launch_failed && red.exit === 1 && red.failed > 0 && green.exit === 0 && green.failed === 0 && green.passed > 0;
  const result = { id, red, green, status: killed ? 'killed' : 'failed' };
  results.push(result); console.log(JSON.stringify(result));
}
writeFileSync(`${root}/mutations.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ summary: results.map(r => `${r.id}:${r.status}`) }));
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
