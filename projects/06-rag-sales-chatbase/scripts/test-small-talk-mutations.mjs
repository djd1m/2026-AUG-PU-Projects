// из N6 scripts/test-rag-answer-mutations.mjs — та же схема «копия проекта → дефект → красный прогон → восстановление →
// зелёный». Мутации стражей фичи small-talk (A-N6-074): распознаватель выключен; ядро не смотрит на распознаватель (светская
// реплика уходит в квоту, эмбеддинг и модель); списание перед шаблоном; ловушка «привет, <вопрос>» съедена шаблоном; текст
// светской реплики в журнале (152-ФЗ); A-N6-076 — адрес страницы в темах приветствия, заголовок раздела не читается.
// Наборы — без БД (ядро с подменным шлюзом): node scripts/test-small-talk-mutations.mjs (в образе стека n6-test или в
// контейнере Playwright). Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — дефект прошёл незамеченным или
// восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (якорь мутации не найден).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-small-talk-mutations-'));
const output = resolve('tests/artifacts/small-talk/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/small-talk.test.ts', 'tests/small-talk-topics.test.ts', 'tests/rag-answer.test.ts'];
const once = (from, to) => (source) => {
  const a = source.indexOf(from);
  if (a < 0 || source.indexOf(from, a + 1) >= 0) return null;
  return source.slice(0, a) + to + source.slice(a + from.length);
};
const mutations = [
  { id: 'recognizer-disabled', title: 'распознаватель выключен: «привет» идёт обычным путём (квота, эмбеддинг, «не знаю»)', file: 'packages/rag/src/small-talk.ts',
    apply: once('return PRIORITY.find((intent) => found.has(intent)) ?? null;', 'return found.size < 0 ? PRIORITY[0]! : null;') },
  { id: 'model-on-small-talk', title: 'ядро не смотрит на распознаватель: светская реплика уходит в квоту, эмбеддинг и модель (ADR-003)', file: 'packages/rag/src/answer.ts',
    apply: once('  if (intent) {', '  if (intent && deps.models.answerModel === \'\') {') },
  { id: 'charge-before-template', title: 'списание квоты перед шаблоном: светская реплика тратит visitor_answers', file: 'packages/rag/src/answer.ts',
    apply: once('    const topics = intentNeedsTopics(intent)', '    await deps.chargeQuota();\n    const topics = intentNeedsTopics(intent)') },
  { id: 'trap-swallowed', title: 'постороннее слово пропускается: «привет, сколько стоит доставка?» получает шаблон вместо ответа', file: 'packages/rag/src/small-talk.ts',
    apply: once('    return null;   // постороннее слово', '    i++; continue;   // постороннее слово') },
  { id: 'text-logged', title: 'текст светской реплики пишется в журнал (152-ФЗ: текст только у unknown)', file: 'packages/rag/src/answer.ts',
    apply: once("outcome: 'small_talk', text: null", "outcome: 'small_talk', text: question") },
  // A-N6-076: темы приветствия (дефект стенда 28.09 — адрес `http://info.cern.ch` в «спросите о темах»).
  { id: 'address-as-topic', title: 'фильтр адресов снят: заголовок-адрес становится темой приветствия', file: 'packages/rag/src/small-talk.ts',
    apply: once(' || URL_LIKE.test(text)) continue;', ') continue;') },
  { id: 'heading-ignored', title: 'заголовок первого раздела не читается: тема берётся только из <title> страницы', file: 'packages/rag/src/small-talk.ts',
    apply: once('[page.heading, page.title]', '[page.title]') },
];
const results = [];
let exitCode = 0;
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
      result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', ...TESTS],
        { cwd: directory, stdio: ['ignore', fd, fd], timeout: 600000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
    const log = readFileSync(logfile, 'utf8');
    const summary = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? 'нет итога';
    return { code: result.error ? null : result.status, summary, skipped: /skipped/.test(summary) };
  };
  for (const mutation of mutations) {
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    const mutated = mutation.apply(source);
    if (mutated === null || mutated === source) {
      console.error(`Якорь мутации не уникален или не найден: ${mutation.id} — проверка НЕ ВЫПОЛНЕНА`);
      exitCode = 2;
      break;
    }
    writeFileSync(path, mutated);
    const red = run(mutation.id, 'red');
    writeFileSync(path, source);
    const green = run(mutation.id, 'green');
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла.
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (!exitCode && (results.length !== mutations.length || results.some((r) => !r.passed))) exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
process.exitCode = exitCode;
