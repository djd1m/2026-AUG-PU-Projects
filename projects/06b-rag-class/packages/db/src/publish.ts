import type { Pool } from './pool.js';
import { withTenant } from './tenant.js';

export interface PublicationBot {
  readonly id: string;
  readonly public_id: string;
  readonly contact: string | null;
  readonly allowed_origins: string[];
  readonly published: boolean;
  readonly demo_enabled: boolean;
}

export interface PublishInput {
  readonly contact: string;
  readonly allowed_origins: readonly string[];
  readonly demo_enabled?: boolean;
}

/** Validated complete payload, one UPDATE under tenant RLS; the caller cannot replace public_id. */
export function publishBot(pool: Pool, accountId: string, botId: string, input: PublishInput): Promise<PublicationBot | null> {
  return withTenant(pool, accountId, async (c) => (await c.query<PublicationBot>(`
    UPDATE bot SET contact = $3, allowed_origins = $4::text[], published = true,
      demo_enabled = coalesce($5::boolean, demo_enabled)
    WHERE id = $1 AND account_id = $2
    RETURNING id, public_id, contact, allowed_origins, published, demo_enabled`,
  [botId, accountId, input.contact, input.allowed_origins, input.demo_enabled ?? null])).rows[0] ?? null);
}
