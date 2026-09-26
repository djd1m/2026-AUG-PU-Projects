// из N6 scripts/test-crawler-mutations.mjs — та же схема «копия проекта → дефект → красный прогон →
// восстановление → зелёный». Мутации стражей фичи pdf-source (постановка: без таймаута дочернего процесса,
// без проверки магических байтов, скан принят как успех; Refinement «Стражи»: PDF удаляется только после
// успеха; плюс предел памяти, размер только по заявленному и предел плана без блокировки строки бота).
// Набор pdf-job ходит в НАСТОЯЩИЙ Postgres: запускать в образе стека n6-test (N6_ACCEPTANCE=1):
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-pdf-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: набор pdf-job пропустился бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-pdf-mutations-'));
const output = resolve('tests/artifacts/pdf-source/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/pdf-extract.test.ts', 'tests/pdf-boundary.test.ts', 'tests/pdf-multipart.test.ts', 'tests/pdf-job.integration.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const extract = 'apps/worker/src/pdf/extract-pdf.ts', upload = 'apps/web/src/server/source-upload-handler.ts';
const mutations = [
  { id: 'child-timeout-removed', title: 'у дочернего процесса разбора нет таймаута: зависший разбор ждёт вечно', file: extract,
    apply: once("const timer = setTimeout(() => stop('pdf_timeout'), timeoutMs);", 'const timer = setTimeout(() => {}, 0); void timeoutMs;') },
  { id: 'magic-check-removed', title: 'тип не проверяется по первым байтам %PDF- (только расширение/поле)', file: upload,
    apply: once("if (!isPdfMagic(file.data)) return fail(415,", "if (isPdfMagic(file.data) && false) return fail(415,") },
  { id: 'scan-accepted', title: 'скан без текстового слоя принят как успех (правило ≥ 90 % страниц без текста снято)', file: extract,
    apply: once("if (pages.length === 0 || empty * 10 >= pages.length * Math.round(PDF_NO_TEXT_SHARE * 10)) throw new PdfFailure('pdf_no_text_layer');",
      'void empty; void PDF_NO_TEXT_SHARE;') },
  { id: 'memory-limit-removed', title: 'резидентная память дочернего процесса не ограничена (только куча V8)', file: extract,
    apply: once("if (rss !== null && rss > maxRss) stop('pdf_memory');", 'void rss; void maxRss;') },
  { id: 'pdf-deleted-only-on-success', title: 'сырой PDF удаляется только после done, после failed остаётся (Refinement «Стражи», ADR-018)',
    file: 'apps/worker/src/run-index-job.ts',
    apply: once('try { await deps.onSettled?.(lease, outcome); }', "try { if (outcome === 'done') await deps.onSettled?.(lease, outcome); }") },
  { id: 'size-declared-only', title: 'размер тела — только по Content-Length, принятые байты не ограничены', file: upload,
    apply: once('if (size > declared || size > MAX_UPLOAD_BODY_BYTES) {', 'if (size > MAX_UPLOAD_BODY_BYTES * 100) {') },
  { id: 'plan-limit-unlocked', title: 'предел числа PDF считается без блокировки строки бота (считать-потом-писать)', file: 'packages/db/src/pdf-sources.ts',
    apply: once("AND a.status = 'active' FOR UPDATE OF b`", "AND a.status = 'active'`") },
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
    const passed = red.code === 1 && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { reap(); rmSync(directory, { recursive: true, force: true }); }
