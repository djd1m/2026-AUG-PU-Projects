import type { Pool, PoolClient } from './pool.js';
import { withService } from './tenant.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Account {
  id: string; kind: string; parent_account_id: string | null; studio_access: boolean;
  email: string | null; password_hash: string | null;
}
export interface HandoverSession { tokenHash: string; expiresAt: Date }
export type IssueHandoverResult = { expiresAt: Date } | 'forbidden';
export type AcceptHandoverResult = { accountId: string } | 'missing' | 'gone' | 'email-taken';
class HandoverExpired extends Error {}

async function lockAccounts(c: PoolClient, ids: readonly string[]) {
  await c.query('SELECT id FROM account WHERE id = ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE', [ids]);
  // A new statement sees the committed state after waiting under READ COMMITTED.
  return (await c.query<Account>(`SELECT id, kind, parent_account_id, studio_access, email, password_hash
    FROM account WHERE id = ANY($1::uuid[])`, [ids])).rows;
}
function eligible(child: Account | undefined, parent: Account | undefined): boolean {
  return !!child && !!parent && child.id !== parent.id && child.kind === 'owner'
    && child.parent_account_id === parent.id && child.studio_access
    && child.email === null && child.password_hash === null
    && parent.kind === 'studio' && parent.parent_account_id === null;
}

/** Only IDs cross the UI boundary; password hashes remain service-side. */
export function listHandoverCandidates(pool: Pool, actorId: string): Promise<string[]> {
  return withService(pool, async (c) => (await c.query<{ id: string }>(`SELECT child.id FROM account child
    JOIN account parent ON parent.id = child.parent_account_id
    WHERE parent.id = $1 AND parent.kind = 'studio' AND parent.parent_account_id IS NULL
    AND child.kind = 'owner' AND child.studio_access AND child.email IS NULL AND child.password_hash IS NULL`,
  [actorId])).rows.map((row) => row.id));
}

export function issueHandover(pool: Pool, actorId: string, childId: string, tokenHash: string): Promise<IssueHandoverResult> {
  if (!UUID.test(actorId) || !UUID.test(childId)) return Promise.resolve('forbidden');
  return withService(pool, async (c) => {
    const accounts = await lockAccounts(c, [actorId, childId]);
    if (!eligible(accounts.find((a) => a.id === childId.toLowerCase()),
      accounts.find((a) => a.id === actorId.toLowerCase()))) return 'forbidden';
    const row = (await c.query<{ expires_at: Date }>(`INSERT INTO handover_token (account_id, token_hash, expires_at)
      VALUES ($1, $2, clock_timestamp() + interval '7 days') RETURNING expires_at`, [childId, tokenHash])).rows[0]!;
    return { expiresAt: row.expires_at };
  });
}

/** Atomic claim; no plaintext password, bcrypt, HMAC or provider operation inside the transaction. */
export async function acceptHandover(pool: Pool, input: {
  tokenHash: string; email: string; passwordHash: string; keepStudioAccess: boolean; session: HandoverSession;
}): Promise<AcceptHandoverResult> {
  try {
    return await withService(pool, async (c): Promise<AcceptHandoverResult> => {
      const discovered = (await c.query<{ account_id: string }>(
        'SELECT account_id FROM handover_token WHERE token_hash = $1', [input.tokenHash])).rows[0];
      if (!discovered) return 'missing';
      const initial = (await c.query<{ parent_account_id: string | null }>(
        'SELECT parent_account_id FROM account WHERE id = $1', [discovered.account_id])).rows[0];
      const expectedParent = initial?.parent_account_id;
      const accounts = await lockAccounts(c, expectedParent ? [discovered.account_id, expectedParent] : [discovered.account_id]);
      const child = accounts.find((a) => a.id === discovered.account_id);
      const parent = accounts.find((a) => a.id === expectedParent);
      if (!eligible(child, parent)) return 'gone';
      await c.query('SELECT id FROM handover_token WHERE token_hash = $1 FOR UPDATE', [input.tokenHash]);
      const token = (await c.query<{ account_id: string; used_at: Date | null; valid: boolean }>(
        `SELECT account_id, used_at, expires_at > clock_timestamp() AS valid
         FROM handover_token WHERE token_hash = $1`, [input.tokenHash])).rows[0];
      if (!token) return 'missing';
      if (token.account_id !== child!.id || token.used_at !== null || !token.valid) return 'gone';
      await c.query(`UPDATE account SET email = $2, password_hash = $3, studio_access = $4,
        parent_account_id = CASE WHEN $4 THEN parent_account_id ELSE NULL END WHERE id = $1`,
      [child!.id, input.email, input.passwordHash, input.keepStudioAccess]);
      await c.query('INSERT INTO session (account_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [child!.id, input.session.tokenHash, input.session.expiresAt]);
      // Must be the final write: unique-email/session writes may have waited past expiry.
      const consumed = await c.query(`UPDATE handover_token SET used_at = clock_timestamp()
        WHERE token_hash = $1 AND account_id = $2 AND used_at IS NULL AND expires_at > clock_timestamp()
        RETURNING id`, [input.tokenHash, child!.id]);
      if (consumed.rowCount !== 1) throw new HandoverExpired();
      return { accountId: child!.id };
    });
  } catch (error) {
    if (error instanceof HandoverExpired) return 'gone';
    const pgError = error as { code?: string; constraint?: string };
    if (pgError.code === '23505' && pgError.constraint === 'account_email_key') return 'email-taken';
    throw error;
  }
}
