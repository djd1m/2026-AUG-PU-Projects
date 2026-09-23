import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'n5-limits-mutations-'));
const output = resolve('tests/artifacts/limits-ui-and-pro-interest/mutations'); mkdirSync(output, { recursive: true });
const results = [], contract = 'apps/web/src/lib/limits-contract.ts', interest = 'apps/web/src/app/dashboard/ProInterest.tsx';
try {
  for (const name of ['apps', 'packages', 'tests', 'scripts']) cpSync(name, join(directory, name), {
    recursive: true, filter: path => !/(^|\/)(node_modules|dist|\.next|artifacts)(\/|$)/.test(path),
  });
  for (const name of ['package.json', 'tsconfig.base.json', 'vitest.config.ts']) cpSync(name, join(directory, name));
  symlinkSync(join(project, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const mutations = [
    { id: 'payment-route', title: 'ADR-005 production route', file: 'apps/web/src/app/api/webhooks/yookassa/route.ts',
      added: 'export async function POST() { return Response.json({ paid: true }); }' },
    { id: 'generic-refusal', title: 'personal refusal names', file: contract,
      before: 'Загрузки на сегодня исчерпаны', after: 'Слишком много запросов' },
    { id: 'refund-text', title: 'refunds have no sixth text', file: contract,
      before: 'export const quotaMessages = {', after: "export const quotaMessages = { user_upload_refunds: 'Возвраты закончились'," },
    { id: 'global-name', title: 'global refusal hides', file: contract,
      before: "global_minutes: 'Сервис перегружен, попробуйте позже'", after: "global_minutes: 'Общий суточный объём минут исчерпан'" },
    { id: 'pro-promise', title: 'interest UI offers no deadline', file: interest,
      before: 'Сейчас доступен только бесплатный тариф.', after: 'Сейчас доступен только бесплатный тариф. Pro скоро запустим через 7 дней.' },
    { id: 'payment-form', title: 'interest UI offers no deadline', file: interest,
      before: '<p>Нужны больше минут', after: '<form><input name="card" /></form><p>Нужны больше минут' },
  ];
  for (const mutation of mutations) {
    const path = join(directory, mutation.file), source = mutation.added ? null : readFileSync(path, 'utf8');
    if (source !== null && source.split(mutation.before).length !== 2) throw new Error(`Mutation anchor not unique: ${mutation.id}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source === null ? mutation.added : source.replace(mutation.before, mutation.after));
    const run = phase => {
      const logfile = join(output, `${mutation.id}-${phase}.txt`), fd = openSync(logfile, 'w'); let result;
      try {
        result = spawnSync(process.execPath, [join(project, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/limits.test.ts', '-t', mutation.title],
          { cwd: directory, stdio: ['ignore', fd, fd], timeout: 60000, env: { ...process.env, NO_COLOR: '1' } });
      } finally { closeSync(fd); }
      const log = readFileSync(logfile, 'utf8');
      return { code: result.error ? null : result.status, assertion: /AssertionError/.test(log), tests: /Tests\s+\d+ passed/.test(log) };
    };
    const red = run('red');
    if (source === null) rmSync(path); else writeFileSync(path, source);
    const green = run('green');
    results.push({ id: mutation.id, red: red.code, green: green.code, passed: red.code === 1 && red.assertion && green.code === 0 && green.tests });
    console.log(`${mutation.id}: red=${red.code}, green=${green.code}`);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
