// из N6 scripts/test-chunk-embed-mutations.mjs — та же схема «копия проекта → дефект → красный прогон →
// восстановление → зелёный». Мутации стражей фичи rag-answer (постановка координатора, ADR-003 Confirmation):
// порог min_similarity снят (модель зовётся без подходящего фрагмента); проверка цитат снята (метка вне
// контекста принимается); цитата/фрагмент ЧУЖОГО бота принимается (ownHit всегда «свой»).
// Набор bot-isolation ходит в НАСТОЯЩИЙ Postgres + pgvector: запускать в образе стека n6-test:
//   docker compose -f compose.test.yml --project-directory . --env-file <вне репо> run --rm --build test \
//     sh -c 'node scripts/test-db.mjs && node scripts/test-rag-answer-mutations.mjs'
// Коды: 0 — каждый дефект пойман и восстановление зелёное; 1 — хоть один дефект прошёл незамеченным
// или восстановление красное; 2 — проверка НЕ ВЫПОЛНЕНА (нет БД — интеграционный набор пропустился бы).
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL не задан: набор bot-isolation пропустился бы — мутационный прогон НЕ ВЫПОЛНЕН');
  process.exit(2);
}
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-rag-answer-mutations-'));
const output = resolve('tests/artifacts/rag-answer/mutations'); mkdirSync(output, { recursive: true });
const TESTS = ['tests/rag-answer.test.ts', 'tests/validate-model-answer.test.ts', 'tests/bot-isolation.test.ts', 'tests/chunk-embed.integration.test.ts'];
const span = (start, end, replacement) => (source) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0 || source.indexOf(end, b + 1) >= 0) return null;
  return source.slice(0, a) + replacement + source.slice(b + end.length);
};
const once = (from, to) => span(from, from, to);
const both = (...steps) => (source) => steps.reduce((s, step) => (s === null ? null : step(s)), source);
const mutations = [
  { id: 'threshold-removed', title: 'порог min_similarity снят: модель ответа зовётся без фрагмента ≥ 0.40 (ADR-003, барьер ДО модели)', file: 'packages/rag/src/search.ts',
    apply: once('Number.isFinite(hit.similarity) && hit.similarity >= MIN_SIMILARITY', 'Number.isFinite(hit.similarity) || MIN_SIMILARITY > 0') },
  { id: 'citation-check-removed', title: 'проверка цитат снята: метка вне выданного контекста (F9, UUID) принимается (ADR-003, барьер ПОСЛЕ модели)', file: 'packages/rag/src/validate-model-answer.ts',
    apply: once("if (citations.some((c) => typeof c !== 'string' || !labels.includes(c))) return { status: 'unknown', why: 'foreign_citation' };",
      "if (citations.some((c) => typeof c !== 'string')) return { status: 'unknown', why: 'foreign_citation' };") },
  { id: 'foreign-citation-accepted', title: 'фрагмент/цитата чужого бота принимается: ownHit всегда «свой» (NFR-SEC-001, вторая линия ядра)', file: 'packages/rag/src/search.ts',
    apply: once("return typeof hit.botId === 'string' && hit.botId === botId;", "return typeof hit.botId === 'string' && botId.length > 0;") },
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
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    const mutated = mutation.apply(source);
    if (mutated === null || mutated === source) throw new Error(`Якорь мутации не уникален или не найден: ${mutation.id}`);
    writeFileSync(path, mutated);
    const red = run(mutation.id, 'red');
    writeFileSync(path, source);
    const green = run(mutation.id, 'green');
    // Красный — это ПАДАЮЩИЕ тесты, а не код 1 от несобравшегося файла (ошибка трансформации тоже даёт 1).
    const passed = red.code === 1 && /\d+ failed/.test(red.summary) && green.code === 0 && !red.skipped && !green.skipped;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { reap(); rmSync(directory, { recursive: true, force: true }); }
