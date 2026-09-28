// из N6 scripts/test-crawl-coverage-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный». Мутации стражей text-source (A-N6-080, FR-SOURCE-005): текстовый файл по адресу проходит ВСЕ проверки чужого
// адреса ADR-010 — снять проверку адреса после DNS, предел размера, проверку типа, robots на шаге перенаправления, сравнение
// раздела по хэшу («Обновить» эмбеддит заново) и предел страниц тарифа.
// Наборы ходят в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-text-source-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-text-mutations-'));
const output = resolve('tests/artifacts/text-source/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/text-source.test.ts', 'tests/text-source.integration.test.ts', 'tests/enums.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  return a < 0 || source.indexOf(from, a + 1) >= 0 ? null : source.slice(0, a) + to + source.slice(a + from.length);
};
const chain = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const fetchText = 'apps/worker/src/text/fetch-text.ts', processor = 'apps/worker/src/text/text-processor.ts', address = 'packages/rag/src/check-address.ts';
const mutations = [
  { id: 'ssrf-check-removed', title: 'адрес после DNS не проверяется: петля, частные сети и метаданные облака доходят до соединения',
    edits: [{ file: address, apply: once("  if (addresses.some(isBlockedIp)) throw new AddressRefused('blocked_address', 'адрес частной или служебной сети');\n", '') }] },
  { id: 'size-limit-removed', title: 'предел размера файла снят — 2 МиБ + 1 байт читаются целиком',
    edits: [{ file: fetchText, apply: once('  const maxBytes = options.maxBytes ?? TEXT_MAX_BYTES;', '  const maxBytes = Number.MAX_SAFE_INTEGER;') }] },
  { id: 'type-check-removed', title: 'тип по заголовку не проверяется — JSON и страница сайта читаются как текст',
    edits: [{ file: fetchText, apply: chain(
      once("  if (HTML_TYPE.test(result.contentType)) throw new TextFetchFailure('not_text', 'html_type');\n", ''),
      once("  if (!isTextType(result.contentType)) throw new TextFetchFailure('not_text', `type:${result.contentType.split(';')[0]!.slice(0, 40) || 'none'}`);\n", ''),
      once('status < 300 && isTextType(type) });', 'status < 300 });')) }] },
  { id: 'robots-hop-unchecked', title: 'robots.txt не проверяется на шаге перенаправления — запрещённый путь запрашивается',
    edits: [{ file: fetchText, apply: once('      if (robots && u.origin === url.origin && !isAllowed(robots, u.pathname + u.search)) { robotsRefusedHop = true; return false; }\n', '') }] },
  { id: 'reembed-unchanged', title: '«Обновить» не сравнивает раздел по хэшу — неизменный файл эмбеддится заново',
    edits: [{ file: processor, apply: once('known.has(`${label}\\u0000${section.contentHash}`)', 'false') }] },
  { id: 'page-budget-removed', title: 'предел страниц тарифа не применяется к разделам файла — 55 из 55 на free',
    edits: [{ file: processor, apply: once('const reading = sections.slice(0, pageBudget);', 'const reading = sections.slice(0);') }] },
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
