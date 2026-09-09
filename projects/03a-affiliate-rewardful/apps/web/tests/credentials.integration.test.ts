import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AuthRepository, type IdentityRepository } from '../../../packages/db/src/auth-repository';
import { createUser, deferred, fixturePools, migrateFixture, removeUsers } from '../../../packages/db/tests/helpers';
import { createCredentialService } from '../src/lib/auth/credentials';
import { hashPassword, PasswordService } from '../src/lib/auth/password';
import { KdfAdmission } from '../src/lib/auth/kdf-admission';
const pools = fixturePools(); const repository = new AuthRepository(pools.app);
const ids: string[] = []; let encoded: string;
beforeAll(async () => { await migrateFixture(); encoded = await hashPassword('correct-password'); });
afterAll(async () => { await removeUsers(pools.migrate, ids); await pools.app.end(); await pools.migrate.end(); });
it('generic credential denial and post-KDF state recheck prevent session issuance', async () => {
  const enabled = await createUser(pools.migrate, encoded); ids.push(enabled.id);
  const disabled = await createUser(pools.migrate, encoded, false); ids.push(disabled.id);
  const corrupt = await createUser(pools.migrate, encoded.replace('65536', '4294967295')); ids.push(corrupt.id);
  const adapter = { hash: vi.fn(async () => encoded), verify: vi.fn(async (_stored: string, _plain: string) => false) };
  const passwords = new PasswordService(new KdfAdmission(), adapter);
  const service = await createCredentialService(repository, randomBytes(32), passwords);
  await createCredentialService(repository, randomBytes(32), passwords);
  expect(adapter.hash).toHaveBeenCalledTimes(1);
  for (const identity of [enabled.identityHash, disabled.identityHash, randomBytes(32), corrupt.identityHash]) {
    expect(await service.authenticate(identity, 'wrong-password')).toEqual({ ok: false, error: 'invalid_credentials' });
  }
  expect(adapter.verify).toHaveBeenCalledTimes(4);
  expect(adapter.verify.mock.calls.every((call) => call[0] === encoded)).toBe(true);
  expect(await service.authenticate('injection-shaped identity', 'correct-password')).toEqual({ ok: false, error: 'invalid_input' });
  expect(adapter.verify).toHaveBeenCalledTimes(4);
  for (const mutation of ['disable', 'password']) {
    const user = await createUser(pools.migrate, encoded); ids.push(user.id);
    const entered = deferred<void>(); const resume = deferred<boolean>();
    const paused = new PasswordService(new KdfAdmission(), {
      hash: async () => encoded, verify: async () => { entered.resolve(); return resume.promise; },
    });
    const login = await createCredentialService(repository, randomBytes(32), paused);
    const pending = login.authenticate(user.identityHash, 'correct-password');
    await entered.promise;
    expect(pools.app.totalCount - pools.app.idleCount).toBe(0);
    await pools.migrate.query(mutation === 'disable' ? 'UPDATE n3a.users SET enabled=false WHERE id=$1' :
      "UPDATE n3a.users SET password_hash=password_hash || 'changed' WHERE id=$1", [user.id]);
    resume.resolve(true);
    expect(await pending).toEqual({ ok: false, error: 'invalid_credentials' });
    expect((await pools.migrate.query('SELECT count(*)::int AS n FROM n3a.sessions WHERE user_id=$1', [user.id])).rows[0].n).toBe(0);
  }
});
it('saturated credential KDF holds no DB clients and independent database work completes', async () => {
  const entered = deferred<void>(); const gate = deferred<boolean>(); let calls = 0;
  const passwords = new PasswordService(new KdfAdmission(), {
    hash: async () => encoded,
    verify: async () => { calls++; if (calls === 2) entered.resolve(); return gate.promise; },
  });
  const service = await createCredentialService(repository, randomBytes(32), passwords);
  const pending = Array.from({ length: 10 }, () => service.authenticate(randomBytes(32), 'correct-password'));
  await entered.promise;
  expect(passwords.admission.stats).toMatchObject({ active: 2, queued: 8 });
  expect(pools.app.totalCount - pools.app.idleCount).toBe(0);
  expect((await pools.app.query('SELECT 7 AS probe')).rows[0].probe).toBe(7);
  expect(await service.authenticate(randomBytes(32), 'correct-password')).toEqual({ ok: false, error: 'overloaded' });
  expect(calls).toBe(2);
  gate.resolve(false);
  expect((await Promise.all(pending)).every((r) => !r.ok && r.error === 'invalid_credentials')).toBe(true);
});
it('database and native errors never disclose sensitive sentinel values', async () => {
  const logs = (['error', 'log', 'warn', 'info', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  try {
    const identity = randomBytes(32); const secret = randomBytes(32); const token = randomBytes(32).toString('base64url');
    const sentinels = ['sensitive-password-sentinel', identity.toString('hex'), secret.toString('base64url'), token, pools.urls.app];
    const sensitiveError = sentinels.join(' ');
    const service = await createCredentialService(repository, secret, new PasswordService(new KdfAdmission(), {
      hash: async () => encoded, verify: async () => { throw new Error(sensitiveError); },
    }));
    expect(await service.authenticate(identity, sentinels[0])).toEqual({ ok: false, error: 'invalid_credentials' });
    const failedRepository: IdentityRepository = {
      findUser: async () => { throw new Error(sensitiveError); },
      issueSessionIfCurrent: async () => { throw new Error('unexpected_issuer'); },
      resolveSession: async () => null,
      revokeSession: async () => {},
    };
    const unavailable = await createCredentialService(failedRepository, secret, new PasswordService(new KdfAdmission(), {
      hash: async () => encoded, verify: async () => false,
    }));
    expect(await unavailable.authenticate(identity, sentinels[0])).toEqual({ ok: false, error: 'unavailable' });
    const captured = JSON.stringify(logs.flatMap((log) => log.mock.calls));
    for (const sentinel of sentinels) expect(captured.includes(sentinel), 'sensitive diagnostic absent').toBe(false);
    expect(logs[0]?.mock.calls).toEqual([['password_verification_failed'], ['authentication_unavailable']]);
    for (const log of logs.slice(1)) expect(log).not.toHaveBeenCalled();
  } finally { for (const log of logs) log.mockRestore(); }
});
