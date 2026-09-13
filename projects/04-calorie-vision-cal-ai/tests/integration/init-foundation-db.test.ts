// Бутстрап кластера: страж совпадающих паролей (RV-foundation-01 четвёртого ревью).
//
// Дефект был не в логике сравнения, а в ИМЕНИ: скрипт сравнивал с `N4_DB_ADMIN_PASSWORD`,
// которой в контейнере `db` НЕ СУЩЕСТВУЕТ — административный пароль приезжает туда как
// `POSTGRES_PASSWORD`. Сравнивались пустая строка и непустой пароль, и отказ был НЕДОСТИЖИМ
// в штатном окружении compose. Это `guard-must-be-able-to-fail` в чистом виде.
//
// Поэтому тест устроен в два слоя:
//   1) прогоны скрипта на окружении, СООТВЕТСТВУЮЩЕМ compose (иначе он снова проверял бы
//      воображаемое окружение, в котором дефекта нет);
//   2) сверка ИМЁН: всё, что скрипт читает, обязано быть в блоке `environment:` сервиса
//      `db`. Это закрывает КЛАСС, а не один случай — расхождение имён уже стоило стража.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../../scripts/init-foundation-db.sh', import.meta.url));
const COMPOSE = fileURLToPath(new URL('../../docker-compose.yml', import.meta.url));

/** Код, которым отвечает подменённый `psql`: он достигнут — значит проверки пропустили. */
const PSQL_REACHED = 99;

interface Outcome {
  readonly code: number;
  readonly stderr: string;
  readonly psqlReached: boolean;
}

/**
 * Прогон скрипта с подменённым `psql`. Настоящий сервер не нужен и вреден: проверяется
 * РЕШЕНИЕ (отказать или пустить), а не то, что PostgreSQL умеет создавать роли.
 */
async function runBootstrap(env: Record<string, string>): Promise<Outcome> {
  const stubDir = await mkdtemp(path.join(tmpdir(), 'n4-psql-stub-'));
  const stub = path.join(stubDir, 'psql');
  await writeFile(stub, `#!/usr/bin/env bash\nexit ${PSQL_REACHED}\n`, 'utf8');
  await chmod(stub, 0o755);

  try {
    // Окружение задаётся ЦЕЛИКОМ, без наследования: прогон обязан проверять ровно те
    // переменные, что даёт compose, а унаследованные от раннера скрыли бы их отсутствие.
    const clean = { PATH: `${stubDir}:${process.env.PATH ?? ''}`, ...env } as unknown as NodeJS.ProcessEnv;
    await run('bash', [SCRIPT], { env: clean });
    return { code: 0, stderr: '', psqlReached: false };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    const code = failure.code ?? -1;
    return { code, stderr: failure.stderr ?? '', psqlReached: code === PSQL_REACHED };
  }
}

/** Окружение РОВНО такое, какое compose даёт сервису `db`. */
function composeShapedEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string | undefined> = {
    POSTGRES_USER: 'n4_admin',
    POSTGRES_DB: 'n4',
    POSTGRES_PASSWORD: 'admin-secret-value',
    N4_DB_APP_PASSWORD: 'app-secret-value',
    TZ: 'Europe/Moscow',
    ...overrides,
  };
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

describe('бутстрап кластера', () => {
  it('одинаковые пароли администратора и приложения отвергаются ДО psql', async () => {
    // Тот самый прогон, которым судья предъявил дефект: имена как в compose, значения равны.
    const outcome = await runBootstrap(composeShapedEnv({ N4_DB_APP_PASSWORD: 'admin-secret-value' }));

    expect(outcome.psqlReached, 'psql не имеет права быть достигнут').toBe(false);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain('обязаны различаться');
    // Причина названа ценой, а не фактом: иначе проверку читают как придирку и снимают.
    expect(outcome.stderr).toContain('n4_admin');
  }, 60_000);

  it('разные пароли пропускаются к исполнению', async () => {
    const outcome = await runBootstrap(composeShapedEnv());
    // Страж обязан не только падать, но и ПРОПУСКАТЬ: страж, запрещающий всё, отключают.
    expect(outcome.psqlReached).toBe(true);
  }, 60_000);

  it('отсутствие административного пароля — отказ, а не «сравнивать не с чем»', async () => {
    const outcome = await runBootstrap(composeShapedEnv({ POSTGRES_PASSWORD: undefined }));
    expect(outcome.psqlReached).toBe(false);
    expect(outcome.code).not.toBe(0);
    expect(outcome.stderr).toContain('POSTGRES_PASSWORD');
  }, 60_000);

  it('пустой административный пароль тоже отказ', async () => {
    const outcome = await runBootstrap(composeShapedEnv({ POSTGRES_PASSWORD: '' }));
    expect(outcome.psqlReached).toBe(false);
    expect(outcome.code).not.toBe(0);
  }, 60_000);

  it('чужая база или чужой администратор отвергаются', async () => {
    for (const override of [{ POSTGRES_DB: 'postgres' }, { POSTGRES_USER: 'postgres' }]) {
      const outcome = await runBootstrap(composeShapedEnv(override));
      expect(outcome.psqlReached, JSON.stringify(override)).toBe(false);
      expect(outcome.code, JSON.stringify(override)).toBe(1);
    }
  }, 60_000);

  it('каждая переменная, читаемая скриптом, объявлена сервису db в compose', async () => {
    // КЛАССОВАЯ проверка, а не проверка одного случая: расхождение имён уже один раз
    // превратило стража в декорацию. Здесь оно становится красным тестом.
    const script = await readFile(SCRIPT, 'utf8');
    const compose = await readFile(COMPOSE, 'utf8');

    const read = new Set(
      script
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .flatMap((line) => [...line.matchAll(/\$\{?([A-Z][A-Z0-9_]*)/g)].map((match) => match[1] ?? ''))
        .filter((name) => name !== '' && name !== 'PATH'),
    );
    expect(read.size).toBeGreaterThan(0);

    const dbBlock = compose.slice(compose.indexOf('\n  db:'), compose.indexOf('\n  storage:'));
    const declared = new Set([...dbBlock.matchAll(/^\s{6}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] ?? ''));

    const missing = [...read].filter((name) => !declared.has(name)).sort();
    expect(missing, 'скрипт читает переменные, которых сервис db не получает').toEqual([]);
  });
});
