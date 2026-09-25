// из N5: projects/05-podcast-clips-opus/scripts/test-limits-mutations.mjs — та же схема (копия проекта во
// временном каталоге, дефект, красный прогон, восстановление, зелёный), мутации стража отказа старта N6.
// node_modules собирается заново: @n6/* указывают на пакеты КОПИИ, иначе подпроцессы web/worker-index
// загрузили бы неиспорченный packages/rag оригинала и «красное» было бы ложным.
// Коды: 0 — каждый дефект пойман и код восстановлен в зелёное; 1 — хоть один дефект прошёл незамеченным.
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n6-ceilings-mutations-'));
const output = resolve('tests/artifacts/foundation/mutations'); mkdirSync(output, { recursive: true });
const config = 'packages/rag/src/config.ts';
const mutations = [
  { id: 'default-ceiling', title: 'ненастроенный потолок получает дефолт вместо отказа', file: config,
    before: "if (value === undefined) throw new Error(`${name} не задана: ${consequence}`);", after: "if (value === undefined) return '1000';" },
  { id: 'zero-accepted', title: '0 принимается как предел', file: config,
    before: "!/^[1-9][0-9]*$/.test(raw)", after: "!/^[0-9]+$/.test(raw)" },
  { id: 'one-name-two-numbers', title: 'создание предпросмотра тратит предел ответов (класс H1/M2)', file: config,
    before: "QUOTA_PREVIEW_SESSION_CREATE: 'preview_session:create'", after: "QUOTA_PREVIEW_SESSION_CREATE: 'preview_session:answers'" },
  { id: 'pairs-skipped', title: 'персональный предел выше общего пропущен', file: config,
    before: 'if (values[narrow] > values[wide]) {', after: 'if (false) {' },
  { id: 'web-preflight-swallows', title: 'preflight web глотает отказ и отдаёт код 0', file: 'apps/web/src/preflight.ts',
    before: 'process.exit(1);', after: 'process.exit(0);' },
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
  for (const [name, path] of [['db', 'packages/db'], ['rag', 'packages/rag'], ['web', 'apps/web'], ['worker', 'apps/worker']]) {
    symlinkSync(join(directory, path), join(directory, 'node_modules', '@n6', name), 'dir');
  }
  const run = (id, phase) => {
    const logfile = join(output, `${id}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
    try {
      result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/config.test.ts'],
        { cwd: directory, stdio: ['ignore', fd, fd], timeout: 300000, env: { ...process.env, NO_COLOR: '1' } });
    } finally { closeSync(fd); }
    const log = readFileSync(logfile, 'utf8');
    const summary = /^\s+Tests\s{2}(.+)$/m.exec(log)?.[1]?.trim() ?? "нет итога";
    return { code: result.error ? null : result.status, summary };
  };
  for (const mutation of mutations) {
    const path = join(directory, mutation.file), source = readFileSync(path, 'utf8');
    if (source.split(mutation.before).length !== 2) throw new Error(`Якорь мутации не уникален или не найден: ${mutation.id}`);
    writeFileSync(path, source.replace(mutation.before, mutation.after));
    const red = run(mutation.id, 'red');
    writeFileSync(path, source);
    const green = run(mutation.id, 'green');
    const passed = red.code === 1 && green.code === 0;
    results.push({ id: mutation.id, title: mutation.title, red, green, passed });
    console.log(`${mutation.id}: дефект возвращён → ${red.summary} (код ${red.code}); код восстановлен → ${green.summary} (код ${green.code})`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.length !== mutations.length || results.some((r) => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
