import { createHmac, randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { IdentityRepository } from '@n3a/db';
import { generateSessionToken, hashSessionToken, isSessionToken, SessionService } from '../src/lib/auth/session';

it('opaque session lifecycle rejects expired revoked and disabled identities', async () => {
  // DB predicate behavior is tested with real roles in auth-repository.integration.test.ts.
  const secret = randomBytes(32); const token = generateSessionToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  expect(new Set(Array.from({ length: 100 }, generateSessionToken)).size).toBe(100);
  const digest = hashSessionToken(token, secret);
  expect(digest).toHaveLength(32);
  expect(digest.equals(createHmac('sha256', secret).update(token).digest())).toBe(false);
  expect(digest.equals(createHmac('sha256', secret).update('n3a:session:v1:' + token).digest())).toBe(true);
  expect(hashSessionToken(token, randomBytes(32)).equals(digest)).toBe(false);
  const repository: IdentityRepository = { findUser: vi.fn(async () => null),
    issueSessionIfCurrent: vi.fn(async () => null), resolveSession: vi.fn(async () => null),
    revokeSession: vi.fn(async () => {}) };
  const sessions = new SessionService(repository, secret);
  expect(await sessions.resolve(token)).toBeNull();
  await sessions.revoke(token); await sessions.revoke(token);
  expect(repository.revokeSession).toHaveBeenCalledTimes(2);
  expect(repository.revokeSession).toHaveBeenCalledWith(digest);
  for (const bad of [null, {}, '', token + '=', 'A'.repeat(42), ';' + token.slice(1)]) {
    expect(isSessionToken(bad)).toBe(false); expect(await sessions.resolve(bad)).toBeNull();
  }
  expect(repository.resolveSession).toHaveBeenCalledTimes(1);
  expect(() => new SessionService(repository, Buffer.alloc(0))).toThrow('invalid_SESSION_SECRET');
});
