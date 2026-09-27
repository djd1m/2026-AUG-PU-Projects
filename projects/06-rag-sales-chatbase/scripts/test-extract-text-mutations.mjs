// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный», без БД (извлечение текста — чистые функции и дочерний процесс PDF).
// Мутации стражей extract-text-separators: снят пробел на границе соседних элементов (дефект стенда возвращён); пробел
// у ЛЮБОГО открывающего тега (перелечивание: «при мер»); склейка PDF без геометрии (прежний код); сборка воркера не
// копирует page-text.mjs (в образе каждый PDF упал бы ERR_MODULE_NOT_FOUND).
//   node scripts/test-extract-text-mutations.mjs   (из каталога проекта, нужны node_modules)
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — дефект прошёл незамеченным или восстановление красное;
// 2 — проверка НЕ ВЫПОЛНЕНА (нет vitest).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd();
const vitest = join(project, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitest)) { console.error('vitest не установлен — мутационный прогон НЕ ВЫПОЛНЕН'); process.exit(2); }
const directory = mkdtempSync(join(tmpdir(), 'n6-extract-mutations-'));
const output = resolve(process.env.N6_MUTATIONS_OUT || 'tests/artifacts/extract-text-separators/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/extract-text-separators.test.ts', 'tests/crawl.test.ts'];
const once = (from, to) => (source) => (source.indexOf(from) < 0 || source.indexOf(from, source.indexOf(from) + 1) >= 0 ? null : source.replace(from, to));
const extract = 'apps/worker/src/crawl/extract-text.ts', pdf = 'apps/worker/src/pdf/page-text.mjs', worker = 'apps/worker/package.json';
const mutations = [
  { id: 'boundary-removed', title: 'пробел на границе соседних элементов снят — «целиком5 курсов» (дефект стенда возвращён)',
    file: extract, apply: once("    if (!closing && afterClosingTag && skipDepth === 0) { if (heading) heading.text += ' '; else buffer += ' '; }\n", '') },
  { id: 'space-inside-word', title: 'пробел у ЛЮБОГО открывающего тега — слово, разрезанное тегом, рвётся («при мер»)',
    file: extract, apply: once('if (!closing && afterClosingTag && skipDepth === 0) {', 'if (!closing && skipDepth === 0) {') },
  { id: 'pdf-no-geometry', title: 'склейка элементов PDF без геометрии (прежний код) — «Стрижка1500»',
    file: pdf, apply: once('    if (previous && !previous.eol && previous.g && g) {', '    if (false) {') },
  { id: 'build-not-copying', title: 'сборка воркера не копирует page-text.mjs рядом с extract-child.mjs',
    file: worker, apply: once("['extract-child.mjs', 'page-text.mjs']", "['extract-child.mjs']") },
];
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: (path) => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
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
      result = spawnSync(process.execPath, [vitest, 'run', ...TESTS], { cwd: directory, stdio: ['ignore', fd, fd], timeout: 300000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
    const log = readFileSync(logfile, 'utf8');
    return { code: result.error ? null : result.status, summary: /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога' };
  };
  for (const mutation of mutations) {
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    const mutated = mutation.apply(source);
    if (mutated === null || mutated === source) throw new Error(`Якорь мутации не уникален или не найден: ${mutation.id} (${mutation.file})`);
    writeFileSync(path, mutated);
    const red = run(mutation.id, 'red');
    writeFileSync(path, source);
    const green = run(mutation.id, 'green');
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла.
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
