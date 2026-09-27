// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи account-erasure (AC-14 и несущие свойства плана): боты живы после запроса удаления; второй путь к
// deleted; события роста не обезличены; выплата партнёру не ждётся; оплата удаляемому выдаёт план; удаление студии
// забирает ботов клиентов; тихий час игнорируется; файлы PDF удаляются ПОСЛЕ строк.
// Интеграционный набор ходит в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе
//   docker compose -p n6-test-f17 -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-account-erasure-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — дефект прошёл незамеченным или восстановление красное;
// 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: интеграционные наборы пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-erasure-mutations-'));
const output = resolve('tests/artifacts/account-erasure/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/account-erasure.integration.test.ts', 'tests/account-erasure.unit.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const erasure = 'packages/db/src/erasure.ts', payments = 'packages/db/src/payments.ts', growth = 'packages/db/src/growth.ts', tick = 'apps/worker/src/erase-accounts.ts';
const mutations = [
  { id: 'bots-alive-after-request', title: 'запрос удаления не гасит ботов в той же транзакции — виджеты отвечают после удаления (AC-2, AC-3, security.md)',
    edits: [{ file: erasure, apply: once("    await tx.query(`UPDATE bot SET status = 'deleted', public_enabled = false WHERE account_id = $1 AND status <> 'deleted'`, [accountId]);\n", '') }] },
  { id: 'second-deleted-path', title: 'второй путь к account.status = deleted в обход стирания (AC-14)',
    edits: [{ file: growth, apply: (s) => `${s}\nexport async function sneakyDelete(pool: { query: (sql: string, params: unknown[]) => Promise<unknown> }, id: string) {\n  await pool.query(\`UPDATE account SET status = 'deleted' WHERE id = $1\`, [id]);\n}\n` }] },
  { id: 'growth-not-anonymized', title: 'события роста остаются связанными с человеком, ботом и доменом (AC-7, 152-ФЗ)',
    edits: [{ file: erasure, apply: span('  await tx.query(`UPDATE growth_event SET account_id = NULL', '[accountId, bots, sessions]);', '') }] },
  { id: 'no-payout-wait', title: 'доступное партнёра ≥ 1 000 ₽ сгорает сразу, выплата до срока не ждётся (AC-10, ответ владельца 2)',
    edits: [{ file: erasure, apply: once('if (payable > 0 && beforeMargin) {', 'if (false) {') }] },
  { id: 'payment-grants-erasing', title: 'оплата удаляемому аккаунту выдаёт план и начисляет комиссию (AC-10, ответ владельца 1)',
    edits: [{ file: payments, apply: once("    if (owner?.status !== 'active') { await record(intent.account_id, intent.plan, 'account_erasing'); return { applied: false, reason: 'account_erasing' } as const; }\n", '') }] },
  { id: 'studio-drags-client-bots', title: 'удаление студии удаляет ботов, переданных клиентам (AC-11, ответ владельца 4)',
    edits: [{ file: erasure, apply: once("  await tx.query('UPDATE bot SET studio_account_id = NULL WHERE studio_account_id = $1', [accountId]);", "  await tx.query('DELETE FROM bot WHERE studio_account_id = $1', [accountId]);") }] },
  { id: 'no-quiet-hour', title: 'сторож стирает сразу, без тихого часа — задачи в полёте пишут в стираемое (AC-7)',
    edits: [{ file: erasure, apply: once('[new Date(now.getTime() - ERASURE_QUIET_MS), batch]', '[now, batch]') }] },
  { id: 'files-after-rows', title: 'файлы PDF удаляются ПОСЛЕ строк и отметки deleted — сбой тома оставляет файлы навсегда (AC-8, N4 RV-02)',
    edits: [{ file: tick, apply: span('          for (const job of await erasureUploadJobIds(pool, accountId)) await deps.removeUpload(uploadDir, job);',
      'const outcome = await eraseAccount(pool, accountId, now);',
      'const jobs = await erasureUploadJobIds(pool, accountId);\n          const outcome = await eraseAccount(pool, accountId, now);\n          for (const job of jobs) await deps.removeUpload(uploadDir, job);') }] },
  // Находки ревью Codex (docs/features/account-erasure/08_review.md): каждая закреплена тестом, тест — мутацией.
  { id: 'owed-burned', title: 'доступное ≥ 1 000 ₽, не выплаченное к сроку, сгорает вместо долга (ревью H1)',
    edits: [{ file: erasure, apply: once('const burn = money.total - payable;', 'const burn = money.total;') }] },
  { id: 'partial-payout-stops-wait', title: 'после частичной выплаты остаток ≥ 1 000 ₽ больше не ждёт (ревью H1)',
    edits: [{ file: erasure, apply: once('if (payable > 0 && beforeMargin) {',
      "if (payable > 0 && beforeMargin && !(await tx.query(`SELECT 1 FROM commission_entry WHERE partner_account_id = $1 AND kind = 'payout'`, [accountId])).rowCount) {") }] },
  { id: 'finalize-without-payout-lock', title: 'завершение стирания не берёт замок выплаты, выплата не перечитывает статус (ревью H2)',
    edits: [
      { file: erasure, apply: once("  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`partner_payout:${accountId}`]);\n", '') },
      { file: 'packages/db/src/commission.ts', apply: once("    if (fresh?.status !== 'active' && fresh?.status !== 'erasing') return { kind: 'not_found' } as const;\n", '') },
    ] },
  { id: 'dedup-key-kept', title: 'dedup_key событий роста с origin, IP и id остаётся после стирания (ревью H3)',
    edits: [{ file: erasure, apply: once(",\n      dedup_key = 'erased:' || id::text", '') }] },
  { id: 'invites-to-email-kept', title: 'приглашение живой студии на почту стёртого клиента остаётся (ревью H4)',
    edits: [{ file: erasure, apply: span('const INVITES_TO_ACCOUNT_EMAIL = `DELETE FROM studio_invite', '(SELECT lower(email) FROM account WHERE id = $1)`;',
      'const INVITES_TO_ACCOUNT_EMAIL = `SELECT $1::uuid`;') }] },
  { id: 'waiting-keeps-front', title: 'ожидающий выплату остаётся в голове очереди сторожа (ревью M5)',
    edits: [{ file: erasure, apply: once("      await tx.query('UPDATE account SET erase_attempted_at = $2 WHERE id = $1', [accountId, now]);\n", '') }] },
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
    const summary = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога';
    return { code: result.error ? null : result.status, summary, skipped: /skipped/.test(summary) };
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
} finally { rmSync(directory, { recursive: true, force: true }); }
