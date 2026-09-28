// из N6 scripts/test-gate-onboarding-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление → зелёный».
// Мутации стражей verify-audit (A-N6-077, инцидент стенда 28.09: второе нажатие кнопки-переключателя молча сняло отметку).
// Два режима — два окружения:
//   образ (unit + integration на НАСТОЯЩЕМ Postgres + pgvector):
//     docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//       sh -c 'node scripts/test-db.mjs && node scripts/test-verify-audit-mutations.mjs'
//   браузер (гидратированный BotScreen в Chromium + WebKit, контейнер Playwright):
//     bash scripts/check-responsive.sh … — либо тем же образом playwright: node scripts/test-verify-audit-mutations.mjs --browser
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным или восстановление
// красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД в режиме образа — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const browser = process.argv.includes('--browser');
if (!browser && !process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: интеграционные наборы пропустились бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
if (browser && !existsSync('scripts/responsive/node_modules/playwright')) {
  console.error('нет scripts/responsive/node_modules (npm ci --prefix scripts/responsive) — браузерный мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-verify-audit-mutations-'));
const output = resolve(`tests/artifacts/verify-audit/${browser ? 'browser-mutations' : 'mutations'}`); mkdirSync(output, { recursive: true });
const TESTS = browser ? ['tests/browser/verify-audit.test.ts']
  : ['tests/verify-audit.unit.test.ts', 'tests/verify-audit.integration.test.ts', 'tests/gate-onboarding.integration.test.ts', 'tests/bot-cabinet.unit.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  if (a < 0 || source.indexOf(from, a + 1) >= 0) return null;
  return source.slice(0, a) + to + source.slice(a + from.length);
};
const handler = 'apps/web/src/server/cabinet-handler.ts', m014 = 'packages/db/migrations/014_verify_audit.sql', bots = 'packages/db/src/bots.ts',
  block = 'apps/web/src/app/dashboard/bots/[botId]/VerifyBlock.tsx', screen = 'apps/web/src/app/dashboard/bots/[botId]/BotScreen.tsx';
const IMAGE = [
  { id: 'server-no-confirm', title: 'маршрут снимает отметку без { confirm: true } — вкладка с прежним переключателем снимает молча (AC-6)',
    edits: [{ file: handler, apply: once('    if (!input.verified && input.confirm !== true) {', '    if (false) {') }] },
  { id: 'event-not-written', title: 'журнал отметки не пишется — снова нельзя сказать, кто и когда снял (AC-7)',
    edits: [{ file: m014, apply: once('CREATE TRIGGER bot_verification_log AFTER UPDATE OF answers_verified_at ON bot FOR EACH ROW\n'
      + '  WHEN ((OLD.answers_verified_at IS NULL) IS DISTINCT FROM (NEW.answers_verified_at IS NULL))\n  EXECUTE FUNCTION bot_verification_log();\n', '') }] },
  { id: 'system-as-owner', title: 'снятие новыми материалами записано как действие владельца (AC-7/10)',
    edits: [{ file: m014, apply: once("  ELSIF NEW.answers_verified_reset_reason = 'new_material' THEN\n    INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES (NEW.id, 'unset_new_material', 'system');\n", '') }] },
  { id: 'set-moves-date', title: 'повторное «Я проверил» сдвигает дату «стоит с» (AC-8)',
    edits: [{ file: bots, apply: once('THEN COALESCE(answers_verified_at, now()) ELSE NULL END', 'THEN now() ELSE NULL END') }] },
  // Ревью круга 1: порядок журнала по времени начала транзакции — позднее снятие прячется за установкой.
  { id: 'events-by-time', title: 'журнал упорядочен по created_at (начало транзакции), а не по переходам — «снята» прячется за «поставлена»',
    edits: [{ file: bots, apply: once('ORDER BY id DESC LIMIT $2', 'ORDER BY created_at DESC, id DESC LIMIT $2') }] },
];
const BROWSER = [
  { id: 'no-confirmation', title: '«Снять отметку» снимает сразу, без подтверждения (AC-2/4)',
    edits: [{ file: block, apply: once('onClick={() => setConfirming(true)}>Снять отметку', 'onClick={p.onUnset}>Снять отметку') }] },
  { id: 'toggle-returns', title: 'кнопка блока снова переключатель: «Я проверил» при стоящей отметке шлёт снятие (механизм инцидента, AC-3)',
    edits: [{ file: screen, apply: once("onSet={() => { void markVerified('block'); }} onUnset={() => { void unmarkVerified(); }}",
      "onSet={() => { void (verified ? unmarkVerified() : markVerified('block')); }} onUnset={() => { void unmarkVerified(); }}") },
    { file: block, apply: once(`    {p.verified
      ? <p><button ref={trigger}`, `    {p.verified && false
      ? <p><button ref={trigger}`) }] },
  { id: 'escape-ignored', title: 'Escape не закрывает подтверждение и не возвращает фокус (AC-4)',
    edits: [{ file: block, apply: once("if (event.key === 'Escape' && !p.busy)", "if (event.key === 'Escape' && false)") }] },
  { id: 'banner-vanishes', title: 'баннер после отметки исчезает — второй клик попадает в соседний блок (AC-11)',
    edits: [{ file: 'apps/web/src/app/dashboard/GateBanner.tsx', apply: once('return p.justVerified ? <p', 'return false ? <p') }] },
  // Ревью круга 1: оптимистическое «поставлена» на экране установки перекрывает снятие отметки сервером.
  { id: 'install-sticky', title: 'экран установки: после отметки в вкладке серверное снятие не показывает баннер',
    edits: [{ file: 'apps/web/src/app/dashboard/bots/[botId]/install/InstallScreen.tsx',
      apply: once('optimistic !== null && optimistic === gate ? true : gate.verified', 'optimistic !== null ? true : gate.verified') }] },
  // Узкое ревью: оптимистическая отметка привязана к gate из замыкания нажатия — смена данных во время POST возвращает кнопку.
  { id: 'install-closure-gate', title: 'экран установки: отметка привязана к устаревшему gate — кнопка снова активна до следующего refresh',
    edits: [{ file: 'apps/web/src/app/dashboard/bots/[botId]/install/InstallScreen.tsx',
      apply: once('setOptimistic(outcome.verified ? currentGate.current : null);', 'setOptimistic(outcome.verified ? gate : null);') }] },
];
const mutations = browser ? BROWSER : IMAGE;
const results = [];
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts', 'docs']) cpSync(name, join(directory, name), {
    recursive: true, filter: (path) => !/(^|\/)(node_modules|dist|\.next|artifacts|features|discovery)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts', 'vitest.browser.config.ts', 'docker-compose.yml', '.env.example']) {
    if (existsSync(name)) cpSync(name, join(directory, name));
  }
  if (browser) symlinkSync(join(project, 'scripts/responsive/node_modules'), join(directory, 'scripts/responsive/node_modules'), 'dir');
  mkdirSync(join(directory, 'node_modules', '@n6'), { recursive: true });
  for (const entry of readdirSync(join(project, 'node_modules'))) {
    if (entry !== '@n6') symlinkSync(join(project, 'node_modules', entry), join(directory, 'node_modules', entry));
  }
  for (const [name, path] of [['db', 'packages/db'], ['rag', 'packages/rag'], ['queue', 'packages/queue'], ['web', 'apps/web'], ['worker', 'apps/worker']]) {
    symlinkSync(join(directory, path), join(directory, 'node_modules', '@n6', name), 'dir');
  }
  const run = (id, phase) => {
    const logfile = join(output, `${id}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
    const config = browser ? ['--config', 'vitest.browser.config.ts'] : [];
    try {
      result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', ...config, ...TESTS],
        { cwd: directory, stdio: ['ignore', fd, fd], timeout: 900000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
    const log = readFileSync(logfile, 'utf8');
    const summaryLine = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога';
    return { code: result.error ? null : result.status, summary: summaryLine, skipped: /skipped/.test(summaryLine) };
  };
  for (const mutation of mutations) {
    const files = mutation.edits.map((e) => e.file);
    if (new Set(files).size !== files.length) throw new Error(`Две правки одного файла в мутации ${mutation.id}`);
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
