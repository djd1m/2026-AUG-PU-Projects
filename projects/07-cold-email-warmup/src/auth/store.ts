// Adapted N5 AuthStore boundary and N6 active-account atomic grant (see provenance).
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
export interface Account { id: string; password_hash: string; state: string }
export interface Identity { account_id: string; tenant_id: string }
export interface SessionRecord { digest: string; expiresAt: Date }
export interface AuthStore {
  findAccount(email: string): Promise<Account | null>;
  register(email: string, passwordHash: string, session: SessionRecord): Promise<void>;
  createSession(account: Account, session: SessionRecord): Promise<boolean>;
  authenticate(digest: string): Promise<Identity | null>;
  revoke(digest: string): Promise<void>;
}
export class PgAuthStore implements AuthStore {
  constructor(readonly pool: Pool) {}
  async findAccount(email: string) { return (await this.pool.query<Account>('SELECT id,password_hash,state FROM account WHERE email=$1', [email])).rows[0] ?? null; }
  async register(email: string, passwordHash: string, session: SessionRecord) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = randomUUID(); const account = randomUUID();
      await client.query('INSERT INTO tenant(id) VALUES($1)', [tenant]);
      await client.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)', [account, tenant, email, passwordHash]);
      await client.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)', [randomUUID(), account, session.digest, session.expiresAt]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // Duplicate registration is indistinguishable and grants no existing account.
      if (!(error && typeof error === 'object' && 'code' in error && error.code === '23505')) throw error;
    } finally { client.release(); }
  }
  async createSession(account: Account, session: SessionRecord) {
    const result = await this.pool.query(`WITH active_account AS (
      SELECT a.id FROM account a JOIN tenant t ON t.id=a.tenant_id
      WHERE a.id=$1 AND a.password_hash=$2 AND a.state='active' AND t.state='active' FOR SHARE OF a,t
    ) INSERT INTO session(id,account_id,token_hash,expires_at)
      SELECT $3,id,$4,$5 FROM active_account RETURNING id`, [account.id, account.password_hash, randomUUID(), session.digest, session.expiresAt]);
    return result.rowCount === 1;
  }
  async authenticate(digest: string) {
    return (await this.pool.query<Identity>(`SELECT a.id AS account_id,a.tenant_id FROM session s
      JOIN account a ON a.id=s.account_id JOIN tenant t ON t.id=a.tenant_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
      AND a.state='active' AND t.state='active'`, [digest])).rows[0] ?? null;
  }
  async revoke(digest: string) { await this.pool.query('UPDATE session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [digest]); }
  async mailbox(tenant: string, id: string) {
    return (await this.pool.query('SELECT id,label,state FROM mailbox WHERE tenant_id=$1 AND id=$2', [tenant, id])).rows[0] ?? null;
  }
  async charge(kind: 'register' | 'login', email: string, ip: string, now = new Date()) {
    const policies = kind === 'register' ? [{ key: `register:ip:${ip}`, seconds: 3600, limit: 5 }] : [
      { key: `login:email:${email}`, seconds: 900, limit: 5 }, { key: `login:ip:${ip}`, seconds: 60, limit: 10 }];
    const client = await this.pool.connect(); let retry = 0;
    try {
      await client.query('BEGIN');
      for (const policy of policies.sort((a,b) => a.key.localeCompare(b.key))) {
        const start = Math.floor(now.getTime() / (policy.seconds * 1000)) * policy.seconds * 1000;
        const result = await client.query<{attempts:number}>(`INSERT INTO auth_bucket(bucket_key,window_start,attempts) VALUES($1,$2,1)
          ON CONFLICT(bucket_key,window_start) DO UPDATE SET attempts=auth_bucket.attempts+1 RETURNING attempts`, [policy.key, new Date(start)]);
        if (result.rows[0]!.attempts > policy.limit) retry = Math.max(retry, Math.ceil((start + policy.seconds * 1000 - now.getTime()) / 1000));
      }
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    if (retry) throw new HttpError(429, 'rate_limited', retry);
  }
}
