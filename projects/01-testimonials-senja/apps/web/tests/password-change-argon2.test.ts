// FR-010 — СКОЛЬКО РАЗ считается argon2 на каждом пути.
//
// Отдельный файл, потому что здесь подменяется модуль паролей, и подмена не должна
// протекать в соседние наборы.
//
// Почему это вообще отдельный класс проверки. Ревизия 2 фичи вынесла hashPassword(next)
// за транзакцию — правка была написана ради удержания соединения пула и цель свою
// достигала. Побочно она поставила хеш ДО лимитера: запрос, обречённый на 429, всё равно
// оплачивал 38 мс CPU и 19 МиБ, без потолка, из одной валидной cookie. Тот же процессор
// считает argon2 входа, то есть вход деградировал бы вместе.
//
// НАБЛЮДАЕМЫЙ ИСХОД У ВЕРНОЙ И СЛОМАННОЙ ВЕРСИЙ ОДИНАКОВ — обе отвечают 429. Различает
// их только число вызовов, поэтому оно и проверяется напрямую.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const calls = vi.hoisted(() => ({ hash: 0, verify: 0 }));
vi.mock('../src/lib/password', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/password')>();
  return {
    ...real,
    hashPassword: (...a: Parameters<typeof real.hashPassword>) => {
      calls.hash += 1;
      return real.hashPassword(...a);
    },
    verifyPassword: (...a: Parameters<typeof real.verifyPassword>) => {
      calls.verify += 1;
      return real.verifyPassword(...a);
    },
  };
});

const { pool, withAccount, withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { hashKey } = await import('../src/lib/login');
const {
  changePassword, PWCHANGE_PAIR_SCOPE, PWCHANGE_PAIR_THRESHOLD, PWCHANGE_LOCK_NAMESPACE,
} = await import('../src/lib/password-change');

afterAll(async () => { await closePool(); });

const OLD = 'old-correct-horse-battery';
const NEW = 'new-correct-horse-battery';
let seq = 0;

async function makeOwner(): Promise<string> {
  seq += 1;
  const slug = `pwa-${seq}-${Date.now().toString(36)}`;
  const r = await withService((c) =>
    registerAccountAndProject(c, {
      email: `${slug}@example.com`, password: OLD, desired_slug: slug, project_name: 'PWA',
    }),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [`${slug}@example.com`]),
  );
  return rows[0]!.id;
}

// Уникально МЕЖДУ ПРОГОНАМИ: счётчик по адресу живёт час и между наборами не чистится,
// поэтому нумерация с нуля накапливала порог и роняла первую же попытку (см. соседний файл).
const RUN = `${process.pid}-${Date.now().toString(36)}`;
const addr = () => { seq += 1; return `testkey-${RUN}-${seq}`; };

const change = (accountId: string, current: string, next: string, ip: string) =>
  withAccount(accountId, (c) => changePassword(c, { accountId, ip, current, next }));

beforeEach(() => { calls.hash = 0; calls.verify = 0; });

describe('AC-010.22 — путь ОТКАЗА стоит ровно одного argon2', () => {
  it('неверный текущий пароль: hash 0, verify 1', async () => {
    const id = await makeOwner();
    calls.hash = 0; calls.verify = 0;   // регистрация внутри makeOwner тоже считает argon2
    const r = await change(id, 'совсем-не-тот', NEW, addr());
    expect(r.ok).toBe(false);

    // Падает при M13: перенести hashPassword в начало changePassword.
    expect(calls.hash, 'хеш нового пароля считается на пути отказа — бесплатное жжение CPU')
      .toBe(0);
    // Столько же, сколько стоит попытка входа: ни больше, ни меньше.
    expect(calls.verify).toBe(1);
  });
});

describe('AC-010.25 — отклонённый ДО проверки запрос не считает argon2 ни разу', () => {
  it('исчерпанный лимит (429): hash 0, verify 0', async () => {
    const id = await makeOwner();
    const ip = addr();
    for (let i = 0; i < PWCHANGE_PAIR_THRESHOLD; i += 1) await change(id, 'не-тот', NEW, ip);

    calls.hash = 0; calls.verify = 0;
    const r = await change(id, OLD, NEW, ip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_many');

    // Падает при M13b — ровно дефект ревизии 2. Наблюдаемый исход (429) у верной и
    // сломанной версий совпадает; различает только эта строка.
    expect(calls.hash, 'обречённый на 429 запрос оплатил argon2').toBe(0);
    expect(calls.verify, 'обречённый на 429 запрос оплатил argon2').toBe(0);
  });

  it('занятый лок (409): hash 0, verify 0', async () => {
    const id = await makeOwner();
    const ip = addr();
    const keyPair = hashKey(PWCHANGE_PAIR_SCOPE, id, ip);

    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1, hashtext($2))', [
        PWCHANGE_LOCK_NAMESPACE, keyPair,
      ]);
      calls.hash = 0; calls.verify = 0;
      const r = await change(id, OLD, NEW, ip);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('busy');
      expect(calls.hash).toBe(0);
      expect(calls.verify).toBe(0);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
});

describe('путь УСПЕХА — ровно по одному разу', () => {
  it('успешная смена: hash 1, verify 1', async () => {
    const id = await makeOwner();
    calls.hash = 0; calls.verify = 0;   // см. выше
    const r = await change(id, OLD, NEW, addr());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(calls.verify).toBe(1);
    // Один, а не ноль: иначе пароль не был бы перехеширован вовсе.
    expect(calls.hash).toBe(1);
  });
});
