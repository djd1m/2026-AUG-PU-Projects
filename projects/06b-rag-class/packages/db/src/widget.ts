import type { AnswerBot } from './answers.js';
import type { Pool } from './pool.js';
import { withService } from './tenant.js';
import { moscowDay } from './quota.js';

export interface WidgetBot extends AnswerBot {
  readonly public_id: string;
  readonly name: string;
  readonly allowed_origins: readonly string[];
  readonly plan: unknown;
  readonly badge_removal: unknown;
  readonly metric_eligible: boolean;
}

/** Public lookup never accepts client account IDs. The join resolves the actual owning account. */
export function readWidgetBot(pool: Pool, publicId: string): Promise<WidgetBot | null> {
  return withService(pool, async (c) => (await c.query<WidgetBot>(`
    SELECT b.id, b.account_id AS "accountId", b.public_id, b.name, b.contact, b.allowed_origins,
      a.plan, a.badge_removal, (NOT a.is_test AND NOT EXISTS
        (SELECT 1 FROM operator o WHERE o.account_id = a.id)) AS metric_eligible
    FROM bot b JOIN account a ON a.id = b.account_id
    WHERE b.public_id = $1 AND b.published`, [publicId])).rows[0] ?? null);
}

export function recordWidgetConfig(pool: Pool, bot: WidgetBot, host: string, page: string): Promise<void> {
  return withService(pool, async (c) => {
    await c.query(`INSERT INTO widget_install (bot_id, origin_host, page_url, config_seen_at)
      SELECT b.id, $3, $4, now() FROM bot b JOIN account a ON a.id = b.account_id
      WHERE b.id = $1 AND b.account_id = $2 AND NOT a.is_test
        AND NOT EXISTS (SELECT 1 FROM operator o WHERE o.account_id = a.id)
      ON CONFLICT (bot_id, origin_host) DO NOTHING`, [bot.id, bot.accountId, host, page]);
  });
}

export function recordWidgetQuestion(pool: Pool, bot: WidgetBot, host: string): Promise<void> {
  return withService(pool, async (c) => {
    await c.query(`UPDATE widget_install w SET first_question_at = now()
      FROM bot b JOIN account a ON a.id = b.account_id
      WHERE w.bot_id = b.id AND b.id = $1 AND b.account_id = $2 AND w.origin_host = $3
        AND w.config_seen_at IS NOT NULL AND w.first_question_at IS NULL AND NOT a.is_test
        AND NOT EXISTS (SELECT 1 FROM operator o WHERE o.account_id = a.id)`, [bot.id, bot.accountId, host]);
  });
}

export function recordWidgetEvent(pool: Pool, bot: WidgetBot, kind: 'impression' | 'tamper', key: string,
  at: Date): Promise<void> {
  return withService(pool, async (c) => {
    await c.query(`INSERT INTO badge_event (bot_id, kind, visitor_key, day)
      SELECT id, $3, $4, $5 FROM bot WHERE id = $1 AND account_id = $2`,
    [bot.id, bot.accountId, kind, key, moscowDay(at)]);
  });
}
