// из N6 scripts/test-ceilings-mutations.mjs (он — из N5 scripts/test-limits-mutations.mjs): та же схема
// «копия проекта → дефект → красный прогон → восстановление → зелёный». Мутации стражей квоты и расхода
// (Refinement «Стражи и мутации», постановка фичи quota-and-spend). Тесты квоты ходят в НАСТОЯЩИЙ Postgres:
// запускать в образе стека n6-test, где задан DATABASE_URL (N6_ACCEPTANCE=1 запрещает пропуски):
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-quota-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — тесты квоты пропустились бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: тесты квоты пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-quota-mutations-'));
const output = resolve('tests/artifacts/quota-and-spend/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/quota.concurrency.test.ts', 'tests/spend.test.ts', 'tests/quota-keys.test.ts', 'tests/openrouter.test.ts', 'tests/probes.test.ts'];
// Заменить отрезок от начала start до конца end (оба якоря обязаны быть уникальны).
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const quota = 'packages/db/src/quota.ts', spend = 'packages/rag/src/spend.ts', ceilings = 'packages/db/src/ceilings.ts';
const mutations = [
  { id: 'single-statement', title: 'однооператорная форма INSERT … ON CONFLICT DO UPDATE … WHERE (V2-R01 N5)', file: quota,
    apply: span('await tx.query(`INSERT INTO quota_counter', '[c.scope, c.scopeKey, c.period, c.n, c.limit]);',
      'const result = await tx.query(`INSERT INTO quota_counter (scope, scope_key, period, used) VALUES ($1, $2, $3, $4)\n' +
      '      ON CONFLICT (scope, scope_key, period) DO UPDATE SET used = quota_counter.used + $4\n' +
      '      WHERE quota_counter.used::bigint + $4 <= $5 RETURNING used`, [c.scope, c.scopeKey, c.period, c.n, c.limit]);') },
  { id: 'read-then-write', title: '«прочитать, потом записать» вместо UPDATE … WHERE used + n <= limit', file: quota,
    apply: span('const result = await tx.query(`UPDATE quota_counter', '[c.scope, c.scopeKey, c.period, c.n, c.limit]);',
      'const current = await tx.query(`SELECT used FROM quota_counter WHERE scope = $1 AND scope_key = $2 AND period = $3`, [c.scope, c.scopeKey, c.period]);\n' +
      '    const result = Number(current.rows[0].used) + c.n <= c.limit\n' +
      '      ? await tx.query(`UPDATE quota_counter SET used = used + $4 WHERE scope = $1 AND scope_key = $2 AND period = $3 RETURNING used`, [c.scope, c.scopeKey, c.period, c.n])\n' +
      '      : { rowCount: 0 };') },
  { id: 'count-by-success', title: 'счёт по успехам: квота и строка attempt — ПОСЛЕ удачного вызова', file: spend,
    apply: span('    if (call.charge) {', 'const { value, tokens } = await call.run(attempt);',
      '    try {\n      const { value, tokens } = await call.run(attempt);\n' +
      '      if (call.charge) { const decision = await call.charge(); if (!decision.granted) return { status: \'refused\', scope: decision.scope, attempts: attempt - 1 }; }\n' +
      "      await call.spend({ ...call.event, attempt_no: attempt, phase: 'attempt', result: 'started' });") },
  { id: 'no-visitor-limit', title: 'нет предела на посетителя: visitor_answers не списывается', file: ceilings,
    apply: span("    { scope: 'visitor_answers',", "limit: ceiling(ceilings, 'visitor_answers') },\n", '') },
  { id: 'create-spends-answers', title: 'создание предпросмотра списывает :answers вместо :create (Refinement)', file: ceilings,
    apply: span('`${browser(input.browserSession)}:create`, period: day, n: 1, limit: ceiling(ceilings, \'preview_session:create\')', "'preview_session:create')",
      '`${browser(input.browserSession)}:answers`, period: day, n: 1, limit: ceiling(ceilings, \'preview_session:answers\')') },
  { id: 'dimension-unchecked', title: 'клиент не сверяет длину вектора с 1536 (ADR-001)', file: 'packages/rag/src/openrouter.ts',
    apply: span('if (!isEmbeddingOfDimension(embedding)) {', '}\n        return embedding', 'return embedding') },
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
