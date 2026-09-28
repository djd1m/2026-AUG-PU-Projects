// из N6 scripts/test-budget-truncation-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный». Мутации стражей crawl-coverage (A-N6-070): возвращают дефект стенда 28.09 — обход FIFO (42 курса вытеснили
// все записи блога) и «50 из 50» без пометки усечения — и соседние: lastmod не учитывается, pages_total снова равен
// прочитанным, «Обновить» не сбрасывает примеры непрочитанного, в примеры попадают параметры запроса.
// Наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-crawl-coverage-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-coverage-mutations-'));
const output = resolve('tests/artifacts/crawl-coverage/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/crawl-coverage.test.ts', 'tests/crawl-coverage.integration.test.ts', 'tests/crawl.test.ts', 'tests/budget-truncation.integration.test.ts',
  'tests/source-lifecycle.integration.test.ts', 'tests/enums.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  return a < 0 || source.indexOf(from, a + 1) >= 0 ? null : source.slice(0, a) + to + source.slice(a + from.length);
};
// Несколько правок ОДНОГО файла — одной цепочкой над одним текстом: отдельные правки затёрли бы друг друга.
const chain = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const frontier = 'apps/worker/src/crawl/frontier.ts', crawl = 'apps/worker/src/crawl/crawl-site.ts', processor = 'apps/worker/src/crawl/site-processor.ts',
  jobs = 'packages/db/src/index-jobs.ts', sources = 'packages/db/src/sources.ts';
const mutations = [
  { id: 'fifo-order', title: 'обход снова FIFO: один раздел на весь сайт и lastmod не учитывается (дефект стенда 28.09 — 0 записей блога из 10)',
    edits: [{ file: frontier, apply: once('    const key = sectionOf(href);', "    const key = '';") },
      { file: crawl, apply: once('seen.add(link); queue.push(link, lastmod);', 'seen.add(link); queue.push(link);') }] },
  { id: 'lastmod-ignored', title: 'lastmod из sitemap не передаётся очереди — свежие записи раздела не раньше старых',
    edits: [{ file: crawl, apply: once('seen.add(link); queue.push(link, lastmod);', 'seen.add(link); queue.push(link);') }] },
  { id: 'fifty-of-fifty', title: 'предел страниц снова не помечается: done без truncated_by и без известных адресов — «50 из 50»',
    edits: [{ file: processor, apply: chain(
      once("    if (!truncated && result.stoppedBy === 'page_budget') truncated = 'page_budget';\n", ''),
      once("    const coverage = result.stoppedBy === 'exhausted' ? null : { pagesKnown: result.pagesKnown, unreadSample: result.unreadSample };",
        '    const coverage = null;')) }] },
  { id: 'total-equals-read', title: 'pages_total при завершении — число прочитанных, а не известных',
    edits: [{ file: jobs, apply: once('ELSE GREATEST($5::int, pages_done) END', 'ELSE pages_done END') }] },
  { id: 'reindex-keeps-unread', title: '«Обновить» не сбрасывает примеры непрочитанного от прошлой серии',
    edits: [{ file: sources, apply: once('truncated_by = NULL, unread_sample = NULL,', 'truncated_by = NULL,') }] },
  { id: 'sample-with-query', title: 'в примеры непрочитанного попадают параметры запроса (метки, почта)',
    edits: [{ file: frontier, apply: once('  const path = new URL(href).pathname;\n  let shown', '  const u = new URL(href), path = u.pathname + u.search;\n  let shown') }] },
];
// Убитый по таймауту тест оставляет дочерний процесс разбора сиротой — прибрать его, не трогая чужое.
const reap = () => {
  for (const script of ['apps/worker/src/pdf/extract-child.mjs', 'tests/fixtures/pdf-child-fakes.mjs']) spawnSync('pkill', ['-KILL', '-f', join(directory, script)]);
};
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
    } finally { closeSync(fd); reap(); }
    const log = readFileSync(logfile, 'utf8');
    const summary = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога';
    return { code: result.error ? null : result.status, summary, skipped: /skipped/.test(summary) };
  };
  const seen = new Set();
  for (const mutation of mutations) {
    for (const { file } of mutation.edits) {
      // Одна мутация — одна правка на файл: две записи в один путь затёрли бы первую (урок фичи 15).
      if (seen.has(`${mutation.id}:${file}`)) throw new Error(`Мутация ${mutation.id} правит ${file} дважды — собрать в chain`);
      seen.add(`${mutation.id}:${file}`);
    }
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
} finally { reap(); rmSync(directory, { recursive: true, force: true }); }
