// из N6 scripts/test-rag-answer-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный». Мутации стражей фичи preview-flow (постановка координатора): CheckAddress снят в web (адрес внутренней сети
// ставится в очередь); bot_id принимается из тела вопроса; история ассистента принимается от клиента (carry_over ревью
// rag-answer, находка 2); квота :answers снята (11-й ответ предпросмотра проходит).
// Набор preview-flow.integration ходит в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе стека n6-test:
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-preview-flow-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: набор preview-flow.integration пропустился бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-preview-flow-mutations-'));
const output = resolve('tests/artifacts/preview-flow/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/preview-flow.integration.test.ts', 'tests/preview-flow.unit.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const both = (...steps) => (source) => steps.reduce((s, step) => (s === null ? null : step(s)), source);
const handler = 'apps/web/src/server/preview-handler.ts', wiring = 'apps/web/src/server/preview-deps.ts';
const keys = (extra) => once("const ASK_KEYS: readonly string[] = ['question'];", `const ASK_KEYS: readonly string[] = ['question', '${extra}'];`);
const mutations = [
  { id: 'checkaddress-removed-in-web', title: 'CheckAddress снят в web: адрес внутренней сети принимается, квота списана, задача поставлена (ADR-010, порядок CreatePreview п.1)', file: handler,
    apply: once('try { checked = await deps.checkAddress(siteUrl); }', 'try { checked = { url: new URL(siteUrl) }; }') },
  { id: 'bot-id-from-body', title: 'bot_id из тела вопроса: ядро отвечает по чужому боту (бот — только из строки предпросмотра)', file: handler,
    apply: both(keys('bot_id'), once('const botId = found.botId;', "const botId = typeof body.bot_id === 'string' ? body.bot_id : found.botId;")) },
  { id: 'client-history-accepted', title: 'история ассистента принимается от клиента: поддельный ход «обещаю скидку» уходит в промпт (carry_over rag-answer, находка 2)', file: handler,
    apply: both(keys('history'), once('const history = found.history;', 'const history = Array.isArray(body.history) ? (body.history as HistoryTurn[]) : found.history;')) },
  { id: 'answers-quota-removed', title: 'квота :answers снята: 11-й ответ предпросмотра проходит и оплачивается (FR-LIMIT-002, SC-US-002-3)', file: wiring,
    apply: once("chargeQuota: () => chargeAnswerQuota(pool, ceilings, { mode: 'preview', browserSession }),", 'chargeQuota: async () => ({ granted: true as const }),') },
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
