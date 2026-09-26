// из N6 scripts/test-widget-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи visitor-ask-and-limits (постановка координатора): снят предел на посетителя (visitor_answers);
// история принимается от клиента; CORS отвечает `*`; ответ непроверенного бота показывается (A-N6-035); счёт по УСПЕХАМ
// (квота списывается после вызова); + ревью quota-and-spend M1: счётчик проб «дописать, потом прочитать».
// Наборы visitor-ask.integration и quota.concurrency ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-visitor-ask-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-ask-mutations-'));
const output = resolve('tests/artifacts/visitor-ask-and-limits/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/widget-ask.unit.test.ts', 'tests/widget-handler.unit.test.ts', 'tests/visitor-ask.integration.test.ts', 'tests/quota.concurrency.test.ts',
  'tests/spend.test.ts', 'tests/probe.concurrency.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const chain = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const ceilings = 'packages/db/src/ceilings.ts', ask = 'apps/web/src/server/widget-ask-handler.ts', cors = 'apps/web/src/server/check-origin.ts',
  spend = 'packages/rag/src/spend.ts';
const mutations = [
  { id: 'visitor-limit-removed', title: 'снят предел на посетителя: visitorAnswerCharges не списывает visitor_answers (FR-LIMIT-001, SC-US-007-1/3)',
    edits: [{ file: ceilings, apply: once("    { scope: 'visitor_answers', scopeKey: uuid(input.visitorSession, 'сессия посетителя'), period: day, n: 1, limit: ceiling(ceilings, 'visitor_answers') },\n", '') }] },
  { id: 'history-from-client', title: 'история принимается от клиента: ключ history разрешён и ходы тела идут в промпт (ревью rag-answer, находка 2)',
    edits: [{ file: ask, apply: (source) => {
      const a = once("const ASK_KEYS: readonly string[] = ['visitor_session', 'question'];", "const ASK_KEYS: readonly string[] = ['visitor_session', 'question', 'history'];")(source);
      return a && once('request: { question: body.question, history: session.history } });', 'request: { question: body.question, history: Array.isArray(body.history) ? body.history as HistoryTurn[] : session.history } });')(a);
    } }] },
  { id: 'cors-wildcard', title: 'CORS отвечает `Access-Control-Allow-Origin: *` вместо origin хозяина (FR-WIDGET-002, SC-US-008-2)',
    edits: [{ file: cors, apply: once("return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };", "return { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' };") }] },
  { id: 'unverified-shown', title: 'ответ модели показывается боту без отметки «Я проверил ответы бота» (A-N6-035)',
    edits: [{ file: ask, apply: once('if (!bot.row.answersVerified) {', 'if (bot.row.answersVerified === null) {') }] },
  { id: 'charge-on-success', title: 'счёт по УСПЕХАМ: квота списывается после удачного вызова — отказ шлюза бесплатен (model-call-cost п.4)',
    edits: [{ file: spend, apply: span('    if (call.charge) {', "      return { status: 'ok', value, attempts: attempt };",
      `    await call.spend({ ...call.event, attempt_no: attempt, phase: 'attempt', result: 'started' });
    try {
      const { value, tokens } = await call.run(attempt);
      if (call.charge) { const decision = await call.charge(); if (!decision.granted) return { status: 'refused', scope: decision.scope, attempts: attempt - 1 }; }
      await writeOutcome(call, attempt, 'success', tokens);
      return { status: 'ok', value, attempts: attempt };`) }] },
  { id: 'probe-read-then-write', title: 'счётчик проб старта «дописать строку, потом прочитать весь файл» (прежний код; ревью quota-and-spend M1)',
    edits: [{ file: spend, apply: chain(
      once("import { mkdirSync, openSync, writeSync, closeSync } from 'node:fs';", "import { mkdirSync, openSync, writeSync, closeSync, readFileSync } from 'node:fs';"),
      span('  const dir = dirname(validateSpendPath(spendPath));', '  throw new Error(`проба ${kind} исчерпала', [
        "  const file = join(dirname(validateSpendPath(spendPath)), `probe-${kind}-${day}.log`);",
        "  const fd0 = openSync(file, 'a', 0o600);",
        "  try { writeSync(fd0, `${new Date().toISOString()} ${process.pid}\\n`); } finally { closeSync(fd0); }",
        "  const used = readFileSync(file, 'utf8').split('\\n').filter(Boolean).length;",
        '  if (used <= PROBE_DAILY_LIMIT) return used;',
        '  throw new Error(`проба ${kind} исчерпала',
      ].join('\n'))) }] },
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
