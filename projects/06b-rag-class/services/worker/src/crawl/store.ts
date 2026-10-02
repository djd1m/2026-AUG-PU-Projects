import { type Pool, withService } from '@n6b/db';
import { sha256 } from '@n6b/rag';
import { type JobContext, JobLeaseLost } from '../runner.js';

export async function saveDocument(pool: Pool, ctx: JobContext, url: string, title: string, text: string): Promise<void> {
  await ctx.checkpoint();
  ctx.signal.throwIfAborted();
  await withService(pool, async (c) => {
    const held = await c.query(`SELECT 1 FROM index_job WHERE id = $1 AND account_id = $2
      AND source_id = $3 AND lease_fence = $4 AND state = 'running' FOR SHARE`,
    [ctx.job.id, ctx.job.accountId, ctx.job.sourceId, ctx.job.fence]);
    if (held.rowCount !== 1) throw new JobLeaseLost();
    ctx.signal.throwIfAborted();
    await c.query(`INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source_id, locator_url) DO UPDATE
      SET title = EXCLUDED.title, text = EXCLUDED.text, content_sha256 = EXCLUDED.content_sha256
      WHERE document.account_id = EXCLUDED.account_id AND document.content_sha256 <> EXCLUDED.content_sha256`,
    [ctx.job.sourceId, ctx.job.accountId, url, title, text, sha256(text)]);
  });
}
