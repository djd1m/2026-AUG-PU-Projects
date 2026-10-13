import { visitorKey } from './client-address.js';
import type { Pool, PoolClient } from './pool.js';
import { moscowDay } from './quota.js';
import { withService } from './tenant.js';

/** Use inside account creation. actingStudioId comes only from the authenticated studio session.
 * F14 must lock affected account rows in the same UUID order before changing family membership. */
export async function resolveReferralBot(client: PoolClient, publicId: string | null,
  actingStudioId: string | null = null): Promise<string | null> {
  // Keep the source bot alive until account+session commit; a prior deletion simply produces no attribution.
  const source = publicId ? (await client.query<{ id: string; account_id: string }>(`
    SELECT b.id, b.account_id FROM bot b
    WHERE b.public_id = $1 FOR KEY SHARE OF b`, [publicId])).rows[0] : undefined;
  if (actingStudioId) {
    // Lock both accounts before the studio cap/eligibility check. Locking the studio first would
    // deadlock reciprocal referrals. NO KEY UPDATE remains compatible with child insertion FKs.
    await client.query(`SELECT id FROM account WHERE id = ANY($1::uuid[])
      ORDER BY id FOR NO KEY UPDATE`, [[actingStudioId, ...(source ? [source.account_id] : [])]]);
    if (!source || source.account_id === actingStudioId) return null;
    // A detach/attach may have committed while waiting: decide from a fresh, locked membership.
    const account = (await client.query<{ parent_account_id: string | null }>(
      'SELECT parent_account_id FROM account WHERE id = $1', [source.account_id])).rows[0];
    if (!account || account.parent_account_id === actingStudioId) return null;
  }
  if (!source) return null;
  return source.id;
}

/** Existence, not publication, is the canonical click gate. No trusted IP means redirect without a click. */
export function recordReferralClick(pool: Pool, publicId: string, secret: string, ip: string | null,
  at: Date): Promise<boolean> {
  return withService(pool, async (c) => {
    const botId = await resolveReferralBot(c, publicId);
    if (!botId) return false;
    if (ip) await c.query(`INSERT INTO badge_event (bot_id, kind, visitor_key, day)
      VALUES ($1, 'click', $2, $3)
      ON CONFLICT (bot_id, kind, visitor_key, day) WHERE kind = 'click' DO NOTHING`,
    [botId, visitorKey(secret, ip, botId), moscowDay(at)]);
    return true;
  });
}

/** Existing account row serializes all intents for this account, including concurrent requests. */
export function recordBadgeRemovalIntent(pool: Pool, accountId: string, at: Date): Promise<boolean | null> {
  return withService(pool, async (c) => {
    const account = await c.query('SELECT id FROM account WHERE id = $1 FOR UPDATE', [accountId]);
    if (!account.rowCount) return null;
    const inserted = await c.query(`INSERT INTO growth_event (account_id, kind, created_at)
      SELECT $1, 'badge_removal_intent', $2::timestamptz WHERE NOT EXISTS (
        SELECT 1 FROM growth_event WHERE account_id = $1 AND kind = 'badge_removal_intent'
          AND (created_at AT TIME ZONE 'Europe/Moscow')::date = $3::date) RETURNING id`,
    [accountId, at, moscowDay(at)]);
    return inserted.rowCount === 1;
  });
}
