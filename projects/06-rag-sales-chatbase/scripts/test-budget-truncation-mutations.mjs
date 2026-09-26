// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный». Мутации стражей budget-truncation (A-N6-052): возвращают дефект стенда 26.09 (исчерпание собственного бюджета
// роняет задачу целиком) и соседние: предпроверка остатка снята (первая пачка длинной страницы оплачивается зря),
// диспетчер теряет исход обработчика (пометка не доходит до базы), ноль страниц при исчерпании — пустой done,
// «Обновить» не сбрасывает пометку.
// Наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-budget-truncation-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-budget-mutations-'));
const output = resolve('tests/artifacts/budget-truncation/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/budget-truncation.integration.test.ts', 'tests/chunk-embed.integration.test.ts', 'tests/source-lifecycle.integration.test.ts', 'tests/enums.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  return a < 0 || source.indexOf(from, a + 1) >= 0 ? null : source.slice(0, a) + to + source.slice(a + from.length);
};
// Несколько правок ОДНОГО файла — одной цепочкой над одним текстом: отдельные правки затёрли бы друг друга.
const chain = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const embedder = 'apps/worker/src/embed/embed-and-store.ts', runner = 'apps/worker/src/run-index-job.ts', crawl = 'apps/worker/src/crawl/crawl-site.ts',
  sources = 'packages/db/src/sources.ts';
const PRECHECK = `      if (remaining.job !== null && pageTokens > remaining.job) throw new EmbedBudgetExhausted('embed_budget');
      if (remaining.series !== null && pageTokens > remaining.series) throw new EmbedBudgetExhausted('series_embed_budget');
`;
const mutations = [
  { id: 'own-budget-fails-job', title: 'исчерпание собственного бюджета — снова отказ всей задачи quota_refused (дефект стенда 26.09)',
    edits: [{ file: embedder, apply: chain(
      once(PRECHECK, ''),
      once('      if (own) throw new EmbedBudgetExhausted(own);', "      if (own) throw new StepFailure('quota_refused');")) }] },
  { id: 'precheck-removed', title: 'остаток бюджета не проверяется до эмбеддинга страницы — первая пачка длинной страницы оплачивается и выбрасывается',
    edits: [{ file: embedder, apply: once(PRECHECK, '') }] },
  { id: 'dispatcher-drops-outcome', title: 'processByKind не возвращает исход обработчика — пометка усечения не доходит до completeIndexJob',
    edits: [{ file: runner, apply: once('    return processors[kind](lease);', '    await processors[kind](lease);') }] },
  { id: 'zero-pages-done', title: 'бюджет кончился до первой страницы — пустой done вместо отказа (SC-US-001-3)',
    edits: [{ file: crawl, apply: once("  if (pagesRead + pagesUnchanged === 0) {", "  if (pagesRead + pagesUnchanged === 0 && stoppedBy !== 'embed_budget') {") }] },
  { id: 'reindex-keeps-mark', title: '«Обновить» не сбрасывает пометку усечения',
    edits: [{ file: sources, apply: once("SET status = 'queued', failure_reason = NULL, truncated_by = NULL,", "SET status = 'queued', failure_reason = NULL,") }] },
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
