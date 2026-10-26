import type { Pool } from 'pg';
import type { BillingMode } from '@clipmaker/shared/config';
import { transaction, grantTrialTx } from '@clipmaker/db';
import type { AccountCredentials, AuthStore, SessionInput } from './auth';

export class PgAuthStore implements AuthStore {
  constructor(private readonly pool: Pool, private readonly billingMode: BillingMode = 'legacy') {}
  async findAccount(email: string) {
    const result = await this.pool.query<AccountCredentials>(
      'SELECT id, password_hash, status FROM account WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }
  async register(email: string, passwordHash: string, session: SessionInput): Promise<void> {
    await transaction(this.pool, async tx => {
      const policy = this.billingMode === 'credits_v1' ? 'credits_v1' : 'legacy_daily_v1';
      const row = (await tx.query<{ id: string }>(`INSERT INTO account(email,password_hash,plan,status,billing_policy)
        VALUES ($1,$2,'free','active',$3) ON CONFLICT(email) DO NOTHING RETURNING id`, [email,passwordHash,policy])).rows[0];
      if (!row) return;
      if (policy === 'credits_v1') await grantTrialTx(tx,row.id,'signup');
      await tx.query(`INSERT INTO session(account_id,cookie_token_hash,ip_prefix,expires_at) VALUES($1,$2,$3::cidr,$4)`,
        [row.id,session.hash,session.ipPrefix,session.expiresAt]);
    });
  }
  async createSession(account: AccountCredentials, session: SessionInput): Promise<boolean> {
    // Повторная проверка под блокировкой сериализуется с началом удаления аккаунта.
    const result = await this.pool.query(`WITH active_account AS (
      SELECT id FROM account WHERE id = $1 AND status = 'active' AND password_hash = $2 FOR SHARE
    ) INSERT INTO session (account_id, cookie_token_hash, ip_prefix, expires_at)
      SELECT id, $3, $4::cidr, $5 FROM active_account RETURNING id`,
    [account.id, account.password_hash, session.hash, session.ipPrefix, session.expiresAt]);
    return result.rowCount === 1;
  }
  async revoke(hash: string): Promise<void> {
    await this.pool.query('UPDATE session SET revoked_at = now() WHERE cookie_token_hash = $1 AND revoked_at IS NULL', [hash]);
  }
  async findSession(hash: string) {
    const result = await this.pool.query<{ account_id: string }>(`SELECT s.account_id FROM session s
      JOIN account a ON a.id = s.account_id WHERE s.cookie_token_hash = $1
      AND s.revoked_at IS NULL AND s.expires_at > now() AND a.status = 'active'`, [hash]);
    return result.rows[0] ?? null;
  }
}
