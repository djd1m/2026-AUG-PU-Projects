import type { Pool } from './pool.js';
import type { PublicationBot } from './publish.js';
import { withTenant } from './tenant.js';

export interface CabinetBot extends PublicationBot {
  readonly name: string;
  readonly first_site_url: string | null;
}

export function listCabinetBots(pool: Pool, accountId: string): Promise<CabinetBot[]> {
  return withTenant(pool, accountId, async (c) => (await c.query<CabinetBot>(`
    SELECT b.id, b.name, b.public_id, b.contact, b.allowed_origins, b.published, b.demo_enabled,
      CASE WHEN b.published AND b.demo_enabled THEN b.demo_slug ELSE NULL END AS demo_slug,
      (SELECT s.url FROM source s WHERE s.bot_id = b.id AND s.account_id = b.account_id AND s.kind = 'site'
       ORDER BY s.created_at, s.id LIMIT 1) AS first_site_url
    FROM bot b ORDER BY b.created_at, b.id`)).rows);
}
