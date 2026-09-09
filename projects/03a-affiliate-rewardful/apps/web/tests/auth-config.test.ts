import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { readRuntimeConfig } from '../src/lib/auth/config';
import { clearSessionCookie, serializeSessionCookie } from '../src/lib/auth/cookie';
import { generateSessionToken } from '../src/lib/auth/session';
it('configuration and cookie boundaries reject malformed input without leaking sentinels', () => {
  const secret = randomBytes(32).toString('base64url');
  const database = 'postgresql://n3a_app:sensitive-db-sentinel@postgres/n3a';
  const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const DATABASE_URL of [undefined, '', ' ', 'http://host/path', 'postgresql://host/n3a', database + '#sentinel', database + '?x=1',
      'postgresql://n3a_app:%ZZ@postgres/n3a', 'postgresql://%ZZ:password@postgres/n3a', database + '%ZZ',
      'postgresql://n3a_app:password%00@postgres/n3a']) {
      expect(() => readRuntimeConfig({ DATABASE_URL, SESSION_SECRET: secret })).toThrow('invalid_DATABASE_URL');
    }
    for (const SESSION_SECRET of [undefined, '', 'short', secret + '=', 'x '.repeat(40), 'A'.repeat(42), 'A'.repeat(1025), Buffer.alloc(32).toString('base64url')]) {
      expect(() => readRuntimeConfig({ DATABASE_URL: database, SESSION_SECRET })).toThrow('invalid_SESSION_SECRET');
    }
    const config = readRuntimeConfig({ DATABASE_URL: database, SESSION_SECRET: secret });
    expect(config.sessionSecret.equals(Buffer.from(secret, 'base64url'))).toBe(true);
    const token = generateSessionToken();
    expect(serializeSessionCookie(token)).toBe(`__Host-n3a_session=${token}; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax`);
    expect(clearSessionCookie()).toBe('__Host-n3a_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax');
    expect(() => serializeSessionCookie('x; Domain=attacker')).toThrow('invalid_input');
    expect(logs).not.toHaveBeenCalled();
  } finally { logs.mockRestore(); }
});
