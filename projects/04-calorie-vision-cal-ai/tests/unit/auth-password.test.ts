// Пароль PWA-входа (OWN-012): формат хеша, проверка, отказ на мусор.
import { describe, expect, it } from 'vitest';
import { dummyHash, hashPassword, isSupportedPasswordHash, isValidPassword, normalizeEmail, verifyPassword } from '../../apps/api/src/auth/password.js';

describe('password (scrypt, самоописывающийся формат)', () => {
  it('хеш проходит собственную проверку формата и верифицируется', async () => {
    const h = await hashPassword('correct horse battery');
    expect(isSupportedPasswordHash(h)).toBe(true);
    expect(h.startsWith('$scrypt$n=32768,r=8,p=1$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(h, 'correct horse batterY')).toBe(false);
  });
  it('два хеша одного пароля различаются (соль случайна)', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });
  it('неподдерживаемый хеш — false, а не исключение (fail-closed)', async () => {
    for (const bad of ['', 'plain', '$argon2id$v=19$m=65536,t=3,p=1$abc$def', null, undefined, 42]) {
      expect(await verifyPassword(bad, 'whatever-8chars'), String(bad)).toBe(false);
    }
  });
  it('валидация пароля: 8..200 знаков, ≤ 800 байт', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('я'.repeat(200))).toBe(true);
    expect(isValidPassword('я'.repeat(201))).toBe(false);
    expect(isValidPassword(12345678)).toBe(false);
  });
  it('заглушка для несуществующей почты — один хеш на процесс', async () => {
    expect(await dummyHash()).toBe(await dummyHash());
    expect(isSupportedPasswordHash(await dummyHash())).toBe(true);
  });
  it('почта нормализуется: регистр и пробелы; мусор → null', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
    for (const bad of ['', 'a@b', 'no-at.example.com', 'x@y.z', ' @example.com', null, 5]) expect(normalizeEmail(bad), String(bad)).toBeNull();
  });
});
