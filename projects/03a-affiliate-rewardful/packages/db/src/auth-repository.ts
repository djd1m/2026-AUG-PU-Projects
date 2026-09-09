import type { Pool } from 'pg';

export interface IdentityContext {
  user_id: string;
  session_id: string;
  expires_at: Date;
}
export interface UserSnapshot {
  id: string;
  password_hash: string;
  enabled: boolean;
}
export interface IdentityRepository {
  findUser(identityHash: Buffer): Promise<UserSnapshot | null>;
  issueSessionIfCurrent(userId: string, passwordHash: string, tokenHash: Buffer): Promise<IdentityContext | null>;
  resolveSession(tokenHash: Buffer): Promise<IdentityContext | null>;
  revokeSession(tokenHash: Buffer): Promise<void>;
}
export class DatabaseUnavailableError extends Error {
  constructor() { super('unavailable'); this.name = 'DatabaseUnavailableError'; }
}
export function isHash32(value: unknown): value is Buffer {
  return Buffer.isBuffer(value) && value.length === 32;
}
function requireHash32(value: unknown): asserts value is Buffer {
  if (!isHash32(value)) throw new Error('invalid_input');
}

export class AuthRepository implements IdentityRepository {
  constructor(private readonly pool: Pool, private readonly clock?: () => Date) {}

  async findUser(identityHash: Buffer): Promise<UserSnapshot | null> {
    requireHash32(identityHash);
    try {
      // pool.query releases its client before this Promise resolves: no KDF lease.
      const result = await this.pool.query<UserSnapshot>(
        'SELECT id, password_hash, enabled FROM n3a.users WHERE identity_hash = $1',
        [identityHash],
      );
      return result.rows[0] ?? null;
    } catch { throw new DatabaseUnavailableError(); }
  }

  async issueSessionIfCurrent(userId: string, passwordHash: string, tokenHash: Buffer): Promise<IdentityContext | null> {
    requireHash32(tokenHash);
    try {
      // A single statement is an implicit transaction; completion means COMMIT.
      const result = await this.pool.query<IdentityContext>(
        'SELECT * FROM n3a.issue_session_if_current($1::uuid, $2::text, $3::bytea)',
        [userId, passwordHash, tokenHash],
      );
      return result.rows[0] ?? null;
    } catch { throw new DatabaseUnavailableError(); }
  }

  async resolveSession(tokenHash: Buffer): Promise<IdentityContext | null> {
    requireHash32(tokenHash);
    try {
      const result = await this.pool.query<IdentityContext>(
        `SELECT s.user_id, s.id AS session_id, s.expires_at
         FROM n3a.sessions AS s JOIN n3a.users AS u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > COALESCE($2::timestamptz, statement_timestamp()) AND u.enabled`,
        [tokenHash, this.clock?.() ?? null],
      );
      return result.rows[0] ?? null;
    } catch { throw new DatabaseUnavailableError(); }
  }

  async revokeSession(tokenHash: Buffer): Promise<void> {
    requireHash32(tokenHash);
    try {
      await this.pool.query(
        `UPDATE n3a.sessions SET revoked_at = GREATEST(created_at, statement_timestamp())
         WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash],
      );
    } catch { throw new DatabaseUnavailableError(); }
  }
}
