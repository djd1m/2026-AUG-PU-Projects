// из N6 scripts/test-quota-mutations.mjs (он — из N5 scripts/test-limits-mutations.mjs): та же схема
// «копия проекта → дефект → красный прогон → восстановление → зелёный». Мутации стражей задачи индексации
// (Refinement «Стражи и мутации»: запись без current_fence; постановка фичи index-job-core: статус вне
// набора, молчание читается как «выполняется»). Тесты фенса ходят в НАСТОЯЩИЙ Postgres:
// запускать в образе стека n6-test, где задан DATABASE_URL (N6_ACCEPTANCE=1 запрещает пропуски):
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-index-job-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — тесты фенса пропустились бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: тесты фенса пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-index-job-mutations-'));
const output = resolve('tests/artifacts/index-job-core/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/index-job.fence.test.ts', 'tests/index-job.unit.test.ts', 'tests/enums.test.ts'];
// Заменить отрезок от начала start до конца end (оба якоря обязаны быть уникальны).
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const jobs = 'packages/db/src/index-jobs.ts', enums = 'packages/rag/src/enums.ts';
const mutations = [
  { id: 'progress-without-fence', title: 'запись прогресса без WHERE current_fence (Refinement: «запись без current_fence»)', file: jobs,
    apply: span("pages_total = COALESCE($5, pages_total), updated_at = $6\n    WHERE id = $1 AND current_fence = $2 AND status = 'running'`",
      "WHERE id = $1 AND current_fence = $2 AND status = 'running'`",
      "pages_total = COALESCE($5, pages_total), updated_at = $6\n    WHERE id = $1 AND $2::bigint IS NOT NULL AND status = 'running'`") },
  { id: 'lease-ignores-generation', title: 'аренда не сверяет generation сообщения с current_fence (двойная доставка = два держателя)', file: jobs,
    apply: span("if (!row || Number(row.current_fence) !== message.generation) return null;", "if (!row || Number(row.current_fence) !== message.generation) return null;", "if (!row) return null;") },
  { id: 'attempt-status-out-of-set', title: 'статус попытки вне набора CHECK: «deferred» N5 в JOB_ATTEMPT_STATUS', file: enums,
    apply: span("export const JOB_ATTEMPT_STATUS = ['running', 'done', 'failed'] as const;", "export const JOB_ATTEMPT_STATUS = ['running', 'done', 'failed'] as const;",
      "export const JOB_ATTEMPT_STATUS = ['running', 'deferred', 'done', 'failed'] as const;") },
  { id: 'unknown-status-reads-running', title: 'неизвестный статус задачи читается как running, а не failed', file: enums,
    apply: span("read(INDEX_JOB_STATUS, value, 'failed')", "read(INDEX_JOB_STATUS, value, 'failed')", "read(INDEX_JOB_STATUS, value, 'running')") },
  { id: 'silence-reads-running', title: 'молчание > 5 мин читается как «выполняется» (нет состояния no_response)', file: jobs,
    apply: span("  if (!(silentFor <= INDEX_JOB_STALLED_AFTER_MS))", "state: 'no_response' };", "  void silentFor;") },
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
