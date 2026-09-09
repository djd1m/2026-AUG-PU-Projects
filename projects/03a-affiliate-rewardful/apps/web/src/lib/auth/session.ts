// Adapted from N1 session.ts/current-session.ts: opaque token and HMAC lookup.
import { createHmac, randomBytes } from 'node:crypto';
import type { IdentityContext, IdentityRepository } from '@n3a/db';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
export function generateSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}
export function hashSessionToken(token: string, secret: Buffer): Buffer {
  if (!isSessionToken(token)) throw new Error('invalid_input');
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('invalid_SESSION_SECRET');
  return createHmac('sha256', secret).update('n3a:session:v1:').update(token).digest();
}
export class SessionService {
  private readonly secret: Buffer;
  constructor(private readonly repository: IdentityRepository, secret: Buffer) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('invalid_SESSION_SECRET');
    this.secret = Buffer.from(secret);
  }
  async issueIfCurrent(userId: string, passwordHash: string): Promise<{ token: string; context: IdentityContext } | null> {
    const token = generateSessionToken();
    const context = await this.repository.issueSessionIfCurrent(userId, passwordHash, hashSessionToken(token, this.secret));
    return context ? { token, context } : null;
  }
  async resolve(token: unknown): Promise<IdentityContext | null> {
    if (!isSessionToken(token)) return null;
    return this.repository.resolveSession(hashSessionToken(token, this.secret));
  }
  async revoke(token: unknown): Promise<void> {
    if (!isSessionToken(token)) return;
    await this.repository.revokeSession(hashSessionToken(token, this.secret));
  }
}
