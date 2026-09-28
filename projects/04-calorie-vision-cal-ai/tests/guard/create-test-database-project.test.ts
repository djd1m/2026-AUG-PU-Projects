// Страж `scripts/create-test-database.sh`: без явного имени тестового compose-проекта скрипт
// ОТКАЗЫВАЕТ (код 2) и НЕ зовёт docker. Находка 28.09 (RV-04/06): имя проекта по умолчанию
// совпадает с живым стендом `n4-tarelka`, и `docker compose exec db` без `-p` при пустом
// окружении ушёл бы в `n4-tarelka-db-1`.
//
// Стенд здесь не трогается ПО ПОСТРОЕНИЮ: скрипт запускается с ПУСТЫМ окружением, а `docker`
// в PATH — заглушка, которая только записывает свои аргументы в журнал. Каталог заглушки стоит
// в PATH ПЕРВЫМ, поэтому `docker` из скрипта разрешается в неё, а не в системный; журнал
// доказывает, что вызвана именно она (системные каталоги нужны ради bash, grep, dirname).
//
// ИСПЫТАНИЕ (guard-must-be-able-to-fail): удалить из скрипта блок проверок имени → отказные
// сценарии краснеют (код не 2, журнал заглушки не пуст). Квитанция —
// docs/reviews/2026-09-28-test-db-guard-codex.md.

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/create-test-database.sh');

let dir: string;
let stubBin: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'n4-create-test-db-'));
  stubBin = join(dir, 'bin');
  mkdirSync(stubBin);
  const stub = join(stubBin, 'docker');
  writeFileSync(
    stub,
    '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "$STUB_LOG"\ncat >/dev/null\nexit 0\n',
  );
  chmodSync(stub, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

let runNo = 0;
function run(args: string[], extraEnv: Record<string, string> = {}) {
  runNo += 1;
  const log = join(dir, `docker-${runNo}.log`);
  const r = spawnSync('bash', [SCRIPT, ...args], {
    // ПУСТОЕ окружение: только PATH с заглушкой первой и путь журнала.
    // Приведение: проектный ProcessEnv требует NODE_ENV, а окружение здесь НАМЕРЕННО пустое.
    env: { PATH: `${stubBin}:/usr/bin:/bin`, STUB_LOG: log, ...extraEnv } as unknown as NodeJS.ProcessEnv,
    input: '',
    encoding: 'utf8',
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { code: r.status, stderr: r.stderr, calls };
}

describe('create-test-database.sh: отказ без имени тестового проекта', () => {
  it.each([
    ['пустое окружение, без -p', [], {}, /имя compose-проекта не задано/],
    ['-p с пустым значением', ['-p', ''], {}, /имя compose-проекта не задано/],
    ['-p без значения', ['-p'], {}, /без значения/],
    ['-p n4-tarelka (стенд)', ['-p', 'n4-tarelka'], {}, /живой стенд/],
    ['--project-name=n4-tarelka', ['--project-name=n4-tarelka'], {}, /живой стенд/],
    ['COMPOSE_PROJECT_NAME=n4-tarelka', [], { COMPOSE_PROJECT_NAME: 'n4-tarelka' }, /живой стенд/],
    ['N4_COMPOSE_PROJECT не считается явным именем', [], { N4_COMPOSE_PROJECT: 'n4-test-guard' }, /не задано/],
    ['имя, негодное для compose', ['-p', 'N4 Test'], {}, /не годится/],
    ['неизвестный аргумент', ['--force'], {}, /неизвестный аргумент/],
  ] as const)('%s → код 2, причина в stderr, docker НЕ вызван', (_name, args, env, reason) => {
    const r = run([...args], { ...env });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(reason);
    expect(r.calls).toEqual([]);
  });
});

describe('create-test-database.sh: явное имя доходит до КАЖДОГО вызова docker', () => {
  it.each([
    ['-p', ['-p', 'n4-test-guard'], {}],
    ['--project-name=', ['--project-name=n4-test-guard'], {}],
    ['COMPOSE_PROJECT_NAME', [], { COMPOSE_PROJECT_NAME: 'n4-test-guard' }],
    ['-p перекрывает стенд в COMPOSE_PROJECT_NAME', ['-p', 'n4-test-guard'], { COMPOSE_PROJECT_NAME: 'n4-tarelka' }],
  ] as const)('%s → код 0, все вызовы с -p n4-test-guard', (_name, args, env) => {
    const r = run([...args], { ...env });
    expect(r.code, r.stderr).toBe(0);
    // заглушка ничего не печатает → проверка «база есть» ложна → идёт и CREATE: 4 вызова
    expect(r.calls.length).toBe(4);
    for (const c of r.calls) expect(c.startsWith('compose -p n4-test-guard exec ')).toBe(true);
    expect(r.calls.join('\n')).not.toMatch(/n4-tarelka/);
  });
});
