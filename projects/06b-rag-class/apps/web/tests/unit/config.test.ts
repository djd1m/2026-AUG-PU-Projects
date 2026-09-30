import { describe, expect, it, vi } from 'vitest';
import { ConfigError, enforceBootConfig } from '@n6b/db';
import { loadWebConfig, WEB_REQUIRED } from '@/server/config';

// Pseudocode «Boot config check», шаг 1 — закрытый список ровно этих 13 имён.
const PSEUDOCODE_13 = [
  'OPENROUTER_API_KEY', 'SESSION_SECRET', 'VISITOR_SECRET', 'PUBLIC_BASE_URL', 'MIN_SIMILARITY',
  'LIMIT_ANSWER_VISITOR_DAY', 'LIMIT_ANSWER_BOT_DAY', 'LIMIT_ANSWER_GLOBAL_DAY', 'LIMIT_SANDBOX_ACCOUNT_DAY',
  'LIMIT_SANDBOX_GLOBAL_DAY', 'LIMIT_EMBED_TOKENS_ACCOUNT_DAY', 'LIMIT_EMBED_TOKENS_GLOBAL_DAY', 'LIMIT_AUTH_ADDR_HOUR',
];

export function validEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL_TENANT: 'postgresql://n6b_app_tenant:x@db:5432/n6b',
    DATABASE_URL_SERVICE: 'postgresql://n6b_app_service:y@db:5432/n6b',
    OPENROUTER_API_KEY: 'sk-or-test-placeholder',
    SESSION_SECRET: 's'.repeat(48),
    VISITOR_SECRET: 'v'.repeat(48),
    PUBLIC_BASE_URL: 'https://n6b.example.test',
    MIN_SIMILARITY: '0.40',
    LIMIT_ANSWER_VISITOR_DAY: '30',
    LIMIT_ANSWER_BOT_DAY: '300',
    LIMIT_ANSWER_GLOBAL_DAY: '3000',
    LIMIT_SANDBOX_ACCOUNT_DAY: '100',
    LIMIT_SANDBOX_GLOBAL_DAY: '2000',
    LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '2000000',
    LIMIT_EMBED_TOKENS_GLOBAL_DAY: '20000000',
    LIMIT_AUTH_ADDR_HOUR: '10',
  };
}

function failure(env: Record<string, string | undefined>): ConfigError {
  try {
    loadWebConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('конфигурация принята, ожидался отказ');
}

describe('Boot config check web (FR-n6b-16, NFR-n6b-3)', () => {
  it('закрытый список совпадает с 13 переменными Pseudocode, без лишних и без пропусков', () => {
    expect(WEB_REQUIRED.map((v) => v.name)).toEqual(PSEUDOCODE_13);
  });

  it('валидная конфигурация принимается, числа разобраны', () => {
    const config = loadWebConfig(validEnv());
    expect(config.LIMIT_AUTH_ADDR_HOUR).toBe(10);
    expect(config.PUBLIC_BASE_URL).toBe('https://n6b.example.test');
    expect(config.all.MIN_SIMILARITY).toBe(0.4);
  });

  it.each(PSEUDOCODE_13)('SC-US-016-2: %s отсутствует → отказ с именем и последствием', (name) => {
    const env = validEnv();
    delete env[name];
    const error = failure(env);
    expect(error.variable).toBe(name);
    expect(error.message).toMatch(new RegExp(`^${name} не задан: .{8,}`));
  });

  it.each(PSEUDOCODE_13)('SC-US-016-2: %s задан пустой строкой → отказ (не ноль и не «без ограничений»)', (name) => {
    const error = failure({ ...validEnv(), [name]: '' });
    expect(error.variable).toBe(name);
    expect(error.message).toContain('пустым');
  });

  const LIMIT_GARBAGE = ['0', '-1', '1.5', '1e3', ' 10', '10 ', 'abc', '0x10', '+5', '9007199254740993', 'Infinity'];
  it.each(LIMIT_GARBAGE)('SC-US-016-2: LIMIT_AUTH_ADDR_HOUR=%j не положительное целое → отказ', (raw) => {
    expect(failure({ ...validEnv(), LIMIT_AUTH_ADDR_HOUR: raw }).variable).toBe('LIMIT_AUTH_ADDR_HOUR');
  });

  it.each([
    ['LIMIT_ANSWER_VISITOR_DAY', '301'],
    ['LIMIT_ANSWER_BOT_DAY', '3001'],
    ['LIMIT_SANDBOX_ACCOUNT_DAY', '2001'],
    ['LIMIT_EMBED_TOKENS_ACCOUNT_DAY', '20000001'],
  ])('персональный %s больше общего → отказ', (name, value) => {
    const error = failure({ ...validEnv(), [name]: value });
    expect(error.variable).toBe(name);
    expect(error.message).toContain('не сработает никогда');
  });

  it.each(['0', '1', '1.5', '-0.2', 'abc', '.', '0,4'])('MIN_SIMILARITY=%j вне (0, 1) → отказ', (raw) => {
    expect(failure({ ...validEnv(), MIN_SIMILARITY: raw }).variable).toBe('MIN_SIMILARITY');
  });

  it.each(['/', 'http://n6b.example.test', 'https://', 'n6b.example.test', 'https://n6b.example.test/app',
    'https://u:p@n6b.example.test', 'https://n6b.example.test/?x=1', 'javascript:alert(1)'])(
    'PUBLIC_BASE_URL=%j в проде → отказ', (raw) => {
      expect(failure({ ...validEnv(), PUBLIC_BASE_URL: raw }).variable).toBe('PUBLIC_BASE_URL');
    });

  it('http-адрес допустим только вне production (локальная разработка)', () => {
    expect(loadWebConfig({ ...validEnv(), NODE_ENV: 'development', PUBLIC_BASE_URL: 'http://localhost:3106' })
      .PUBLIC_BASE_URL).toBe('http://localhost:3106');
  });

  it.each(['SESSION_SECRET', 'VISITOR_SECRET'])('%s короче 32 символов → отказ', (name) => {
    expect(failure({ ...validEnv(), [name]: 'short-secret' }).variable).toBe(name);
  });

  it.each(['DATABASE_URL_TENANT', 'DATABASE_URL_SERVICE'])('%s отсутствует → отказ с именем', (name) => {
    const env = validEnv();
    delete env[name];
    expect(failure(env).variable).toBe(name);
  });

  it('F-3: строки подключения перепутаны местами → отказ (кабинет не входит служебной ролью)', () => {
    const env = validEnv();
    const swapped = { ...env, DATABASE_URL_TENANT: env.DATABASE_URL_SERVICE!, DATABASE_URL_SERVICE: env.DATABASE_URL_TENANT! };
    const error = failure(swapped);
    expect(error.variable).toBe('DATABASE_URL_TENANT');
    expect(error.message).toContain('n6b_app_tenant');
    expect(error.message).not.toContain(':y@');
  });

  it('F-3: строка подключения без пароля или не postgresql:// → отказ', () => {
    expect(failure({ ...validEnv(), DATABASE_URL_TENANT: 'postgresql://n6b_app_tenant@db:5432/n6b' }).variable)
      .toBe('DATABASE_URL_TENANT');
    expect(failure({ ...validEnv(), DATABASE_URL_SERVICE: 'mysql://n6b_app_service:y@db/n6b' }).variable)
      .toBe('DATABASE_URL_SERVICE');
  });

  it('SC-US-016-2: enforceBootConfig завершает процесс кодом 1 и не печатает значения', () => {
    const exit = vi.fn((code: number) => { throw new Error(`exit ${code}`); }) as unknown as (code: number) => never;
    const lines: string[] = [];
    const env: Record<string, string> = { ...validEnv(), LIMIT_ANSWER_BOT_DAY: 'not-a-number-VALUE' };
    expect(() => enforceBootConfig(() => loadWebConfig(env), exit, (l) => lines.push(l))).toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(lines.join('\n')).toContain('LIMIT_ANSWER_BOT_DAY');
    expect(lines.join('\n')).not.toContain('not-a-number-VALUE');
    expect(lines.join('\n')).not.toContain(env.SESSION_SECRET!);
  });
});
