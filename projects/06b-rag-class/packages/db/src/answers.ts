import type { QUESTION_CHANNELS, QUESTION_OUTCOMES } from './enums.js';
import type { Pool } from './pool.js';
import { withService, withTenant } from './tenant.js';

export interface AnswerBot {
  readonly id: string;
  readonly accountId: string;
  readonly contact: string | null;
}

/** Ownership is resolved under tenant RLS before reserving any paid attempt. */
export function readAnswerBot(pool: Pool, accountId: string, botId: string): Promise<AnswerBot | null> {
  return withTenant(pool, accountId, async (c) => {
    const row = (await c.query<{ id: string; account_id: string; contact: string | null }>(
      'SELECT id, account_id, contact FROM bot WHERE id = $1 AND account_id = $2', [botId, accountId])).rows[0];
    return row ? { id: row.id, accountId: row.account_id, contact: row.contact } : null;
  });
}

export interface CitationDocument {
  readonly chunk_id: string;
  readonly title: string;
  readonly locator_url: string | null;
  readonly locator_page: number | null;
  readonly kind: 'site' | 'pdf';
  readonly file_name: string | null;
}

/** Both the chunk and its source must belong to this bot, even under BYPASSRLS. */
export function readCitationDocuments(pool: Pool, bot: AnswerBot, ids: readonly string[]): Promise<CitationDocument[]> {
  return withService(pool, async (c) => (await c.query<CitationDocument>(`
    SELECT c.id AS chunk_id, d.title, d.locator_url, d.locator_page, s.kind, s.file_name
    FROM chunk c
    JOIN document d ON d.id = c.document_id AND d.account_id = c.account_id
    JOIN source s ON s.id = d.source_id AND s.account_id = d.account_id
    WHERE c.bot_id = $1 AND c.account_id = $2 AND s.bot_id = $1 AND s.account_id = $2
      AND c.id = ANY($3::uuid[])`, [bot.id, bot.accountId, ids])).rows);
}

export interface QuestionAttempt {
  readonly bot: AnswerBot;
  readonly question: string;
  readonly channel: (typeof QUESTION_CHANNELS)[number];
  readonly outcome: (typeof QUESTION_OUTCOMES)[number];
  readonly citedIds: readonly string[];
  readonly visitorKey?: string;
  readonly originHost?: string;
}

/** Log, conditional marker, and event commit together. The row UPDATE serializes competing first answers. */
export function recordAnswerAttempt(pool: Pool, attempt: QuestionAttempt): Promise<boolean> {
  return withService(pool, async (c) => {
    const { bot, question, channel, outcome, citedIds } = attempt;
    await c.query(`INSERT INTO question_log
      (bot_id, account_id, channel, question, outcome, cited_chunk_ids, visitor_key, origin_host)
      VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)`,
    [bot.id, bot.accountId, channel, question, outcome, citedIds, attempt.visitorKey ?? null, attempt.originHost ?? null]);
    if (outcome !== 'answered' || citedIds.length === 0) return false;
    const changed = await c.query(`UPDATE bot SET first_cited_answer_at = now()
      WHERE id = $1 AND account_id = $2 AND first_cited_answer_at IS NULL RETURNING id`, [bot.id, bot.accountId]);
    if (changed.rowCount !== 1) return false;
    await c.query("INSERT INTO growth_event (account_id, kind) VALUES ($1, 'first_cited_answer')", [bot.accountId]);
    return true;
  });
}
