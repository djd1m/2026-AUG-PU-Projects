import type { AnswerBot } from './answers.js';
import type { Pool } from './pool.js';
import { withService } from './tenant.js';

export const DEMO_SLUG_RE = /^[A-Za-z0-9_-]{12,64}$/;
export interface DemoBot extends AnswerBot {
  readonly public_id: string;
  readonly name: string;
  readonly plan: unknown;
  readonly badge_removal: unknown;
}

/** Independent of widget origins: only an explicit published demo can resolve. */
export function readDemoBot(pool: Pool, slug: string): Promise<DemoBot | null> {
  if (!DEMO_SLUG_RE.test(slug)) return Promise.resolve(null);
  return withService(pool, async (c) => (await c.query<DemoBot>(`
    SELECT b.id, b.account_id AS "accountId", b.public_id, b.name, b.contact, a.plan, a.badge_removal
    FROM bot b JOIN account a ON a.id = b.account_id
    WHERE b.demo_slug = $1 AND b.published AND b.demo_enabled`, [slug])).rows[0] ?? null);
}
