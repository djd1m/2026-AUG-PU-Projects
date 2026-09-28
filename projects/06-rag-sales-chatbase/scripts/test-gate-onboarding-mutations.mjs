// из N6 scripts/test-public-page-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей gate-onboarding (A-N6-066): заглушка ворот A-N6-035 не записывается (инцидент стенда 28.09); сводка
// считает заглушки как «не знал»; сводка считает вопросы, а не посетителей; триггер снимает отметку молча (без пометки);
// действие владельца не стирает пометку о снятии.
// Интеграционные наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-gate-onboarding-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-gate-mutations-'));
const output = resolve('tests/artifacts/gate-onboarding/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/gate-onboarding.unit.test.ts', 'tests/gate-onboarding.integration.test.ts', 'tests/widget-ask.unit.test.ts', 'tests/enums.test.ts',
  'tests/visitor-ask.integration.test.ts', 'tests/public-page.integration.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  if (a < 0 || source.indexOf(from, a + 1) >= 0) return null;
  return source.slice(0, a) + to + source.slice(a + from.length);
};
const ask = 'apps/web/src/server/widget-ask-handler.ts', summary = 'packages/db/src/summary.ts', m011 = 'packages/db/migrations/011_gate_onboarding.sql',
  bots = 'packages/db/src/bots.ts';
const mutations = [
  { id: 'stub-not-logged', title: 'заглушка ворот не пишется в журнал — владелец видит «вопросов ещё не было» (инцидент 28.09, AC-5)',
    edits: [{ file: ask, apply: once("      try { await deps.logNotVerified(bot.row.botId, sessionId); } catch { log('Виджет: исход not_verified не записан'); }\n", '') }] },
  { id: 'stub-as-unknown', title: 'сводка считает заглушки как «не знал» — смешение исходов (AC-6)',
    edits: [{ file: summary, apply: once("count(*) FILTER (WHERE outcome = 'unknown')::int AS unknown", "count(*) FILTER (WHERE outcome IN ('unknown', 'not_verified'))::int AS unknown") }] },
  { id: 'stub-counts-questions', title: 'сводка считает вопросы, а не посетителей (AC-6/7)',
    edits: [{ file: summary, apply: once('count(DISTINCT visitor_session_id) FILTER', 'count(visitor_session_id) FILTER') }] },
  { id: 'reset-silent', title: 'триггер снимает отметку молча, без пометки «когда и почему» (AC-8)',
    edits: [{ file: m011, apply: once("UPDATE bot SET answers_verified_at = NULL, answers_verified_reset_at = now(), answers_verified_reset_reason = 'new_material'", 'UPDATE bot SET answers_verified_at = NULL') }] },
  { id: 'reset-not-cleared', title: 'действие владельца с отметкой не стирает пометку о снятии — баннер показывает старую дату (AC-9)',
    edits: [{ file: bots, apply: once(',\n        answers_verified_reset_at = NULL, answers_verified_reset_reason = NULL\n', '\n') }] },
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
    if (new Set(files).size !== files.length) throw new Error(`Две правки одного файла в мутации ${mutation.id}: вторая затрёт первую — сведите их chain()`);
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
