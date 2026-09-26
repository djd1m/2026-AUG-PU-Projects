// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи tariffs-and-interest (живая оплата ЮKassa, A-N6-040): ключ повторности не держит повтор; продление
// от now() вместо GREATEST (перестановка/повтор); план без старшинства (перестановка, понижение плана оператора); адрес
// ЮKassa не проверяется (подделка); несовпадение суммы выдаёт план; фейк разрешён в production; лишний писатель плана;
// открытый редирект после входа; недоступность ЮKassa возвращается значением (урок N1).
// Интеграционный набор ходит в НАСТОЯЩИЙ Postgres: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-tariffs-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-tariffs-mutations-'));
const output = resolve('tests/artifacts/tariffs-and-interest/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/billing.unit.test.ts', 'tests/billing.integration.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const chain = (...steps) => (source) => steps.reduce((text, step) => (text === null ? null : step(text)), source);
const payments = 'packages/db/src/payments.ts', yookassa = 'apps/web/src/server/payments/yookassa.ts', config = 'apps/web/src/server/payments/config.ts',
  bots = 'packages/db/src/bots.ts', ret = 'apps/web/src/lib/payment-return.ts';
const mutations = [
  { id: 'event-key-ignored', title: 'ключ повторности не держит повтор: claimEvent всегда «новое» (incoming-webhooks «повтор»)',
    edits: [{ file: payments, apply: once('  return claimed.rowCount === 1;\n}', '  void claimed; return true;\n}') }] },
  { id: 'extend-from-now', title: 'продление от now() вместо GREATEST(срок, now()) — вторая оплата не прибавляет (перестановка)',
    edits: [{ file: payments, apply: once('plan_paid_until = GREATEST(COALESCE(plan_paid_until, now()), now()) + make_interval(days => $4)', 'plan_paid_until = now() + make_interval(days => $4)') }] },
  { id: 'plan-without-rank', title: 'план = оплаченный без старшинства — перестановка понижает студию, оплата понижает план оператора',
    edits: [{ file: payments, apply: once('  const plan = PLAN_RANK[paid] > PLAN_RANK[active] ? paid : active;', '  const plan = paid; void active;') }] },
  { id: 'origin-unchecked', title: 'адрес источника ЮKassa не проверяется — уведомление с чужого IP принято (подделка)',
    edits: [{ file: yookassa, apply: once('      if (!origin.ok) throw new PaymentVerificationError(`адрес источника отвергнут: ${origin.reason}`);', '      void origin;') }] },
  { id: 'mismatch-grants-plan', title: 'сумма ≠ цене намерения, а план выдан (AC-8)',
    edits: [{ file: payments, apply: once("    if (payment.amountMinor !== intent.price_minor) { await record(intent.account_id, intent.plan, 'amount_mismatch'); return { applied: false, reason: 'amount_mismatch' } as const; }\n", '') }] },
  { id: 'fake-in-production', title: 'фейк провайдера разрешён в production (honest-configuration, AC-12)',
    edits: [{ file: config, apply: once("    if (env.NODE_ENV === 'production') throw refuse('N6_PAYMENTS_MODE', 'fake в production выдал бы платный план без денег: фейк «подтверждает» любую оплату');\n", '') }] },
  { id: 'extra-plan-writer', title: 'четвёртый писатель плана аккаунта мимо оплаты и оператора (AC-15)',
    edits: [{ file: bots, apply: (source) => `${source}\nexport async function grantPlanSilently(pool: Pool, id: string) { await pool.query(\`UPDATE account SET plan = 'studio' WHERE id = $1\`, [id]); }\n` }] },
  { id: 'open-redirect', title: 'адрес после входа — любой /upgrade… (открытый редирект, AC-14)',
    edits: [{ file: ret, apply: once('const NEXT_ALLOWED = /^\\/upgrade\\?plan=(nobadge|studio)$/;', 'const NEXT_ALLOWED = /^\\/upgrade/;') }] },
  { id: 'unavailable-as-value', title: 'ЮKassa 5xx читается как «платёж не найден» (значение вместо исключения, урок N1)',
    edits: [{ file: yookassa, apply: once('    if (!response.ok) throw new PaymentProviderUnavailable(`http ${response.status}`);', '    if (!response.ok) throw new PaymentVerificationError(`http ${response.status}`);') }] },
  // Независимое ревью Codex (08_review.md): по мутации на каждое исправление.
  { id: 'refund-then-payment-grants', title: 'возврат раньше оплаты не учитывается — оплата по возвращённому платежу выдаёт план (ревью, находка 1)',
    edits: [{ file: payments, apply: once("    if (prior?.status === 'refunded') return { applied: false, reason: 'refunded' } as const;\n", '') }] },
  { id: 'checkout-recreates-payment', title: 'повтор оформления создаёт новый платёж вместо сохранённого (ревью, находка 2)',
    edits: [{ file: 'apps/web/src/server/billing-handler.ts', apply: once('      if (intent.provider_payment_id) {', '      if (intent.provider_payment_id && false) {') }] },
  { id: 'operator-free-keeps-remainder', title: 'снятие плана оператором оставляет оплаченный остаток (ревью, находка 3)',
    edits: [{ file: 'packages/db/src/tariffs.ts', apply: once("      plan_paid_until = CASE WHEN $2 = 'free' THEN NULL ELSE plan_paid_until END WHERE id = $1`", '      plan_paid_until = plan_paid_until WHERE id = $1`') }] },
  { id: 'poll-without-deadline', title: 'опрос экрана возврата без предела по времени (ревью, находка 5)',
    edits: [{ file: ret, apply: once(' || elapsedMs >= RETURN_DEADLINE_MS', '') }] },
  { id: 'inactive-shown-as-success', title: 'старая оплата при недействующем плане показана как «включён» (ревью, находка 6)',
    edits: [{ file: ret, apply: once("    if (snapshot.account_plan !== 'nobadge' && snapshot.account_plan !== 'studio') return { kind: 'paid_inactive' };\n", '') }] },
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
