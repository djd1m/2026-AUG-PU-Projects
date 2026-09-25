// Фича 27a clip-cta: каждый страж обязан показать красное на внедрённом дефекте и зелёное после восстановления.
// Запуск: node tests/run-clip-cta-mutations.mjs [id…]; интеграционные — только при DATABASE_URL (в образе test).
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'tests/artifacts/clip-cta';
mkdirSync(root, { recursive: true });
const cta = 'packages/shared/src/cta.ts';
const handler = 'apps/web/src/server/short-link-handler.ts';
const migration = 'packages/db/migrations/020_clip_cta.sql';
const unit = 'tests/clip-cta.test.ts', integration = 'tests/clip-cta.integration.test.ts';
const cases = [
  ['protocol', cta, "if (url.protocol !== 'https:')", "if (!['https:', 'http:', 'javascript:', 'data:'].includes(url.protocol))", unit, 'разбор адреса'],
  ['credentials', cta, 'if (url.username || url.password)', 'if (false)', unit, 'разбор адреса'],
  ['escape', handler, 'href="${escapeHtml(cta.url)}"', 'href="${cta.url}"', unit, 'кнопка призыва автора'],
  ['stored-fail-closed', handler, 'readStoredCta(link.cta_kind, link.cta_url)', "({ kind: (link.cta_kind ?? 'none'), url: link.cta_url ?? null } as never)", unit, 'кнопка призыва автора'],
  ['primary-class', handler, '${own(false)}', '${own(true)}', unit, 'первый экран'],
  ['idempotency', 'apps/web/src/server/video.ts', 'if (row.cta_kind !== cta.kind ||', 'if (false &&', unit, 'идемпотентность'],
  ['parse-before-claim', 'apps/web/src/server/video.ts', 'try { cta = parseCtaTarget(body.cta_kind, body.cta_url); }', "cta = { kind: body.cta_kind ?? 'none', url: body.cta_url ?? null } as never; try { /* разбор пропущен */ }", unit, 'непригодный адрес'],
  ['enum-check', migration, "'subscribe','open_link'))", "'subscribe'))", 'tests/enums.test.ts', 'Каждый CHECK'],
  ['sql-enums-entry', 'packages/shared/src/enums.ts', "  'video.cta_kind': CTA_KIND,\n", '', 'tests/enums.test.ts', 'объявлен в SQL_ENUMS'],
  ['check-pair', migration, "ALTER TABLE video ADD CONSTRAINT video_cta_pair_check CHECK ((cta_kind = 'none') = (cta_url IS NULL));", '', integration, 'миграция 020'],
  ['check-url', migration, "cta_url LIKE 'https://%'", 'true', integration, 'миграция 020'],
  ['owner', 'apps/web/src/server/video-cta.ts', 'AND v.account_id=$2', 'AND ($2::uuid IS NOT NULL)', integration, 'video.setCta'],
];
const selected = process.argv.slice(2), results = [];
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  if (test.includes('.integration.') && !process.env.DATABASE_URL) {
    const result = { id, status: 'not_run', reason: 'DATABASE_URL unavailable; real PostgreSQL required' };
    results.push(result); console.log(JSON.stringify(result)); continue;
  }
  const source = readFileSync(file, 'utf8');
  if (!source.includes(original)) throw new Error(`Missing mutation target: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    const fd = openSync(`${root}/${id}-${phase}.log`, 'w');
    let child;
    try { child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`],
      { stdio: ['ignore', fd, fd], timeout: 120000 }); }
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
