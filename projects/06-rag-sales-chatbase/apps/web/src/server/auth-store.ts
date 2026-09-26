// из N5: projects/05-podcast-clips-opus/apps/web/src/server/auth-store.ts — колонка session.token_hash (Pseudocode), префикс /24 или /48
import type { Pool } from 'pg';
import { registerAccount } from '@n6/db';
import type { AccountCredentials, AuthStore, PartnerInput, SessionInput } from './auth';

export class PgAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}
  async findAccount(email: string) {
    const result = await this.pool.query<AccountCredentials>(
      'SELECT id, password_hash, status FROM account WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }
  // Одна транзакция: аккаунт → сессия → ApplyPartnerCode (partner-and-studio, packages/db/src/partners.ts). Конфликт email
  // не входит в существующий аккаунт и не выдаёт его занятость; явный неверный код — 'invalid_code', аккаунта нет.
  async register(email: string, passwordHash: string, session: SessionInput, partner?: PartnerInput): Promise<'ok' | 'invalid_code'> {
    return registerAccount(this.pool, { email, passwordHash, session, partner });
  }
  async createSession(account: AccountCredentials, session: SessionInput): Promise<boolean> {
    // Повторная проверка под блокировкой сериализуется с началом удаления аккаунта.
    const result = await this.pool.query(`WITH active_account AS (
      SELECT id FROM account WHERE id = $1 AND status = 'active' AND password_hash = $2 FOR SHARE
    ) INSERT INTO session (account_id, token_hash, ip_prefix, expires_at)
      SELECT id, $3, $4::cidr, $5 FROM active_account RETURNING id`,
    [account.id, account.password_hash, session.hash, session.ipPrefix, session.expiresAt]);
    return result.rowCount === 1;
  }
  async revoke(hash: string): Promise<void> {
    await this.pool.query('UPDATE session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hash]);
  }
  async findSession(hash: string) {
    const result = await this.pool.query<{ account_id: string }>(`SELECT s.account_id FROM session s
      JOIN account a ON a.id = s.account_id WHERE s.token_hash = $1
      AND s.revoked_at IS NULL AND s.expires_at > now() AND a.status = 'active'`, [hash]);
    return result.rows[0] ?? null;
  }
}
