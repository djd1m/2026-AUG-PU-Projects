// Architecture §3.2 — хеш пароля и инвариант «в БД только хеш токена сессии».

import { beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from '../src/lib/password';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  sessionCookieOptions,
  sessionTokenMatches,
} from '../src/lib/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
});

describe('пароль — argon2id', () => {
  it('хеш не содержит пароль и помечен argon2id', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h).toContain('$argon2id$');
    expect(h).not.toContain('correct horse battery');
  });

  it('верный пароль проходит, неверный — нет', async () => {
    const h = await hashPassword('s3cret-password');
    expect(await verifyPassword(h, 's3cret-password')).toBe(true);
    expect(await verifyPassword(h, 's3cret-passwore')).toBe(false);
    expect(await verifyPassword(h, '')).toBe(false);
  });

  it('одинаковые пароли дают РАЗНЫЕ хеши (соль на запись)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same')).toBe(true);
    expect(await verifyPassword(b, 'same')).toBe(true);
  });

  it('битый хеш из БД — это «не совпало», а не исключение', async () => {
    expect(await verifyPassword('не-хеш-вовсе', 'что-угодно')).toBe(false);
  });

  it('минимальная длина пароля зафиксирована как 8 (Pseudocode §9)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('сессия — Architecture §3.2', () => {
  it('токен непрозрачный и достаточной энтропии', () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43); // 32 байта в base64url
  });

  it('два токена не совпадают', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(seen.size).toBe(100);
  });

  it('ИНВАРИАНТ: хеш токена не позволяет восстановить сам токен', () => {
    const token = generateSessionToken();
    const h = hashSessionToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(token);
    expect(token).not.toContain(h);
  });

  it('хеш детерминирован и сверяется константным сравнением', () => {
    const token = generateSessionToken();
    const h = hashSessionToken(token);
    expect(hashSessionToken(token)).toBe(h);
    expect(sessionTokenMatches(h, token)).toBe(true);
    expect(sessionTokenMatches(h, generateSessionToken())).toBe(false);
  });

  it('хеш зависит от SESSION_SECRET (дамп БД без секрета не перебирается заранее)', () => {
    const token = generateSessionToken();
    const withSecretA = hashSessionToken(token);
    process.env.SESSION_SECRET = 'another-secret-at-least-16-chars';
    const withSecretB = hashSessionToken(token);
    process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
    expect(withSecretA).not.toBe(withSecretB);
  });

  it('без SESSION_SECRET — fail-closed, а не молчаливый дефолт', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(() => hashSessionToken('x')).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = 'short';
    expect(() => hashSessionToken('x')).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
  });

  it('cookie httpOnly и не отдаётся кросс-сайтом', () => {
    const o = sessionCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe('lax');
    expect(o.path).toBe('/');
    expect(o.maxAge).toBe(SESSION_TTL_MS / 1000);
    expect(SESSION_COOKIE).toBe('pw_session');
  });

  it('Secure включается в production', () => {
    const saved = process.env.NODE_ENV;
    // NODE_ENV в типах Next помечен readonly — присваиваем через индекс.
    (process.env as Record<string, string>)['NODE_ENV'] = 'production';
    expect(sessionCookieOptions().secure).toBe(true);
    (process.env as Record<string, string>)['NODE_ENV'] = saved ?? 'test';
  });
});
