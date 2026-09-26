// Браузерная половина мутаций фичи widget-runtime-and-badge: дефект → пересборка бандла → набор
// tests/browser/widget-embed.test.ts на ЧУЖОМ origin в контейнере Playwright (Chromium, Firefox, WebKit) → красный;
// восстановление → пересборка → зелёный. Мутации (постановка координатора): бейдж скрывается клиентом (хозяин
// удаляет/прячет бейдж — виджет не восстанавливает); инлайновый стиль на узле хозяина (CSP хозяина его отвергает);
// origin вне списка принят (страница 8098 получает виджет); CORS `*` (ответ несёт не origin хозяина).
// В отличие от scripts/test-widget-mutations.mjs правит файлы НА МЕСТЕ (контейнер монтирует каталог проекта) и
// восстанавливает их в finally; после прогона проверяется, что исходники совпали с исходными байт в байт.
// Запуск с хоста: node scripts/test-widget-browser-mutations.mjs
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — дефект прошёл или восстановление красное;
// 2 — проверка НЕ ВЫПОЛНЕНА (нет Docker/браузера, бандл не собрался).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = resolve('tests/artifacts/widget-runtime-and-badge/browser-mutations');
mkdirSync(output, { recursive: true });
const once = (from, to) => (source) => (source.indexOf(from) < 0 || source.indexOf(from, source.indexOf(from) + 1) >= 0 ? null : source.replace(from, to));
const mutations = [
  { id: 'badge-hidden-by-client', title: 'бейдж скрывается клиентом: наблюдатель не восстанавливает удалённый/скрытый бейдж (ADR-004)',
    file: 'apps/widget/src/badge.ts', apply: once('  const tick = () => { checkAndRestore(root, slot, options, log); };', '  const tick = () => { void log; };') },
  { id: 'inline-style', title: 'style-атрибут на узле хозяина — CSP хозяина без unsafe-inline (FR-WIDGET-003)',
    file: 'apps/widget/src/index.ts', apply: once("  host.setAttribute('data-bot', tag.bot);\n", "  host.setAttribute('data-bot', tag.bot);\n  host.setAttribute('style', 'all: initial');\n") },
  { id: 'origin-outside-allowlist', title: 'CheckOrigin принимает любой origin — чужая страница 8098 получает виджет',
    file: 'apps/web/src/server/check-origin.ts', apply: once('return bot.origins.includes(origin) ? origin : null;', 'return origin;') },
  { id: 'cors-wildcard', title: 'CORS отвечает `*` вместо origin хозяина',
    file: 'apps/web/src/server/check-origin.ts', apply: once("return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };", "return { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' };") },
];

const build = () => spawnSync(process.execPath, ['apps/widget/scripts/build.mjs'], { encoding: 'utf8' });
function browserRun(id, phase) {
  const b = build();
  if (b.status !== 0) return { code: 2, summary: `бандл не собрался: ${b.stderr.trim()}` };
  const r = spawnSync('bash', ['scripts/check-responsive.sh', '--test', 'tests/browser/widget-embed.test.ts'], { encoding: 'utf8', timeout: 900000, env: { ...process.env, NO_COLOR: '1' } });
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  writeFileSync(resolve(output, `${id}-${phase}.txt`), log);
  return { code: r.status, summary: /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога' };
}

const results = [];
let infrastructure = false;
for (const m of mutations) {
  const path = resolve(m.file), original = readFileSync(path, 'utf8');
  const mutated = m.apply(original);
  if (mutated === null) { console.error(`Якорь мутации не найден или не уникален: ${m.id}`); process.exit(2); }
  let red, green;
  try { writeFileSync(path, mutated); red = browserRun(m.id, 'red'); }
  finally { writeFileSync(path, original); }
  green = browserRun(m.id, 'green');
  if (readFileSync(path, 'utf8') !== original) { console.error(`Файл не восстановлен: ${m.file}`); process.exit(2); }
  if (red.code === 2 || green.code === 2) infrastructure = true;
  const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0;
  results.push({ id: m.id, title: m.title, red, green, passed });
  console.log(`${m.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
}
writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = infrastructure ? 2 : results.every((r) => r.passed) ? 0 : 1;
