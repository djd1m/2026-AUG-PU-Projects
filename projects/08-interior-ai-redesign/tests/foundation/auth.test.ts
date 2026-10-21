import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AuthService, type AuthStore, type PasswordPort, SESSION_TTL_SECONDS } from '@n8/domain/identity';
import { passwords, tokenPort, BCRYPT_COST } from '@n8/adapters/auth';
const clock = { now: () => new Date('2026-10-13T22:00:00Z') };
const tokens = tokenPort(randomBytes(32).toString('hex'));
function store(): AuthStore {
  return { findAccount: vi.fn(async () => null), register: vi.fn(async () => {}), createSession: vi.fn(async () => true), revoke: vi.fn(async () => {}), findSession: vi.fn(async () => null) };
}
describe('SC-US-001 auth ports and password boundary', () => {
  it('SC-US-001-3 permits 72 UTF8 bytes, rejects 73/multibyte suffix before hashing for register/login', async () => {
    const db = store(); const pwd: PasswordPort = { hash: vi.fn(async () => 'hash'), compare: vi.fn(async () => false), dummyHash: 'dummy' };
    const auth = new AuthService(db, pwd, tokens, clock);
    await auth.register('USER@example.org', 'я'.repeat(36));
    expect(pwd.hash).toHaveBeenCalledOnce(); expect(db.register).toHaveBeenCalledWith('user@example.org', 'hash', expect.anything());
    for (const password of ['a'.repeat(73), 'я'.repeat(36) + 'a', 'a'.repeat(11), '😀'.repeat(19)]) {
      await expect(auth.register('user@example.org', password)).rejects.toMatchObject({ status: 422 });
      await expect(auth.login('user@example.org', password)).rejects.toMatchObject({ status: 422 });
    }
    expect(pwd.hash).toHaveBeenCalledOnce(); expect(pwd.compare).not.toHaveBeenCalled();
  });
  it('SC-US-001-2 missing/wrong/disabled accounts have same failure and dummy compare is performed', async () => {
    const db = store(), pwd: PasswordPort = { hash: vi.fn(), compare: vi.fn(async () => false), dummyHash: 'dummy' };
    const auth = new AuthService(db, pwd, tokens, clock);
    await expect(auth.login('user@example.org', 'safe-password123')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(pwd.compare).toHaveBeenCalledWith('safe-password123', 'dummy');
    vi.mocked(db.findAccount).mockResolvedValue({ id: 'a', passwordHash: 'hash', status: 'active' });
    await expect(auth.login('user@example.org', 'safe-password123')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    vi.mocked(db.findAccount).mockResolvedValue({ id: 'a', passwordHash: 'hash', status: 'disabled' }); vi.mocked(pwd.compare).mockResolvedValue(true);
    await expect(auth.login('user@example.org', 'safe-password123')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(db.createSession).not.toHaveBeenCalled();
  });
  it('SC-US-001-1 real bcrypt10, token32/HMAC and seven-day session; hash completes before store', async () => {
    const db = store(); const auth = new AuthService(db, passwords, tokens, clock);
    vi.mocked(db.register).mockImplementation(async (_email, hash, session) => {
      expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST); expect(await bcrypt.compare('safe-password123', hash)).toBe(true);
      expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/); expect(session.expiresAt.getTime() - clock.now().getTime()).toBe(SESSION_TTL_SECONDS * 1000);
    });
    const token = await auth.register('user@example.org', 'safe-password123');
    expect(Buffer.from(token, 'base64url')).toHaveLength(32); await auth.logout(token); expect(db.revoke).toHaveBeenCalledWith(tokens.hash(token));
    expect(await auth.authenticate('malformed')).toBeNull(); expect(db.findSession).not.toHaveBeenCalled();
  });
  it('mutation guard rejects domain dependency contamination and persistence bcrypt work', () => {
    const pure = readFileSync('packages/domain/src/identity/index.ts', 'utf8'); const persistence = readFileSync('packages/db/src/identity.ts', 'utf8');
    const validate = (domain: string, repo: string) => { expect(domain).not.toMatch(/from ['"](?:node:|pg|next|bcrypt|@n8\/(?:db|adapters))/); expect(repo).not.toMatch(/\bbcrypt\b/); };
    validate(pure, persistence); expect(() => validate(pure + '\nimport x from "node:fs";', persistence)).toThrow();
    expect(() => validate(pure, persistence + '\nawait bcrypt.hash(secret,10);')).toThrow();
  });
});
