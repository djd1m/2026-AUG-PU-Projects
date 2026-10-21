// Хранилище аутентификации на Postgres — перенос N5 apps/web/src/server/auth-store.ts (#24), адаптирован под схему
// N6b (account/session, частичный уникальный индекс lower(email)). Роль n6b_service: вход идёт без контекста аккаунта,
// поэтому каждый запрос фильтрует по e-mail или хэшу токена явно.

import { type AccountKind, type Pool, resolveReferralBot, withService } from '@n6b/db';
import type { AccountCredentials, AuthStore, NewSession } from './auth';

export class PgAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  findAccount(email: string): Promise<AccountCredentials | null> {
    return withService(this.pool, async (c) => {
      const r = await c.query<AccountCredentials>(
        'SELECT id, password_hash FROM account WHERE lower(email) = lower($1)', [email]);
      return r.rows[0] ?? null;
    });
  }

  register(email: string, passwordHash: string, kind: AccountKind, session: NewSession,
    referral: string | null = null): Promise<boolean> {
    // Один оператор: аккаунт и сессия создаются вместе; занятый e-mail не создаёт ни того, ни другого.
    return withService(this.pool, async (c) => {
      const sourceBotId = await resolveReferralBot(c, referral);
      const r = await c.query(`WITH registered AS (
          INSERT INTO account (email, password_hash, kind, plan, referred_by_bot_id)
          VALUES (lower($1), $2, $3, 'free', $6)
          ON CONFLICT ((lower(email))) WHERE email IS NOT NULL DO NOTHING RETURNING id)
        INSERT INTO session (account_id, token_hash, expires_at)
        SELECT id, $4, $5 FROM registered RETURNING account_id`,
      [email, passwordHash, kind, session.tokenHash, session.expiresAt, sourceBotId]);
      return r.rowCount === 1;
    });
  }

  async createSession(accountId: string, session: NewSession): Promise<void> {
    await withService(this.pool, (c) => c.query(
      'INSERT INTO session (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [accountId, session.tokenHash, session.expiresAt]));
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await withService(this.pool, (c) => c.query('DELETE FROM session WHERE token_hash = $1', [tokenHash]));
  }

  findSession(tokenHash: string): Promise<{ account_id: string } | null> {
    return withService(this.pool, async (c) => {
      const r = await c.query<{ account_id: string }>(
        'SELECT account_id FROM session WHERE token_hash = $1 AND expires_at > now()', [tokenHash]);
      return r.rows[0] ?? null;
    });
  }
}
