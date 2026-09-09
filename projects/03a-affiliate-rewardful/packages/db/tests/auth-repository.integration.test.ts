import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AuthRepository } from '../src/auth-repository';
import { createUser, fixturePools, migrateFixture, removeUsers } from './helpers';
import { hashPassword } from '../../../apps/web/src/lib/auth/password';
import { createCredentialService } from '../../../apps/web/src/lib/auth/credentials';
import { hashSessionToken, SessionService } from '../../../apps/web/src/lib/auth/session';
const pools = fixturePools(); const repository = new AuthRepository(pools.app);
const ids: string[] = []; const secret = randomBytes(32);
beforeAll(migrateFixture);
afterAll(async () => { await removeUsers(pools.migrate, ids); await pools.app.end(); await pools.migrate.end(); });
it('actual opaque sessions persist only HMAC and reject expiry revocation disabled and unknown users', async () => {
  const user = await createUser(pools.migrate, await hashPassword('correct-password')); ids.push(user.id);
  const credentials = await createCredentialService(repository, secret);
  const result = await credentials.authenticate(user.identityHash, 'correct-password');
  expect(result.ok).toBe(true); if (!result.ok) throw new Error('issuance_failed');
  expect(Object.keys(result.context).sort()).toEqual(['expires_at', 'session_id', 'user_id']);
  const sessions = new SessionService(repository, secret);
  expect(await sessions.resolve(result.token)).toEqual(result.context);
  const stored = (await pools.migrate.query('SELECT * FROM n3a.sessions WHERE id=$1', [result.context.session_id])).rows[0];
  expect(stored.token_hash.equals(hashSessionToken(result.token, secret))).toBe(true);
  expect(stored.expires_at.getTime() - stored.created_at.getTime()).toBe(86_400_000);
  expect(JSON.stringify(stored)).not.toContain(result.token);
  expect(await sessions.resolve(randomBytes(32).toString('base64url'))).toBeNull();
  await sessions.revoke(result.token); await sessions.revoke(result.token);
  expect(await sessions.resolve(result.token)).toBeNull();
  const next = await sessions.issueIfCurrent(user.id, user.passwordHash); expect(next).not.toBeNull();
  await pools.migrate.query('UPDATE n3a.users SET enabled=false WHERE id=$1', [user.id]);
  expect(await sessions.resolve(next!.token)).toBeNull();
  await pools.migrate.query('UPDATE n3a.users SET enabled=true WHERE id=$1', [user.id]);
  await pools.migrate.query('UPDATE n3a.sessions SET expires_at=$1 WHERE id=$2', [next!.context.expires_at, next!.context.session_id]);
  const exactClock = new AuthRepository(pools.app, () => next!.context.expires_at);
  expect(await exactClock.resolveSession(hashSessionToken(next!.token, secret))).toBeNull();
  const beforeExpiry = new AuthRepository(pools.app, () => new Date(next!.context.expires_at.getTime() - 1));
  expect(await beforeExpiry.resolveSession(hashSessionToken(next!.token, secret))).not.toBeNull();
  // Also exercise normal database-clock expiry.
  const exact = await pools.migrate.query(`WITH expired AS (
    UPDATE n3a.sessions SET created_at=statement_timestamp()-interval '1 hour', expires_at=statement_timestamp()
    WHERE id=$1 RETURNING expires_at)
    SELECT expires_at > statement_timestamp() AS valid FROM expired`, [next!.context.session_id]);
  expect(exact.rows[0].valid).toBe(false);
  expect(await sessions.resolve(next!.token)).toBeNull();
});
it('issuance rejects stale null disabled credentials and rolls back token collisions', async () => {
  const user = await createUser(pools.migrate, 'snapshot'); ids.push(user.id);
  const token = randomBytes(32);
  expect(await repository.issueSessionIfCurrent(user.id, 'stale', token)).toBeNull();
  const nullResult = await pools.app.query('SELECT * FROM n3a.issue_session_if_current($1,NULL,$2)', [user.id, token]);
  expect(nullResult.rows).toHaveLength(0);
  expect(await repository.issueSessionIfCurrent(user.id, user.passwordHash, token)).not.toBeNull();
  await expect(repository.issueSessionIfCurrent(user.id, user.passwordHash, token)).rejects.toThrow('unavailable');
  expect((await pools.migrate.query('SELECT count(*)::int AS n FROM n3a.sessions WHERE user_id=$1', [user.id])).rows[0].n).toBe(1);
});
it('database failure and invalid hash boundaries cannot grant identity', async () => {
  await expect(repository.findUser(Buffer.alloc(1))).rejects.toThrow('invalid_input');
  const dead = fixturePools(); await dead.app.end();
  await expect(new AuthRepository(dead.app).resolveSession(randomBytes(32))).rejects.toThrow('unavailable');
  await dead.migrate.end();
});
