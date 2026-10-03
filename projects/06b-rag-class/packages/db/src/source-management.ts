import type { Pool } from './pool.js';
import { withTenant } from './tenant.js';
import type { Enqueued } from './jobs.js';

export type DeleteSourceResult = 'deleted' | 'not-found' | 'source-busy';
class SourceBusy extends Error {}

/** DELETE locks jobs through DELETE privilege; tenant intentionally has no job UPDATE/FOR UPDATE. */
export async function deleteSource(pool: Pool, accountId: string, sourceId: string): Promise<DeleteSourceResult> {
  try {
    return await withTenant(pool, accountId, async (c) => {
      // Enqueue/recrawl take FOR UPDATE, so this serializes job creation while allowing worker FK KEY SHARE.
      // A stronger source lock could deadlock a worker that holds its job FOR SHARE while saving a document.
      const source = await c.query('SELECT id FROM source WHERE id = $1 FOR NO KEY UPDATE', [sourceId]);
      if (source.rowCount !== 1) return 'not-found';
      // Reject existing live work before DELETE can wait on a failed retry while holding the live row.
      // This read is only an early exit: a retry can race it, so the RETURNING guard remains mandatory.
      const live = await c.query("SELECT id FROM index_job WHERE source_id = $1 AND state IN ('queued', 'running')", [sourceId]);
      if (live.rowCount) throw new SourceBusy();
      // RETURNING sees a concurrent failed→queued retry after waiting. Throw rolls back even tentative deletes.
      const jobs = await c.query<{ state: string }>('DELETE FROM index_job WHERE source_id = $1 RETURNING state', [sourceId]);
      if (jobs.rows.some((j) => j.state === 'queued' || j.state === 'running')) throw new SourceBusy();
      await c.query('DELETE FROM chunk WHERE document_id IN (SELECT id FROM document WHERE source_id = $1)', [sourceId]);
      await c.query('DELETE FROM document WHERE source_id = $1', [sourceId]);
      await c.query('DELETE FROM source_file WHERE source_id = $1', [sourceId]);
      await c.query('DELETE FROM source WHERE id = $1', [sourceId]);
      return 'deleted';
    });
  } catch (error) {
    if (error instanceof SourceBusy) return 'source-busy';
    throw error;
  }
}

/** No indexing occurs here; keep bytes and hashes for the worker's unchanged-chunk reuse. */
export function recrawlSource(pool: Pool, accountId: string, sourceId: string): Promise<Enqueued | null> {
  return withTenant(pool, accountId, async (c) => {
    const source = (await c.query<{ account_id: string }>(
      'SELECT account_id FROM source WHERE id = $1 FOR UPDATE', [sourceId])).rows[0];
    if (!source) return null;
    for (let round = 0; round < 3; round += 1) {
      const job = (await c.query<{ id: string }>(`INSERT INTO index_job (source_id, account_id) VALUES ($1, $2)
        ON CONFLICT (source_id) WHERE state IN ('queued', 'running') DO NOTHING RETURNING id`,
      [sourceId, source.account_id])).rows[0];
      if (job) return { jobId: job.id, sourceId, created: true };
      const live = (await c.query<{ id: string }>(
        "SELECT id FROM index_job WHERE source_id = $1 AND state IN ('queued', 'running')", [sourceId])).rows[0];
      if (live) return { jobId: live.id, sourceId, created: false };
    }
    throw new Error('source live job unavailable after conflict');
  });
}

export interface BotStats { readonly questions_7d: number; readonly dont_know_7d: number }
export function readBotStats(pool: Pool, accountId: string, botId: string): Promise<BotStats | null> {
  return withTenant(pool, accountId, async (c) => {
    const row = (await c.query<{ questions_7d: string; dont_know_7d: string }>(`
      SELECT count(q.id) AS questions_7d,
        count(q.id) FILTER (WHERE q.outcome IN ('below_threshold','model_unknown','invalid_citation')) AS dont_know_7d
      FROM bot b LEFT JOIN question_log q ON q.bot_id = b.id AND q.account_id = b.account_id
        AND q.channel IN ('widget','demo') AND q.created_at > now() - interval '7 days'
      WHERE b.id = $1 GROUP BY b.id`, [botId])).rows[0];
    return row ? { questions_7d: Number(row.questions_7d), dont_know_7d: Number(row.dont_know_7d) } : null;
  });
}
