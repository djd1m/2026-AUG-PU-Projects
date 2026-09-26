// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи public-page-and-summary: сводка считает вопросы без сессии (предпросмотр); просмотр демо-страницы
// без дедупликации; клик «Поделиться» без показа CTA; страница без проверки публикации; публикация без контакта;
// приход перезаписывается; i = 0 вместо «нет данных»; сторож удаляет сессии с записями журнала; любой Sec-Fetch-Site —
// «свой origin»; не-boolean в публикации; приход пишется при входе, а не только при регистрации.
// Интеграционные наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-public-page-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: интеграционные наборы пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-page-mutations-'));
const output = resolve('tests/artifacts/public-page-and-summary/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/public-page.integration.test.ts', 'tests/public-page.unit.test.ts', 'tests/bot-cabinet.unit.test.ts', 'tests/preview-flow.unit.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  if (a < 0 || source.indexOf(from, a + 1) >= 0) return null;
  return source.slice(0, a) + to + source.slice(a + from.length);
};
const summary = 'packages/db/src/summary.ts', page = 'packages/db/src/public-page.ts', growth = 'packages/db/src/growth.ts', visitor = 'packages/db/src/visitor.ts',
  origin = 'apps/web/src/server/check-origin.ts', cabinet = 'apps/web/src/server/cabinet-handler.ts', auth = 'apps/web/src/server/auth-handler.ts';
const mutations = [
  { id: 'summary-counts-preview', title: 'сводка считает вопросы без сессии посетителя (предпросмотр владельца) — FR-BOT-004, AC-6',
    edits: [{ file: summary, apply: once('FROM question_log WHERE bot_id = $1 AND visitor_session_id IS NOT NULL AND created_at', 'FROM question_log WHERE bot_id = $1 AND created_at') }] },
  { id: 'page-view-no-dedup', title: 'public_page_view без дедупликации: каждый просмотр — новая строка (AC-7)',
    edits: [{ file: page, apply: once("'public_page_view:' || b.id::text || ':' || $2::text || ':' || ${MSK_DAY}", "'public_page_view:' || gen_random_uuid()::text || $2::text") }] },
  { id: 'share-without-shown', title: 'share_cta_click пишется без показа CTA (FR-GROWTH-001 @security)',
    edits: [{ file: growth, apply: once("WHERE b.id = $1 AND EXISTS (SELECT 1 FROM growth_event g WHERE g.type = 'share_cta_shown' AND g.bot_id = b.id)", 'WHERE b.id = $1') }] },
  { id: 'page-ignores-publication', title: 'демо-страница открывается без публикации (SC-US-013-3)',
    edits: [{ file: page, apply: once(' WHERE b.public_slug = $1 AND b.public_enabled`', ' WHERE b.public_slug = $1`') }] },
  { id: 'publish-without-contact', title: 'публикация бота без контакта для «не знаю»',
    edits: [{ file: page, apply: once("        if (input.enabled && !readContact(bot.contact)) return { kind: 'contact_required' } as const;\n", '') }] },
  { id: 'arrival-overwrite', title: 'приход по бейджу перезаписывается следующим (AC-8)',
    edits: [{ file: growth, apply: once("WHERE id = $1 AND came_from IS NULL'", "WHERE id = $1'") }] },
  { id: 'metrics-zero-not-null', title: 'i = 0 при нуле показов вместо «нет данных» (CFG-I7, AC-9)',
    edits: [{ file: growth, apply: once('i_per_1000: impressions === 0 ? null :', 'i_per_1000: impressions === 0 ? 0 :') }] },
  { id: 'sweep-drops-logged', title: 'сторож удаляет сессии с записями журнала — ответы выпадают из сводки (AC-12)',
    edits: [{ file: visitor, apply: once('        AND NOT EXISTS (SELECT 1 FROM question_log q WHERE q.visitor_session_id = s.id)\n', '') }] },
  { id: 'same-origin-any-site', title: 'любой Sec-Fetch-Site без Origin признаётся своим origin',
    edits: [{ file: origin, apply: once("headers.get('sec-fetch-site') === 'same-origin'", "headers.get('sec-fetch-site') !== null") }] },
  { id: 'publish-bool-coerce', title: 'публикация принимает не-boolean (строку «true»)',
    edits: [{ file: cabinet, apply: once("if (typeof input.enabled !== 'boolean' || typeof input.indexable !== 'boolean')", 'if (input.enabled === undefined || input.indexable === undefined)') }] },
  { id: 'arrival-on-login', title: 'приход пишется и при входе, а не только при регистрации',
    edits: [{ file: auth, apply: once("if (action === 'register' && deps.recordArrival)", 'if (deps.recordArrival)') }] },
];
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts', 'docs']) cpSync(name, join(directory, name), {
    recursive: true, filter: (path) => !/(^|\/)(node_modules|dist|\.next|artifacts|features|discovery)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'docker-compose.yml', '.env.example']) cpSync(name, join(directory, name));
  mkdirSync(join(directory, 'node_modules', '@n6'), { recursive: true });
  for (const entry of readdirSync(join(project, 'node_modules'))) {
    if (entry !== '@n6') symlinkSync(join(project, 'node_modules', entry), join(directory, 'node_modules', entry));
  }
  for (const [name, path] of [['db', 'packages/db'], ['rag', 'packages/rag'], ['queue', 'packages/queue'], ['web', 'apps/web'], ['worker', 'apps/worker']]) {
    symlinkSync(join(directory, path), join(directory, 'node_modules', '@n6', name), 'dir');
  }
  const run = (id, phase) => {
    const logfile = join(output, `${id}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
    try {
      result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', ...TESTS],
        { cwd: directory, stdio: ['ignore', fd, fd], timeout: 900000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
    const log = readFileSync(logfile, 'utf8');
    const summaryLine = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога';
    return { code: result.error ? null : result.status, summary: summaryLine, skipped: /skipped/.test(summaryLine) };
  };
  for (const mutation of mutations) {
    const originals = mutation.edits.map(({ file, apply }) => {
      const path = join(directory, file), source = readFileSync(path, 'utf8');
      const mutated = apply(source);
      if (mutated === null || mutated === source) throw new Error(`Якорь мутации не уникален или не найден: ${mutation.id} (${file})`);
      return { path, source, mutated };
    });
    for (const edit of originals) writeFileSync(edit.path, edit.mutated);
    const red = run(mutation.id, 'red');
    for (const edit of originals) writeFileSync(edit.path, edit.source);
    const green = run(mutation.id, 'green');
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла (ошибка трансформации тоже даёт 1).
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
