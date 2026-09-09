// Adapted from project01 password.ts: Argon2id, bounded input, verification outside SQL.
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { assert, str } from '../domain/common.mjs';

const options = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };
let active = 0, dummy;
export function passwordInput(value) {
  str(value, 200); assert(value.length >= 12, 'PASSWORD_POLICY', 400, 'Пароль: от 12 до 200 символов');
  return value;
}
export function emailInput(value) {
  str(value, 254); const email = value.trim().toLowerCase();
  assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'EMAIL_INVALID', 400, 'Проверьте адрес почты');
  return email;
}
async function admitted(operation) {
  assert(active < 2, 'AUTH_BUSY', 429, 'Слишком много попыток входа; повторите позже');
  active++;
  try { return await operation(); } finally { active--; }
}
export const hashPassword = plain => admitted(() => hash(passwordInput(plain), options));
export async function verifyPassword(stored, plain) {
  passwordInput(plain);
  return admitted(async () => {
    dummy ??= hash(randomBytes(32).toString('base64url'), options);
    try { return await verify(stored ?? await dummy, plain, options); } catch { return false; }
  });
}
