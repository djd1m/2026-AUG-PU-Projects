// из N6 scripts/test-visitor-ask-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей фичи partner-and-studio (guard-must-be-able-to-fail): анти-накрутка выключена; self-referral выключен; равный
// источник перезаписывает атрибуцию; явный неверный код откатывается к cookie; база комиссии «вся сумма» при неизвестном
// удержании; запись денег партнёра вне commission.ts; нет сторно при возврате; предел ботов клиента не проверяется при
// приёме; выплата больше доступного; cookie реферала без проверки подписи; приглашение принимается повторно.
// Наборы partners.integration ходят в НАСТОЯЩИЙ Postgres: запускать в образе
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-partners-mutations.mjs'
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
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-partner-mutations-'));
const output = resolve('tests/artifacts/partner-and-studio/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/partners.unit.test.ts', 'tests/partners.integration.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  return a < 0 || source.indexOf(from, a + 1) >= 0 ? null : source.slice(0, a) + to + source.slice(a + from.length);
};
const partners = 'packages/db/src/partners.ts', commission = 'packages/db/src/commission.ts', payments = 'packages/db/src/payments.ts',
  studio = 'packages/db/src/studio.ts', referral = 'apps/web/src/lib/partner-referral.ts';
const mutations = [
  { id: 'antifraud-off', title: 'анти-накрутка выключена: > 20 применений с префикса за 10 мин код не замораживают (FR-PARTNER-003, AC-5)',
    edits: [{ file: partners, apply: once('if (recent >= ANTI_FRAUD_THRESHOLD) {', 'if (recent < 0) {') }] },
  { id: 'self-referral-off', title: 'self-referral не проверяется: свой код и тот же префикс засчитываются (FR-PARTNER-003, AC-4)',
    edits: [{ file: partners, apply: once('if (row.owner_account_id !== null && await isSelfReferral(', 'if (row.owner_account_id === "never" && await isSelfReferral(') }] },
  { id: 'equal-source-overwrites', title: 'равный источник перезаписывает атрибуцию (сила invite > code > cookie, AC-3)',
    edits: [{ file: partners, apply: once('SOURCE_STRENGTH[input.source] > SOURCE_STRENGTH[existing.source]', 'SOURCE_STRENGTH[input.source] >= SOURCE_STRENGTH[existing.source]') }] },
  { id: 'explicit-falls-back', title: 'явный неверный код не отклоняется — регистрация идёт по cookie (FR-PARTNER-001, AC-2)',
    edits: [{ file: partners, apply: once('const explicit = input.partner?.explicit ?? null;',
      "const explicit = input.partner?.explicit && (await findLiveCode(pool, input.partner.explicit)).kind === 'ok' ? input.partner.explicit : null;") }] },
  { id: 'fee-unknown-full-amount', title: 'удержание неизвестно — комиссия с ПОЛНОЙ суммы (решение владельца: с полученного после удержания, AC-10)',
    edits: [{ file: commission, apply: once('const base = commissionBaseMinor(input.amountMinor, input.feeMinor);', 'const base = commissionBaseMinor(input.amountMinor, input.feeMinor ?? 0);') }] },
  { id: 'money-outside-commission', title: 'запись денег партнёра вне commission.ts (AC-16)',
    edits: [{ file: partners, apply: (s) => `${s}\nexport const leak = 'INSERT INTO commission_entry (kind) VALUES ($1)';\n` }] },
  { id: 'no-clawback', title: 'возврат не сторнирует комиссию (AC-11)',
    edits: [{ file: payments, apply: once('    await clawbackCommissionTx(tx, await paymentRowId(tx, input.provider, payment.id));\n', '') }] },
  { id: 'client-limit-unchecked', title: 'приём приглашения не проверяет предел ботов клиента (carry_over A-N6-033 (6), AC-7)',
    edits: [{ file: studio, apply: once('if (client.count >= client.limit) return', 'if (client.count < 0) return') }] },
  { id: 'payout-over-available', title: 'выплата больше доступного к выплате (AC-12)',
    edits: [{ file: commission, apply: once('if (input.amountMinor > available) return', 'if (input.amountMinor < 0) return') }] },
  { id: 'referral-unsigned', title: 'cookie реферала принимается без проверки подписи (AC-1)',
    edits: [{ file: referral, apply: once('if (!timingSafeEqual(expected, Buffer.from(match[3]!, \'hex\'))) return null;', 'void expected;') }] },
  { id: 'payer-for-update', title: 'оплата снова запирает аккаунт FOR UPDATE — взаимные партнёры в deadlock (ревью фичи 15, находка 2)',
    edits: [{ file: payments, apply: once('FROM account WHERE id = $1 FOR NO KEY UPDATE`', 'FROM account WHERE id = $1 FOR UPDATE`') }] },
  { id: 'window-excludes-refunded', title: 'начало окна 12 месяцев — только по невозвращённым оплатам (ревью фичи 15, находка 1)',
    edits: [{ file: commission, apply: once('    FROM payment WHERE account_id = $1`,', "    FROM payment WHERE account_id = $1 AND status = 'succeeded' AND needs_review = false`,") }] },
  { id: 'payout-day-next-month', title: 'в день выплаты дата — уже следующий месяц (ревью фичи 15, находка 3)',
    edits: [{ file: 'packages/rag/src/commission.ts', apply: once('  if (local.getUTCDate() === PAYOUT_DAY_OF_MONTH) return', '  if (local.getUTCDate() === -1) return') }] },
  { id: 'invite-reusable', title: 'приглашение принимается повторно (одноразовость, AC-6)',
    edits: [{ file: studio, apply: once("if (invite.accepted) return { kind: 'used' } as const;", '') }] },
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
    // Одна правка на файл за раз: две правки одного файла затирали бы друг друга (урок фичи 13).
    const files = new Set(mutation.edits.map((e) => e.file));
    if (files.size !== mutation.edits.length) throw new Error(`Две правки одного файла в мутации ${mutation.id}`);
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
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла.
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
