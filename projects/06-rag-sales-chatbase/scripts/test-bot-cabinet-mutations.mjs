// из N6 scripts/test-preview-flow-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный»; мутация может править несколько файлов сразу. Мутации стражей фичи bot-cabinet (постановка координатора):
// снята проверка владельца (OWNED без account_id — чужой бот доступен); код установки выдаётся без контакта для
// «не знаю»; claim и CreateBot без FOR UPDATE (carry_over ревью preview-flow, находка 1: гонка claim).
// Наборы bot-cabinet.integration и preview-flow.integration ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-bot-cabinet-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-bot-cabinet-mutations-'));
const output = resolve('tests/artifacts/bot-cabinet/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/bot-cabinet.integration.test.ts', 'tests/bot-cabinet.unit.test.ts', 'tests/preview-flow.integration.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const bots = 'packages/db/src/bots.ts', settings = 'packages/rag/src/bot-settings.ts', previews = 'packages/db/src/previews.ts';
const mutations = [
  { id: 'owner-check-removed', title: 'проверка владельца снята: OWNED без account_id — чужой бот читается и правится (канон: «Чужой ресурс — 404»)',
    edits: [{ file: bots, apply: once("const OWNED = `b.id = $1 AND b.account_id = $2 AND b.status = 'active' AND a.status = 'active'`;",
      "const OWNED = `b.id = $1 AND $2::uuid IS NOT NULL AND b.status = 'active' AND a.status = 'active'`;") }] },
  { id: 'install-without-contact', title: 'код установки выдаётся без контакта для «не знаю» (SC-US-005-3, FR-BOT-001)',
    edits: [{ file: settings, apply: once("  if (!readContact(input.contact)) return { kind: 'contact_required' };\n", '') }] },
  { id: 'claim-without-for-update', title: 'claim и CreateBot без FOR UPDATE: строка аккаунта и строка предпросмотра не блокируются (carry_over preview-flow, находка 1)',
    edits: [
      { file: bots, apply: once("'SELECT plan, status FROM account WHERE id = $1 FOR UPDATE'", "'SELECT plan, status FROM account WHERE id = $1'") },
      { file: previews, apply: once('     FOR UPDATE OF p`, [input.tokenHash', '     `, [input.tokenHash') },
    ] },
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
