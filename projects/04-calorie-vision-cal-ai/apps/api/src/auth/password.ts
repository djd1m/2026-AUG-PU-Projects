// Пароль PWA-входа (OWN-012: PWA — первый приоритет, Telegram — вторая очередь).
//
// scrypt из `node:crypto` — без новой зависимости и без нативного модуля в образе (в N3a стоит
// `@node-rs/argon2`; здесь переносится ФОРМА — сервис с проверкой формата хеша и постоянным
// временем сравнения, — а не библиотека: одна нативная зависимость ради одного вызова не стоит
// второго набора грабель при сборке образа). Параметры — рекомендация OWASP для scrypt:
// N = 2^15, r = 8, p = 1, 32 байта; соль 16 байт случайных.
//
// Формат хранения самоописывающийся: `$scrypt$n=32768,r=8,p=1$<соль b64>$<хеш b64>`. Хеш,
// не подходящий под формат, НЕ проверяется — он не «наверное, старый», а неизвестный
// (`fail-closed-defaults.md`).

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const HASH_RE = /^\$scrypt\$n=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+=*)\$([A-Za-z0-9+/]+=*)$/;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** 8–200 знаков (кодовых точек), не более 800 байт: длиннее — не пароль, а нагрузка на KDF. */
export function isValidPassword(value: unknown): value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 800) return false;
  const points = Array.from(value).length;
  return points >= 8 && points <= 200;
}

export function isSupportedPasswordHash(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 300) return false;
  const m = HASH_RE.exec(value);
  if (m === null) return false;
  return Buffer.from(m[4]!, 'base64').length === SALT_LEN && Buffer.from(m[5]!, 'base64').length === KEY_LEN;
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) throw new Error('invalid_password');
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `$scrypt$n=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** `false` на неверный пароль, на неподдерживаемый хеш и на любой сбой KDF — никогда исключение. */
export async function verifyPassword(stored: unknown, password: unknown): Promise<boolean> {
  if (!isValidPassword(password) || !isSupportedPasswordHash(stored)) return false;
  const m = HASH_RE.exec(stored)!;
  try {
    const key = await scrypt(password, Buffer.from(m[4]!, 'base64'), Number(m[1]), Number(m[2]), Number(m[3]));
    return timingSafeEqual(key, Buffer.from(m[5]!, 'base64'));
  } catch {
    return false;
  }
}

/** Хеш-заглушка: вход по несуществующей почте проверяется против него, чтобы время ответа
 *  не выдавало, есть ли такой аккаунт. Считается один раз на процесс. */
let dummyHashPromise: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(24).toString('base64url'));
  return dummyHashPromise;
}

/** Нормализованная почта или `null`. Регистр не значим; пробелы по краям — опечатка, не часть адреса. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}
