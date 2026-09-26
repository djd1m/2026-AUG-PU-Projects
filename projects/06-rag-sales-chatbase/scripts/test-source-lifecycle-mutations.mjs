// из N6 scripts/test-public-page-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи source-lifecycle (FR-INDEX-004): «Обновить» перечитывает неизменные страницы; уборка исчезнувших
// страниц без условия полного обхода; предел запусков не считается; предел запусков без блокировки строки бота; вторая
// серия поверх идущей задачи; бюджет серии не списывается; бюджет серии не сбрасывается новой серией; удаление источника
// «мягкое»; предел фрагментов после эмбеддинга (страж по исходнику).
// Интеграционные наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -p n6-test-f16 -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-source-lifecycle-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-source-mutations-'));
const output = resolve('tests/artifacts/source-lifecycle/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/source-lifecycle.integration.test.ts', 'tests/source-lifecycle.unit.test.ts', 'tests/bot-cabinet.integration.test.ts', 'tests/pdf-boundary.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  if (a < 0 || source.indexOf(from, a + 1) >= 0) return null;
  return source.slice(0, a) + to + source.slice(a + from.length);
};
const siteProc = 'apps/worker/src/crawl/site-processor.ts', sources = 'packages/db/src/sources.ts', bots = 'packages/db/src/bots.ts',
  embed = 'apps/worker/src/embed/embed-and-store.ts', jobs = 'packages/db/src/index-jobs.ts', crawl = 'apps/worker/src/crawl/crawl-site.ts';
const mutations = [
  { id: 'unchanged-reembedded', title: '«Обновить» перечитывает и переэмбеддит неизменные страницы (content_hash не передаётся обходу) — SC-US-014-1',
    edits: [{ file: siteProc, apply: once('knownHashes: new Set(known.rows.map((r) => r.content_hash)),', 'knownHashes: new Set<string>(),') }] },
  { id: 'prune-without-complete-crawl', title: 'исчезнувшие страницы удаляются и после неполного обхода (временный сбой = «страницы нет»)',
    edits: [{ file: siteProc, apply: once("if (result.stoppedBy === 'exhausted' && transient === 0 && !result.discoveryIncomplete) pruned", 'if (result.stoppedBy) pruned') }] },
  { id: 'discovery-incomplete-ignored', title: 'сбой sitemap не мешает уборке: страницы, найденные только по карте сайта, удаляются (ревью находка 2)',
    edits: [{ file: siteProc, apply: once(' && !result.discoveryIncomplete) pruned', ') pruned') }] },
  { id: 'gone-as-transient', title: '404/410 читаются как временный сбой: удалённая страница с фрагментами остаётся навсегда (ревью находка 5)',
    edits: [{ file: crawl, apply: once("        : result.status === 404 || result.status === 410 ? 'gone'\n", '') }] },
  { id: 'moved-url-kept', title: 'переехавшая неизменная страница сохраняет старый адрес — бот ссылается на недоступный (ревью находка 4)',
    edits: [{ file: siteProc, apply: once("if (visit.kind === 'unchanged') await tx.query(`UPDATE page SET url_or_page = $3", "if (visit.kind === 'unchanged' && false) await tx.query(`UPDATE page SET url_or_page = $3") }] },
  { id: 'lock-order-bot-first', title: 'удаление берёт строку бота ДО задач источника — взаимная блокировка с воркером (ревью находка 1)',
    edits: [{ file: sources, apply: once("    await tx.query('SELECT id FROM index_job WHERE source_id = $1 ORDER BY id FOR UPDATE', [sourceId]);",
      "    if (!(await lockOwnedBot(tx, source.bot_id, accountId))) return null;\n    await tx.query('SELECT id FROM index_job WHERE source_id = $1 ORDER BY id FOR UPDATE', [sourceId]);") }] },
  { id: 'preview-budget-kept', title: '«Обновить» сохранённого предпросмотра оставляет его бюджеты — задача навсегда предпросмотр (ревью находка 3)',
    edits: [{ file: sources, apply: once('      page_budget = NULL, embed_budget = NULL, embed_used = 0, updated_at = $2', '      updated_at = $2') }] },
  { id: 'retry-by-id-unlimited', title: '«Повторить» по id задачи не тратит запуск — обход суточного предела (ревью находка 6)',
    edits: [{ file: jobs, apply: once("    if (!(await recordIndexStartTx(tx, job.bot_id, 'retry'))) return null;\n", '') }] },
  { id: 'starts-not-counted', title: 'предел запусков не считается: recordIndexStartTx всегда разрешает',
    edits: [{ file: sources, apply: once('  if (await indexStartsToday(tx, botId) >= INDEX_STARTS_PER_BOT_DAY) return false;\n', '') }] },
  { id: 'starts-without-bot-lock', title: 'создание сайта считает запуски без блокировки строки бота («прочитать, потом записать» под гонкой)',
    edits: [{ file: bots, apply: once("FOR UPDATE OF b`, [input.botId, input.accountId]);\n    if (!bot.rowCount) return { kind: 'not_found' } as const;\n    // Повтор с тем же Idempotency-Key",
      "`, [input.botId, input.accountId]);\n    if (!bot.rowCount) return { kind: 'not_found' } as const;\n    // Повтор с тем же Idempotency-Key") }] },
  { id: 'second-series-while-running', title: '«Обновить» идущей задачи начинает вторую серию вместо того же index_job_id (повтор-заново)',
    edits: [{ file: sources, apply: once("    if (job.status === 'queued' || job.status === 'running') return { kind: 'running', indexJobId: job.id } as const;\n", '') }] },
  { id: 'series-budget-not-charged', title: 'бюджет серии источника не списывается — один источник съедает суточный предел аккаунта',
    edits: [{ file: embed, apply: once("&& !(await chargeSeriesBudgetTx(tx, lease, tokens, SOURCE_EMBED_BUDGET_BY_PLAN[payer.plan]))) refused", '&& false) refused') }] },
  { id: 'series-budget-not-reset', title: 'новая серия не сбрасывает бюджет серии — «Повторить» после quota_refused отказывает вечно',
    edits: [{ file: jobs, apply: once('series_embed_used = CASE WHEN $4::boolean THEN 0 ELSE series_embed_used END', 'series_embed_used = CASE WHEN $4::boolean THEN series_embed_used ELSE series_embed_used END') }] },
  { id: 'soft-delete', title: 'удаление источника «мягкое»: фрагменты остаются в поиске бота — SC-US-014-2',
    edits: [{ file: sources, apply: once("const removed = await tx.query('DELETE FROM source WHERE id = $1 AND bot_id = $2', [sourceId, source.bot_id]);",
      "const removed = await tx.query(`UPDATE source SET status = 'failed' WHERE id = $1 AND bot_id = $2`, [sourceId, source.bot_id]);") }] },
  { id: 'cap-after-embed', title: 'предел фрагментов страницы применён ПОСЛЕ эмбеддинга (лишнее оплачено) — страж по исходнику',
    edits: [{ file: siteProc, apply: once('const { kept: chunks, dropped } = capPageChunks(chunkDocument({ title: visit.page.title, blocks: visit.page.blocks }));',
      'const chunks = chunkDocument({ title: visit.page.title, blocks: visit.page.blocks }); const dropped = 0;') }] },
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
    const files = mutation.edits.map((e) => e.file);
    if (new Set(files).size !== files.length) throw new Error(`Две правки одного файла в мутации ${mutation.id}: вторая затрёт первую`);
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
