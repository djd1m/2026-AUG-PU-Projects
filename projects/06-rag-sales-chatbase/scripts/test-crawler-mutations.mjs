// из N6 scripts/test-index-job-mutations.mjs — та же схема «копия проекта → дефект → красный прогон →
// восстановление → зелёный». Мутации стражей краулера (постановка фичи crawler: без проверки IP после
// перенаправления, без robots, без потолка размера; Refinement «Стражи и мутации»: CheckAddress только до
// DNS). Набор crawl-job ходит в НАСТОЯЩИЙ Postgres: запускать в образе стека n6-test (N6_ACCEPTANCE=1):
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-crawler-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — тесты фенса пропустились бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: набор crawl-job пропустился бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-crawler-mutations-'));
const output = resolve('tests/artifacts/crawler/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/ssrf.test.ts', 'tests/robots.test.ts', 'tests/crawl.test.ts', 'tests/crawl-pathological.test.ts', 'tests/crawl-job.integration.test.ts'];
// Заменить отрезок от начала start до конца end (оба якоря обязаны быть уникальны).
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
// Несколько замен в одном файле: каждая обязана сработать (иначе мутация не применена — это отказ, не «зелёное»).
const all = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const once = (from, to) => span(from, from, to);
const extract = 'apps/worker/src/crawl/extract-text.ts', get = 'apps/worker/src/crawl/safe-get.ts', check = 'packages/rag/src/check-address.ts', robots = 'apps/worker/src/crawl/robots.ts';
const mutations = [
  { id: 'redirect-unchecked', title: 'проверка адреса только у первого запроса: Location перенаправления не проверяется', file: get,
    apply: once('const checked = await checkAddress(url, resolve);',
      "const checked = hop === 0 ? await checkAddress(url, resolve) : { url, ip: url.hostname.replace(/^\\[|\\]$/g, ''), family: 4 as const, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) };") },
  { id: 'robots-ignored', title: 'robots.txt читается, но не соблюдается: isAllowed всегда true', file: robots,
    apply: once('return best ? best.allow : true;', 'void best; return true;') },
  { id: 'size-limit-removed', title: 'нет потолка размера страницы: ни по Content-Length, ни по принятым байтам', file: get,
    apply: all(once('if (Number.isFinite(declared) && declared > options.maxBytes)', 'if (Number.isFinite(declared) && declared > Number.POSITIVE_INFINITY)'),
      once('if (size > options.maxBytes)', 'if (size > Number.POSITIVE_INFINITY)')) },
  { id: 'check-before-dns-only', title: 'CheckAddress только до DNS: адреса из ответа DNS не проверяются (Refinement «Стражи»)', file: check,
    apply: once("if (addresses.some(isBlockedIp)) throw new AddressRefused('blocked_address', 'адрес частной или служебной сети');",
      "if (isIP(host) && addresses.some(isBlockedIp)) throw new AddressRefused('blocked_address', 'адрес частной или служебной сети');") },
  { id: 'first-address-only', title: 'проверяется только ПЕРВЫЙ адрес ответа DNS, а не каждый', file: check,
    apply: once("if (addresses.some(isBlockedIp)) throw", "if (isBlockedIp(addresses[0]!)) throw") },
  // После REJECT ревью (BLOCKER-1/2, MEDIUM-1): вернуть прежние реализации — тест времени/поведения краснеет.
  { id: 'robots-regex-backtracking', title: 'правило robots снова регэксп из «*» → «.*» (ReDoS, BLOCKER-1)', file: robots,
    apply: once('    if (!matchRule(rule, pathWithQuery)) continue;',
      "    if (!new RegExp('^' + rule.path.replace(/\\$$/, '').split('*').map((p) => p.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('.*') + (rule.path.endsWith('$') ? '$' : '')).test(pathWithQuery)) continue;") },
  { id: 'extract-tolower-per-tag', title: 'html.toLowerCase() всего документа на каждый сырой тег (O(n×k), BLOCKER-2)', file: extract,
    apply: once('const end = closer.exec(html)?.index ?? -1;', 'const end = html.toLowerCase().indexOf(`</${name}`, position); void closer;') },
  { id: 'unterminated-tag-rescan', title: 'незакрытый тег — «<» как текст и повторный поиск с каждой позиции (O(n²), как прежний регэксп)', file: extract,
    apply: once("if (j >= html.length) return { kind: 'skip', next: html.length };", "if (j >= html.length) return { kind: 'text', text: '<', next: i + 1 };") },
  { id: 'downgrade-allowed', title: 'перенаправление https → http не отвергается (MEDIUM-1)', file: get,
    apply: once("if (current.protocol === 'https:' && next.protocol === 'http:') throw new FetchFailed('downgrade');", 'void 0;') },
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
        { cwd: directory, stdio: ['ignore', fd, fd], timeout: 600000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
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
} finally { rmSync(directory, { recursive: true, force: true }); }
