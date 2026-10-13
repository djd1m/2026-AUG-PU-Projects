import { createHash, randomBytes } from 'node:crypto';
import { createStudioClient, issueHandover, type Pool, type PoolClient, type AcceptHandoverResult } from '@n6b/db';
import { AuthService } from '@/server/auth';
import { PgAuthStore } from '@/server/auth-store';
import { seedActor } from './studio-fixture';
import { uniq } from '../../../../packages/db/tests/int/helpers';

export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function material(email = `${uniq('claim')}@example.test`, keepStudioAccess = false, token = randomBytes(32).toString('base64url')) {
  return { tokenHash: digest(token), email, passwordHash: 'client-hash', keepStudioAccess,
    session: { tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000) } };
}
export async function fixture(owner: Pool, service: Pool) {
  const studio = await seedActor(owner, service);
  const created = await createStudioClient(service, studio.accountId, null);
  if (typeof created !== 'object') throw new Error(`fixture create failed ${created}`);
  const token = randomBytes(32).toString('base64url');
  const issued = await issueHandover(service, studio.accountId, created.accountId, digest(token));
  if (issued === 'forbidden') throw new Error('fixture issue forbidden');
  return { studio, childId: created.accountId, token, input: material(undefined, false, token), issued };
}
export async function snapshot(owner: Pool, childId: string) {
  return { account: (await owner.query('SELECT * FROM account WHERE id = $1', [childId])).rows,
    tokens: (await owner.query('SELECT * FROM handover_token WHERE account_id = $1 ORDER BY id', [childId])).rows,
    sessions: (await owner.query('SELECT * FROM session WHERE account_id = $1 ORDER BY id', [childId])).rows };
}
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
export async function bounded<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('test barrier deadline')), ms);
  })]); } finally { if (timer) clearTimeout(timer); }
}
/** Proxy invokes real SQL; only test-side observation/fault injection changes execution. */
export function observePool(pool: Pool, options: {
  pid?: (pid: number) => void;
  query?: (c: PoolClient, sql: string, args?: unknown[]) => Promise<unknown>;
} = {}): Pool {
  return new Proxy(pool, { get(target, key) {
    if (key !== 'connect') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
    return async () => {
      const c = await target.connect();
      try {
        await c.query("SET statement_timeout = '5s'");
        options.pid?.((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        return new Proxy(c, { get(client, property) {
          if (property === 'query' && options.query) return (sql: string, args?: unknown[]) => options.query!(c, sql, args);
          const value = Reflect.get(client, property); return typeof value === 'function' ? value.bind(client) : value;
        } });
      } catch (e) { c.release(); throw e; }
    };
  } }) as Pool;
}
export async function expireAfterWait(owner: Pool, hash: string) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const row = (await owner.query('SELECT expires_at <= clock_timestamp() AS expired FROM handover_token WHERE token_hash = $1', [hash])).rows[0];
    if (row?.expired) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('database clock did not reach token expiry');
}
export async function claimed(owner: Pool, childId: string, result: AcceptHandoverResult, input: ReturnType<typeof material>) {
  if (typeof result !== 'object') throw new Error(`claim failed ${result}`);
  const s = await snapshot(owner, childId);
  const a = s.account[0];
  if (a.email !== input.email || a.password_hash !== input.passwordHash) throw new Error('winner credentials differ');
  if (s.sessions.length !== 1 || s.sessions[0].token_hash !== input.session.tokenHash) throw new Error('winner session differs');
  return s;
}
export function actualAuth(service: Pool, hasher: ConstructorParameters<typeof AuthService>[1]) {
  return new AuthService(new PgAuthStore(service), hasher, 'handover-test-session-secret');
}
