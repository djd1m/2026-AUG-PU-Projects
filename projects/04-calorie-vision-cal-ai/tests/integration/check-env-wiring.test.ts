// Испытание самого стража (AC-foundation-15).
//
// Страж, ни разу не показавший красное, стражем не является. Здесь он прогоняется на ТРЁХ
// подготовленных входах и обязан ответить тремя РАЗНЫМИ кодами. Третий — главный: пустой
// вход означает «проверка НЕ ВЫПОЛНЕНА», а не «нарушений не найдено».

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../../scripts/check-env-wiring.sh', import.meta.url));
const PROJECT = fileURLToPath(new URL('../../', import.meta.url));

// Вход собран ВРУЧНУЮ, а не снят с живого docker: прогон тестов идёт внутри контейнера,
// где docker недоступен, а секреты `.env` не имеют права попадать в фикстуру.
// Настоящий полный прогон (`bash scripts/check-env-wiring.sh .`) предъявляется отдельно
// в квитанции Phase 3 — здесь проверяется СПОСОБНОСТЬ стража различать три состояния.
const API_VARIABLES = [
  'APP_ORIGIN', 'DATABASE_URL', 'N4_ESCALATION_LIMIT_DAY', 'N4_RATE_LIMIT_MUTATE_PER_MIN',
  'N4_RATE_LIMIT_READ_PER_MIN', 'N4_SCAN_LIMIT_DAY', 'N4_SCAN_LIMIT_USER',
  'S3_ACCESS_KEY', 'S3_BUCKET', 'S3_ENDPOINT', 'S3_SECRET_KEY',
];
const RECOGNIZER_VARIABLES = [
  'ANTHROPIC_API_KEY', 'DATABASE_URL', 'N4_ESCALATION_LIMIT_DAY', 'N4_MODEL_PROVIDER',
  'N4_SCAN_LIMIT_DAY', 'N4_SCAN_LIMIT_USER', 'S3_ACCESS_KEY', 'S3_BUCKET', 'S3_ENDPOINT', 'S3_SECRET_KEY',
];

function composeConfig(apiVariables: string[]): string {
  const block = (service: string, variables: string[]): string =>
    [`  ${service}:`, '    environment:', ...variables.map((name) => `      ${name}: значение`), '    image: n4/local'].join('\n');
  return [
    'name: n4-tarelka',
    'services:',
    block('api', apiVariables),
    block('recognizer', RECOGNIZER_VARIABLES),
    block('web', ['APP_ORIGIN', 'API_INTERNAL_URL']),
    '',
  ].join('\n');
}

async function guardIn(projectDir: string, config: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await run('bash', [SCRIPT, projectDir], { env: { ...process.env, ENV_WIRING_CONFIG: config } });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

const guard = (config: string) => guardIn(PROJECT, config);

describe('страж проброса переменных', () => {
  it('страж проброса переменных возвращает 0 1 и 2 на трёх входах', async () => {
    // Вход 1: полная конфигурация — потерь нет.
    const full = await guard(composeConfig(API_VARIABLES));
    expect(full.code, full.stdout + full.stderr).toBe(0);
    expect(full.stdout).toContain('✅ api');

    // Вход 2: у сервиса `api` убрана переменная, которую его код ЧИТАЕТ.
    const damaged = await guard(composeConfig(API_VARIABLES.filter((name) => name !== 'S3_BUCKET')));
    expect(damaged.code).toBe(1);
    // Названы И сервис, И переменная: «что-то не так» чинить нельзя.
    expect(damaged.stdout).toContain('api');
    expect(damaged.stdout).toContain('S3_BUCKET');

    // Вход 3: пустой вывод конфигурации. Это НЕ «нарушений нет».
    const empty = await guard('');
    expect(empty.code).toBe(2);
    expect(empty.stderr).toContain('НЕ выполнена');
    expect(empty.stdout).not.toContain('✅');
  }, 60_000);

  it('отсутствие сервиса в конфигурации даёт код 2, а не список потерь', async () => {
    // Профиль забыли — сервиса в конфигурации нет. Считать все его переменные
    // потерянными значило бы утопить настоящую потерю в ложных.
    const withoutApi = composeConfig(API_VARIABLES).replace(/ {2}api:\n(?: {4}.*\n| {6}.*\n)*/, '');
    const result = await guard(withoutApi);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('НЕ выполнена');
  }, 60_000);

  it('прямое чтение process.env распознаётся наравне с env.X', async () => {
    // RV-foundation-02: прежний класс символов запрещал точку перед `env` и потому НЕ ВИДЕЛ
    // `process.env.X` — самую обычную форму чтения. Страж зеленел ровно там, где переменная
    // потеряна. Тест строит НАСТОЯЩИЙ каталог сервиса с прямым чтением и требует код 1.
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const root = await mkdtemp(path.join(tmpdir(), 'n4-env-wiring-'));
    await mkdir(path.join(root, 'apps/api/src'), { recursive: true });
    await mkdir(path.join(root, 'apps/recognizer/src'), { recursive: true });
    await mkdir(path.join(root, 'apps/web'), { recursive: true });
    await writeFile(
      path.join(root, 'apps/api/src/env.ts'),
      'export const endpoint = process.env.S3_ENDPOINT;\nexport const bucket = process.env.S3_BUCKET;\n',
      'utf8',
    );
    await writeFile(path.join(root, 'apps/recognizer/src/env.ts'), 'export const url = process.env.DATABASE_URL;\n', 'utf8');

    const config = (apiVariables: string[]): string =>
      [
        'name: n4-probe',
        'services:',
        '  api:',
        '    environment:',
        ...apiVariables.map((name) => `      ${name}: значение`),
        '    image: n4/local',
        '  recognizer:',
        '    environment:',
        '      DATABASE_URL: значение',
        '    image: n4/local',
        '  web:',
        '    environment:',
        '      APP_ORIGIN: значение',
        '    image: n4/local',
        '',
      ].join('\n');

    const missing = await guardIn(root, config(['S3_BUCKET']));
    expect(missing.code, missing.stdout + missing.stderr).toBe(1);
    expect(missing.stdout).toContain('S3_ENDPOINT');
    expect(missing.stdout).toContain('api');

    const complete = await guardIn(root, config(['S3_ENDPOINT', 'S3_BUCKET']));
    expect(complete.code, complete.stdout + complete.stderr).toBe(0);
  }, 60_000);
});
