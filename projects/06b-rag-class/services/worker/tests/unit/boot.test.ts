import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// SC-US-016-2 на настоящем процессе: код возврата и stderr, а не вызов функции.
// Требует собранного @n6b/db (npm run build --workspace @n6b/db) — так же, как рантайм-образ воркера.
const ROOT = path.resolve(__dirname, '../../../..');
const MAIN = path.join(ROOT, 'services/worker/src/main.ts');

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', MAIN], {
    cwd: ROOT, env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8', timeout: 20000,
  });
}

const VALID = {
  DATABASE_URL_SERVICE: 'postgresql://n6b_app_service:x@db:5432/n6b',
  OPENROUTER_API_KEY: 'sk-or-test-placeholder',
  LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '2000000',
  LIMIT_EMBED_TOKENS_GLOBAL_DAY: '20000000',
  // chunk-embed: дверь воркера собирается только из полной связки пределов (createLiveGateway → limitsFrom).
  LIMIT_ANSWER_VISITOR_DAY: '30',
  LIMIT_ANSWER_BOT_DAY: '300',
  LIMIT_ANSWER_GLOBAL_DAY: '3000',
  LIMIT_SANDBOX_ACCOUNT_DAY: '100',
  LIMIT_SANDBOX_GLOBAL_DAY: '2000',
};

describe('worker: отказ старта без конфигурации', () => {
  it('SC-US-016-2: пустое окружение → exit 1 и имя переменной', () => {
    const r = run({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('DATABASE_URL_SERVICE не задан');
  });

  it('SC-US-016-2: пустая строка предела → exit 1 с именем, значение не печатается', () => {
    const r = run({ ...VALID, LIMIT_EMBED_TOKENS_GLOBAL_DAY: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('LIMIT_EMBED_TOKENS_GLOBAL_DAY задан пустым');
    expect(r.stderr).not.toContain('sk-or-test-placeholder');
  });

  it('персональный предел больше общего → exit 1', () => {
    const r = run({ ...VALID, LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '30000000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('LIMIT_EMBED_TOKENS_ACCOUNT_DAY');
  });

  it('F-3 (08_review.md): предел больше int4 → exit 1 с именем при старте', () => {
    const r = run({ ...VALID, LIMIT_EMBED_TOKENS_ACCOUNT_DAY: '2147483648', LIMIT_EMBED_TOKENS_GLOBAL_DAY: '3000000000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('LIMIT_EMBED_TOKENS_ACCOUNT_DAY больше 2147483647');
  });

  it('F-3: воркер со строкой подключения кабинета (n6b_app_tenant) → exit 1, пароль не печатается', () => {
    const r = run({ ...VALID, DATABASE_URL_SERVICE: 'postgresql://n6b_app_tenant:secretpw@db:5432/n6b' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('DATABASE_URL_SERVICE');
    expect(r.stderr).not.toContain('secretpw');
  });

  it('chunk-embed: без любого из пределов двери (не эмбеддингов) воркер не стартует — exit 1 с именем', () => {
    for (const name of ['LIMIT_ANSWER_VISITOR_DAY', 'LIMIT_ANSWER_BOT_DAY', 'LIMIT_ANSWER_GLOBAL_DAY',
      'LIMIT_SANDBOX_ACCOUNT_DAY', 'LIMIT_SANDBOX_GLOBAL_DAY']) {
      const env: Record<string, string> = { ...VALID };
      delete env[name];
      const r = run(env);
      expect(r.status, name).toBe(1);
      expect(r.stderr, name).toContain(`${name} не задан`);
      expect(r.stderr).not.toContain('sk-or-test-placeholder');
    }
  });

  it('chunk-embed: пределы двери с персональным больше общего → exit 1 при старте, а не на первой задаче', () => {
    const r = run({ ...VALID, LIMIT_SANDBOX_ACCOUNT_DAY: '5000' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('LIMIT_SANDBOX_ACCOUNT_DAY');
  });
});
