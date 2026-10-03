import { visitorKey } from './client-address.js';
import type { Pool, PoolClient } from './pool.js';
import { moscowDay } from './quota.js';
import { withService } from './tenant.js';

/** Use inside the account-creation transaction. actingStudioId must come from trusted studio authentication,
 * never a registration body. F13 must reuse this resolver when creating a studio child. */
export async function resolveReferralBot(client: PoolClient, publicId: string | null,
  actingStudioId: string | null = null): Promise<string | null> {
  if (!publicId) return null;
  // Keep the source bot alive until account+session commit; a prior deletion simply produces no attribution.
  const source = (await client.query<{ id: string; account_id: string; parent_account_id: string | null }>(`
    SELECT b.id, b.account_id, a.parent_account_id FROM bot b JOIN account a ON a.id = b.account_id
    WHERE b.public_id = $1 FOR KEY SHARE OF b`, [publicId])).rows[0];
  if (!source || (actingStudioId && (source.account_id === actingStudioId
    || source.parent_account_id === actingStudioId))) return null;
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
