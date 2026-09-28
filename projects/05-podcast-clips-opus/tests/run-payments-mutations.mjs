// Фича 30 payments (AC-17): каждый страж обязан показать красное на внедрённом дефекте и зелёное после восстановления.
// Запуск: node tests/run-payments-mutations.mjs [id…]; интеграционные — только при DATABASE_URL (в образе test), без него —
// честный not_run, а не «убит». Образец — tests/run-clip-cta-mutations.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'tests/artifacts/payments/mutations';
mkdirSync(root, { recursive: true });
const unit = 'tests/billing.unit.test.ts', guards = 'tests/payments-guards.test.ts';
const billing = 'tests/billing.integration.test.ts', paid = 'tests/paid-plan.integration.test.ts';
const handler = 'apps/web/src/server/billing-handler.ts', db = 'packages/db/src/payments.ts';
const cases = [
  // AC-17, перечень плана
  ['no-requery', 'apps/web/src/server/payments/yookassa.ts', 'const payment = await getPayment(objectId);\n        const claimed = normalizePayment(parsed.object, objectId);',
    'const claimed = normalizePayment(parsed.object, objectId);\n        const payment = claimed;', billing, 'AC-5 подделка'],
  ['key-before-auth', handler, '      verified = await provider.verifyNotification(',
    "      await deps.applyPayment({ provider: 'yookassa', eventKey: 'x', payloadSha256: '', payment: { id: '', orderId: null, amountMinor: 1, feeMinor: null, paidAt: null } }).catch(() => undefined);\n      verified = await provider.verifyNotification(", guards, 'режим → сырые байты'],
  ['unavailable-as-value', handler, "return fail(503, 'provider_unavailable', 'Источник истины недоступен');",
    "return json({ data: { applied: false, reason: 'provider_unavailable' } });", billing, 'AC-6 недоступность'],
  ['no-advisory-lock', db, "    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;\n    await lockPayment(tx, input.provider, payment.id);\n    // Возврат приехал",
    "    if (!await claimEvent(tx, input.provider, input.eventKey, input.payloadSha256)) return { applied: false, reason: 'duplicate' } as const;\n    // Возврат приехал", billing, 'AC-7 блокировка'],
  ['now-plus-30', db, 'plan_paid_until = GREATEST(COALESCE(plan_paid_until, now()), now()) + make_interval', 'plan_paid_until = now() + make_interval', billing, 'AC-7 перестановка'],
  ['fake-in-production', 'packages/shared/src/tariff.ts', "if (env.NODE_ENV === 'production') throw refuse('N5_PAYMENTS_MODE'", "if (false) throw refuse('N5_PAYMENTS_MODE'", unit, 'fake разрешён'],
  ['compose-colon-off', 'docker-compose.yml', 'N5_PAYMENTS_MODE: ${N5_PAYMENTS_MODE-off}', 'N5_PAYMENTS_MODE: ${N5_PAYMENTS_MODE:-off}', guards, 'compose подставляет off'],
  ['no-poll-deadline', 'apps/web/src/lib/payment-return.ts', ' || elapsedMs >= RETURN_DEADLINE_MS', '', unit, 'предел по времени'],
  // AC-16: четвёртый путь смены плана
  ['fourth-plan-writer', 'apps/web/src/server/interest.ts', "      if (!owner) throw new UploadError('not_found', 'Аккаунт не найден', 404);",
    "      if (!owner) throw new UploadError('not_found', 'Аккаунт не найден', 404);\n      await tx.query(`UPDATE account SET updated_at=now(), plan='paid' WHERE id=$1`, [account]);", guards, 'план аккаунта меняют ровно три'],
  // Страж сети ЮKassa в обработчике (для любого провайдера)
  ['no-origin-check', handler, '    if (!origin.ok) {', '    if (false) {', unit, 'AC-5/AC-6 вебхук'],
  // AC-11/AC-12: действующий план и срок хранения
  ['plan-ignores-expiry', 'packages/db/src/plan.ts', "(${t}.plan_source IN ('none','operator') OR (${t}.plan_source='payment' AND ${t}.plan_paid_until > ${at}))",
    "(true OR ${at} IS NULL)", paid, 'AC-3/AC-11 рендер'],
  ['retention-from-finish', 'apps/web/src/server/retention.ts', 'AND GREATEST(v.finished_at, a.plan_paid_until) <= $1', 'AND v.finished_at <= $1', paid, 'AC-12 сторож'],
  // Надпись призыва у paid (находка 1 ревью фич 25–29)
  ['paid-cta-link-text', 'packages/shared/src/cta.ts', 'return watermark ? CTA_FRAME_LABELS[kind] : CTA_FRAME_LABELS_PAID[kind];', 'return CTA_FRAME_LABELS[kind];', unit, 'пара «paid'],
  // AC-15: потолок минут paid
  ['paid-minutes-ignored', 'packages/db/src/quota.ts', '? limits.N5_LIMIT_PAID_USER_MINUTES : limits[limitNames[scope]]', '? limits[limitNames[scope]] : limits[limitNames[scope]]', paid, 'AC-15 минуты'],
  ['paid-above-global', 'packages/shared/src/config.ts', 'if (limits.N5_LIMIT_PAID_USER_MINUTES > limits.N5_LIMIT_GLOBAL_MINUTES) {', 'if (false) {', unit, 'N5_LIMIT_PAID_USER_MINUTES: обязателен'],
  // AC-13, AC-9, AC-8
  ['operator-keeps-remainder', 'packages/db/src/ops-set-plan.ts', "plan_paid_until = CASE WHEN $2 = 'free' THEN NULL ELSE plan_paid_until END", 'plan_paid_until = plan_paid_until', paid, 'AC-13 оператор'],
  ['erasing-gets-plan', db, "    if (owner?.status !== 'active') {", '    if (false) {', billing, 'AC-9 оплата'],
  ['amount-mismatch-grants', db, '    if (payment.amountMinor !== intent.price_minor) {', '    if (false) {', billing, 'AC-8 сумма'],
  // Ревью, круг 1: находки 1–3
  ['guest-download-all-offer', 'apps/web/src/server/guest-page.ts', "querySelectorAll('.clips a[download]')", "querySelectorAll('a.download')", guards, 'гостевая страница при включённой'],
  ['quota-plan-lock', 'packages/db/src/quota.ts', 'AS plan FROM account a WHERE a.id::text = $1`', 'AS plan FROM account a WHERE a.id::text = $1 FOR SHARE`', guards, 'списание минут читает план'],
  ['return-next-lost', 'apps/web/src/lib/payment-return.ts', '|\\/return\\?intent=', '|\\/nowhere\\?intent=', unit, 'next — только'],
];
const selected = process.argv.slice(2), results = [];
if (selected.some(id => !cases.some(c => c[0] === id))) throw new Error('Неизвестная мутация');
for (const [id, file, original, mutation, test, pattern] of cases) {
  if (selected.length && !selected.includes(id)) continue;
  if (test.includes('.integration.') && !process.env.DATABASE_URL) {
    const result = { id, status: 'not_run', reason: 'DATABASE_URL unavailable; real PostgreSQL required' };
    results.push(result); console.log(JSON.stringify(result)); continue;
  }
  const source = readFileSync(file, 'utf8');
  if (source.split(original).length !== 2) throw new Error(`Якорь мутации не найден или не единственный: ${id}`);
  const run = phase => {
    const path = `${root}/${id}-${phase}.json`;
    const fd = openSync(`${root}/${id}-${phase}.log`, 'w');
    let child;
    try { child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test, '-t', pattern, '--reporter=json', `--outputFile=${path}`],
      { stdio: ['ignore', fd, fd], timeout: 180000 }); }
    finally { closeSync(fd); }
    if (child.error || !existsSync(path)) throw child.error ?? new Error(`Нет квитанции: ${path}`);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const result = { id, phase, exit: child.status, passed: report.numPassedTests, failed: report.numFailedTests };
    console.log(JSON.stringify(result)); return result;
  };
  let red;
  try { writeFileSync(file, source.replace(original, mutation)); red = run('red'); }
  finally { writeFileSync(file, source); }
  const green = run('green');
  results.push({ id, red, green, status: red.exit === 1 && red.failed > 0 && green.exit === 0 && green.passed > 0 && green.failed === 0 ? 'killed' : 'failed' });
}
writeFileSync(`${root}/mutations.json`, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ summary: results.map(r => `${r.id}:${r.status}`) }));
if (results.some(r => r.status !== 'killed')) process.exitCode = 1;
