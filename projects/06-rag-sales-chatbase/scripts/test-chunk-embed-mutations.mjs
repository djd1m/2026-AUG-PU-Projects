// из N6 scripts/test-pdf-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление
// → зелёный». Мутации стражей фичи chunk-embed (постановка координатора): фильтр bot_id убран из поиска;
// фрагменты пишутся вне транзакции страницы; повтор пачки не списывает квоту; вектор 3072 принимается.
// Наборы chunk-embed и resume ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе стека n6-test:
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-chunk-embed-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционные наборы пропустились бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: наборы chunk-embed и resume пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-chunk-embed-mutations-'));
const output = resolve('tests/artifacts/chunk-embed/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/chunk.test.ts', 'tests/openrouter.test.ts', 'tests/spend.test.ts', 'tests/chunk-embed.integration.test.ts', 'tests/resume.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const both = (...steps) => (source) => steps.reduce((s, step) => (s === null ? null : step(s)), source);
const chunks = 'packages/db/src/chunks.ts';
const mutations = [
  { id: 'bot-filter-removed', title: 'поиск без фильтра bot_id: ближайшие фрагменты ЧУЖОГО бота попадают в ответ (NFR-SEC-001)', file: chunks,
    apply: both(once('SELECT c.id, c.embedding <=> $2::vector AS distance FROM chunk c WHERE c.bot_id = $1',
      'SELECT c.id, c.embedding <=> $2::vector AS distance FROM chunk c WHERE $1::uuid IS NOT NULL'),
    once('JOIN chunk c ON c.id = n.id AND c.bot_id = $1 JOIN', 'JOIN chunk c ON c.id = n.id JOIN')) },
  { id: 'chunks-outside-page-tx', title: 'фрагменты пишутся отдельной транзакцией после страницы: сбой записи оставляет страницу с хэшем без фрагментов', file: chunks,
    apply: once(`  return transaction(pool, async (tx) => {
    const pageId = await upsertPageTx(tx, lease, page, progress);
    const counts = await replaceChunksTx(tx, lease, pageId, chunks);
    return { pageId, ...counts };
  });`, `  const pageId = await transaction(pool, (tx) => upsertPageTx(tx, lease, page, progress));
  const counts = await transaction(pool, (tx) => replaceChunksTx(tx, lease, pageId, chunks));
  return { pageId, ...counts };`) },
  { id: 'retry-not-charged', title: 'повтор пачки после 429/5xx не списывает квоту (счёт по успехам/первой попытке, model-call-cost п.4)', file: 'packages/rag/src/spend.ts',
    apply: once('    if (call.charge) {\n      const decision = await call.charge();', '    if (call.charge && attempt === 1) {\n      const decision = await call.charge();') },
  { id: 'vector-3072-accepted', title: 'проверка длины вектора снята: 3072 принимается как 1536 (ADR-001)', file: 'packages/rag/src/constants.ts',
    apply: once('vector.length === EMBED_DIMENSIONS &&', 'vector.length > 0 &&') },
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
    const skipped = /skipped/.test(summary);
    return { code: result.error ? null : result.status, summary, skipped };
  };
  for (const mutation of mutations) {
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    const mutated = mutation.apply(source);
    if (mutated === null || mutated === source) throw new Error(`Якорь мутации не уникален или не найден: ${mutation.id}`);
    writeFileSync(path, mutated);
    const red = run(mutation.id, 'red');
    writeFileSync(path, source);
    const green = run(mutation.id, 'green');
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла (ошибка трансформации тоже даёт 1).
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { reap(); rmSync(directory, { recursive: true, force: true }); }
