import type { Pool } from './pool.js';
import { resolveReferralBot } from './referral.js';
import { withService, withTenant } from './tenant.js';

export type StudioClientResult = { readonly accountId: string } | 'forbidden' | 'cap';

/** Service insertion is authorized by the session actor, rechecked under the studio row lock.
 * No credentials or session are created for the child. All subsequent work uses actor tenant RLS. */
export function createStudioClient(pool: Pool, actorId: string, referral: string | null): Promise<StudioClientResult> {
  return withService(pool, async (c) => {
    const referredBy = await resolveReferralBot(c, referral, actorId);
    const studio = (await c.query<{ kind: string; parent_account_id: string | null }>(
      'SELECT kind, parent_account_id FROM account WHERE id = $1 FOR NO KEY UPDATE', [actorId])).rows[0];
    if (!studio || studio.kind !== 'studio' || studio.parent_account_id !== null) return 'forbidden';
    const count = (await c.query<{ n: string }>(
      'SELECT count(*) AS n FROM account WHERE parent_account_id = $1', [actorId])).rows[0]!;
    if (Number(count.n) >= 5) return 'cap';
    const child = (await c.query<{ id: string }>(`INSERT INTO account
      (kind, plan, email, password_hash, parent_account_id, studio_access, referred_by_bot_id)
      VALUES ('owner', 'free', NULL, NULL, $1, true, $2) RETURNING id`, [actorId, referredBy])).rows[0]!;
    return { accountId: child.id };
  });
}

export interface CabinetAccount {
  readonly id: string;
  readonly email: string | null;
  readonly kind: string;
  readonly plan: string;
  readonly parent_account_id: string | null;
}

/** targetId is an untrusted selector; neither it nor child credentials become the RLS actor. */
export function readCabinetContext(pool: Pool, actorId: string, targetId = actorId): Promise<{
  actor: CabinetAccount; selected: CabinetAccount; clients: CabinetAccount[];
} | null> {
  return withTenant(pool, actorId, async (c) => {
    const accounts = (await c.query<CabinetAccount>(`SELECT id, email, kind, plan, parent_account_id
      FROM account ORDER BY created_at, id`)).rows;
    const actor = accounts.find((account) => account.id === actorId);
    const selected = accounts.find((account) => account.id === targetId);
    if (!actor || !selected) return null;
    return { actor, selected, clients: accounts.filter((account) => account.parent_account_id === actorId) };
  });
}
