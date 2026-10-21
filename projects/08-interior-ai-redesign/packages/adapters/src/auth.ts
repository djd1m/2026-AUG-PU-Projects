// Adapted N6 password/session primitives; domain receives narrow injectable ports.
import bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'node:crypto';
import { DomainError } from '@n8/domain/common';
import type { PasswordPort, TokenPort } from '@n8/domain/identity';
export const BCRYPT_COST = 10;
export const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
function bound(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > 72) throw new DomainError(422, 'INVALID_CREDENTIALS', 'Пароль превышает 72 байта UTF-8');
}
export const passwords: PasswordPort = {
  dummyHash: DUMMY_HASH,
  async hash(password) { bound(password); return bcrypt.hash(password, BCRYPT_COST); },
  async compare(password, hash) { bound(password); return bcrypt.compare(password, hash); },
};
export function tokenPort(secret: string): TokenPort {
  if (Buffer.byteLength(secret) < 32) throw new Error('SESSION_CONFIG_INVALID');
  return { create: () => randomBytes(32).toString('base64url'), hash: token => createHmac('sha256', secret).update(token).digest('hex') };
}
