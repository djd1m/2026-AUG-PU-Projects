import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { enqueuePdfSource, retryJob } from '@n6b/db';
import { ownerPool, runDate, servicePool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { FakeProvider } from '../../../../packages/rag/src/provider/fake';
import { createJobHandler } from '../../../../apps/web/src/server/jobs-handler';
import { pdfFixture } from '../fixtures/pdf';
import { acquireLease } from '../../src/lease';
import { createIndexRunner } from '../../src/index-runner';
import { runOnce } from '../../src/loop';
import { type JobContext, JobCeilingExceeded, JobLeaseLost } from '../../src/runner';
import { createPdfExtractor, extractPdf, PDF_INVALID, PDF_NO_TEXT, PDF_TOO_MANY_PAGES } from '../../src/pdf/extract';
import { readPdfFile, savePdfDocument, savePdfPages } from '../../src/pdf/store';
import { expireLease, isolateQueue, jobRow, seedBot } from './helpers';

const owner = ownerPool(); const app = servicePool(8); const cabinet = tenantPool(4);
afterAll(async () => { await Promise.all([owner.end(), app.end(), cabinet.end()]); });
beforeEach(async () => { await isolateQueue(owner); });
const FIRST = 'First page. Returns accepted within fourteen days with original packaging and receipt.';
const SECOND = 'Second page. Support is available Monday to Friday from nine until six.';
let day = 0;
function indexing(provider = new FakeProvider(), batchSize = 100) {
  const gateway = constructGateway({ pool: app, provider, now: () => runDate(++day), limits: {
    answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
    sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 } });
  const runner = createIndexRunner({ pool: app, gateway, batchSize, extractors: { pdf: createPdfExtractor({ pool: app }) } });
  return { provider, runner, run: () => runOnce({ pool: app, runner, log: () => {} }) };
}
async function seed(bytes = pdfFixture([FIRST, SECOND])) {
  const { accountId, botId } = await seedBot(owner);
  const source = await enqueuePdfSource(cabinet, accountId, botId, '<file>.pdf', bytes);
  if (!source || source === 'cap') throw new Error('Fixture upload refused');
  return { ...source, accountId, botId };
}
async function context(): Promise<JobContext> {
  await seed(); const job = (await acquireLease(app))!;
  return { job, signal: new AbortController().signal, checkpoint: async () => {}, progress: async () => {} };
}
const docs = async (sourceId: string) => (await owner.query(
  'SELECT id, locator_page, title, text, content_sha256 FROM document WHERE source_id=$1 ORDER BY locator_page', [sourceId])).rows;
const chunks = async (sourceId: string) => (await owner.query(
  'SELECT ch.id, ch.text_sha256 FROM chunk ch JOIN document d ON d.id=ch.document_id WHERE d.source_id=$1 ORDER BY ch.id', [sourceId])).rows;
async function api(accountId: string, jobId: string) {
  const token = 'a'.repeat(43);
  return createJobHandler({ tenantPool: cabinet, publicBaseUrl: 'https://cabinet.test', authenticate: async () => accountId })(
    new Request('https://cabinet.test', { headers: { cookie: `n6b_session=${token}` } }), jobId);
}

describe('SC-US-003-1/3 PDF -> real DB -> indexing -> job API', () => {
  it('PDF-04 two real pages have locator_page/title/text/hash and existing chunks', async () => {
    const s = await seed(); const f = indexing();
    expect(await f.run()).toMatchObject({ kind: 'finished', jobId: s.jobId, write: 'written', outcome: { state: 'succeeded' } });
    expect((await docs(s.sourceId)).map((d) => [d.locator_page, d.title, d.text])).toEqual([[1, '<file>.pdf', FIRST], [2, '<file>.pdf', SECOND]]);
    expect(await chunks(s.sourceId)).toHaveLength(2);
    expect((await owner.query('SELECT pages FROM source_file WHERE source_id=$1', [s.sourceId])).rows).toEqual([{ pages: 2 }]);
    expect(await (await api(s.accountId, s.jobId)).json()).toMatchObject({ data: { state: 'succeeded', fragments: 2, progress_done: 2, progress_total: 2 } });
    expect(f.provider.calls.embed).toBe(1);
  });
  it.each(['scan', '301', 'damaged'])('PDF-05 runOnce persists safe exact reason through DB/job API: %s', async (mode) => {
    const s = await seed(mode === 'scan' ? pdfFixture(['', ''], true) : mode === '301' ? pdfFixture(Array(301).fill('text'))
      : new Uint8Array(Buffer.from('%PDF-private parser information')));
    const f = indexing(); const reason = mode === 'scan' ? PDF_NO_TEXT : mode === '301' ? PDF_TOO_MANY_PAGES : PDF_INVALID;
    expect(await f.run()).toMatchObject({ kind: 'finished', jobId: s.jobId, write: 'written', outcome: { state: 'failed', error: reason } });
    expect(await jobRow(owner, s.jobId)).toMatchObject({ state: 'failed', error: reason });
    const result = await api(s.accountId, s.jobId); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ data: { job_id: s.jobId, state: 'failed', error: reason } });
    expect(await docs(s.sourceId)).toHaveLength(0); expect(f.provider.calls.embed).toBe(0);
    if (mode === '301') expect((await owner.query('SELECT pages FROM source_file WHERE source_id=$1', [s.sourceId])).rows[0].pages).toBeNull();
  });
  it('PDF-06 retry keeps document IDs/chunks and does not pay again for unchanged text', async () => {
    const s = await seed();
    // One page batch succeeds, next fails. Retry uses the accepted retryJob function and the same job ID.
    const f = indexing(new FakeProvider({ outcomes: ['ok', 'unavailable'] }), 1);
    expect(await f.run()).toMatchObject({ outcome: { state: 'failed' } });
    const before = await docs(s.sourceId); const kept = await chunks(s.sourceId); expect(kept).toHaveLength(1);
    expect(await retryJob(cabinet, s.accountId, s.jobId)).toBe('retried');
    const next = indexing(new FakeProvider(), 1);
    expect(await next.run()).toMatchObject({ jobId: s.jobId, outcome: { state: 'succeeded' } });
    expect(await docs(s.sourceId)).toEqual(before);
    const completed = await chunks(s.sourceId); expect(completed).toHaveLength(2);
    expect(completed).toEqual(expect.arrayContaining(kept)); expect(next.provider.calls.embed).toBe(1);
    // A later unchanged reindex has no model calls, and all IDs remain stable.
    await owner.query('INSERT INTO index_job (source_id, account_id) VALUES ($1,$2)', [s.sourceId, s.accountId]);
    const cached = indexing(); await cached.run(); expect(cached.provider.calls.embed).toBe(0);
    expect(await docs(s.sourceId)).toEqual(before); expect(await chunks(s.sourceId)).toEqual(completed);
  });
});

describe('PDF-06 owned file cardinality and shared fence writes', () => {
  it('exactly one owned source_file required; foreign source/account and duplicate files refuse', async () => {
    const ctx = await context(); const foreign = await seedBot(owner);
    await expect(readPdfFile(app, { ...ctx, job: { ...ctx.job, accountId: foreign.accountId } })).rejects.toThrow('exactly one');
    await owner.query('INSERT INTO source_file (source_id, account_id, bytes, sha256) VALUES ($1,$2,$3,$4)',
      [ctx.job.sourceId, ctx.job.accountId, Buffer.from('%PDF-extra'), 'h']);
    await expect(extractPdf(app, ctx)).rejects.toThrow('exactly one');
    expect(await docs(ctx.job.sourceId)).toHaveLength(0);
    await owner.query('DELETE FROM source_file WHERE source_id=$1', [ctx.job.sourceId]);
    await expect(readPdfFile(app, ctx)).rejects.toThrow('exactly one');
  });
  it.each(['stale fence', 'closed state'])('write guard: %s rejects both document and pages writes', async (mode) => {
    const ctx = await context(); const file = await readPdfFile(app, ctx);
    if (mode === 'stale fence') await owner.query('UPDATE index_job SET lease_fence=lease_fence+1 WHERE id=$1', [ctx.job.id]);
    else await owner.query("UPDATE index_job SET state='failed' WHERE id=$1", [ctx.job.id]);
    await expect(savePdfDocument(app, ctx, 1, 'old')).rejects.toBeInstanceOf(JobLeaseLost);
    await expect(savePdfPages(app, ctx, file.id, 2)).rejects.toBeInstanceOf(JobLeaseLost);
    expect(await docs(ctx.job.sourceId)).toHaveLength(0);
    expect((await owner.query('SELECT pages FROM source_file WHERE id=$1', [file.id])).rows[0].pages).toBeNull();
  });
  it('concurrent stale and renewed workers: only new fence writes; upsert retains document ID', async () => {
    const ctx = await context(); const file = await readPdfFile(app, ctx);
    await expireLease(owner, ctx.job.id); const job = (await acquireLease(app))!;
    const renewed = { ...ctx, job };
    const results = await Promise.allSettled([
      savePdfDocument(app, ctx, 1, 'old'), savePdfDocument(app, renewed, 1, 'new'),
      savePdfPages(app, ctx, file.id, 99), savePdfPages(app, renewed, file.id, 2)]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    const before = await docs(job.sourceId); expect(before[0].text).toBe('new');
    await savePdfDocument(app, renewed, 1, 'new'); expect(await docs(job.sourceId)).toEqual(before);
    expect((await owner.query('SELECT pages FROM source_file WHERE id=$1', [file.id])).rows[0].pages).toBe(2);
  });
  it.each([JobLeaseLost, JobCeilingExceeded])('checkpoint %s after page1 leaves page2 unwritten', async (ErrorType) => {
    const ctx = await context(); let checkpoints = 0;
    await expect(extractPdf(app, { ...ctx, checkpoint: async () => {
      checkpoints++;
      if ((await docs(ctx.job.sourceId)).length === 1) throw new ErrorType();
    } })).rejects.toBeInstanceOf(ErrorType);
    expect(checkpoints).toBeGreaterThan(1); expect(await docs(ctx.job.sourceId)).toHaveLength(1);
  });
  it('abort before file/pages/document operations writes nothing', async () => {
    const ctx = await context(); const controller = new AbortController(); controller.abort(new JobLeaseLost());
    const stopped = { ...ctx, signal: controller.signal };
    await expect(extractPdf(app, stopped)).rejects.toBeInstanceOf(JobLeaseLost);
    await expect(savePdfDocument(app, stopped, 1, 'x')).rejects.toBeInstanceOf(JobLeaseLost);
    expect(await docs(ctx.job.sourceId)).toHaveLength(0);
  });
});
