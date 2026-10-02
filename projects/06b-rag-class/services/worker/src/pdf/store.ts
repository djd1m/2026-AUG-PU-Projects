import { type Pool, type PoolClient, withService } from '@n6b/db';
import { sha256 } from '@n6b/rag';
import { type JobContext, JobLeaseLost } from '../runner.js';

async function fencedWrite(pool: Pool, ctx: JobContext, write: (c: PoolClient) => Promise<void>): Promise<void> {
  await ctx.checkpoint();
  ctx.signal.throwIfAborted();
  await withService(pool, async (c) => {
    const held = await c.query(`SELECT 1 FROM index_job WHERE id = $1 AND account_id = $2
      AND source_id = $3 AND lease_fence = $4 AND state = 'running' FOR SHARE`,
    [ctx.job.id, ctx.job.accountId, ctx.job.sourceId, ctx.job.fence]);
    if (held.rowCount !== 1) throw new JobLeaseLost();
    ctx.signal.throwIfAborted();
    await write(c);
  });
}

/** Service role bypasses RLS: every file read explicitly matches both source and owner. */
export async function readPdfFile(pool: Pool, ctx: JobContext): Promise<{ id: string; bytes: Uint8Array }> {
  await ctx.checkpoint();
  ctx.signal.throwIfAborted();
  return withService(pool, async (c) => {
    const rows = (await c.query<{ id: string; bytes: Buffer }>(
      'SELECT id, bytes FROM source_file WHERE source_id = $1 AND account_id = $2 LIMIT 2',
      [ctx.job.sourceId, ctx.job.accountId])).rows;
    if (rows.length !== 1) throw new Error('PDF source must have exactly one owned file');
    return { id: rows[0]!.id, bytes: new Uint8Array(rows[0]!.bytes) };
  });
}

export function savePdfPages(pool: Pool, ctx: JobContext, fileId: string, pages: number): Promise<void> {
  return fencedWrite(pool, ctx, async (c) => {
    const result = await c.query('UPDATE source_file SET pages = $4 WHERE id = $1 AND source_id = $2 AND account_id = $3',
      [fileId, ctx.job.sourceId, ctx.job.accountId, pages]);
    if (result.rowCount !== 1) throw new Error('Owned PDF file disappeared');
  });
}

export function savePdfDocument(pool: Pool, ctx: JobContext, page: number, text: string): Promise<void> {
  return fencedWrite(pool, ctx, async (c) => {
    await c.query(`INSERT INTO document (source_id, account_id, locator_page, title, text, content_sha256)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source_id, locator_page) DO UPDATE
      SET title = EXCLUDED.title, text = EXCLUDED.text, content_sha256 = EXCLUDED.content_sha256
      WHERE document.account_id = EXCLUDED.account_id AND document.content_sha256 <> EXCLUDED.content_sha256`,
    [ctx.job.sourceId, ctx.job.accountId, page, ctx.job.fileName ?? 'PDF', text, sha256(text)]);
  });
}
