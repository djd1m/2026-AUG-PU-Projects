import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { enqueuePdfSource, PDF_MAX_BYTES, type Pool } from '@n6b/db';
import { createSourceHandler } from '@/server/jobs-handler';
import { ownerPool, tenantPool } from '../../../../packages/db/tests/int/helpers';
import { seedBot } from '../../../../services/worker/tests/int/helpers';

const owner = ownerPool(); const cabinet = tenantPool(10);
afterAll(async () => { await Promise.all([owner.end(), cabinet.end()]); });
const BASE = 'https://cabinet.test'; const TOKEN = 'a'.repeat(43);
const bytes = Buffer.from('%PDF-1.7\n');
function handler(accountId: string) {
  return createSourceHandler({ tenantPool: cabinet, publicBaseUrl: BASE, log: () => {}, authenticate: async () => accountId });
}
function upload(data: Uint8Array, extra = false) {
  const form = new FormData(); form.append('file', new Blob([Buffer.from(data)]), '<unsafe>.pdf');
  if (extra) form.append('file', new Blob(['extra']), 'extra.pdf');
  return new Request(BASE, { method: 'POST', headers: { origin: BASE, cookie: `n6b_session=${TOKEN}` }, body: form });
}
async function cardinality(botId: string) {
  return (await owner.query(`SELECT (SELECT count(*)::int FROM source WHERE bot_id=$1) AS sources,
    (SELECT count(*)::int FROM source_file f JOIN source s ON s.id=f.source_id WHERE s.bot_id=$1) AS files,
    (SELECT count(*)::int FROM index_job j JOIN source s ON s.id=j.source_id WHERE s.bot_id=$1) AS jobs`, [botId])).rows[0];
}
describe('SC-US-003-1/2 PDF upload on real tenant DB', () => {
  it('PDF-01: 4MiB ->202, exactly one atomic source/file/queued job with SHA256', async () => {
    const { accountId, botId } = await seedBot(owner);
    const data = Buffer.alloc(4 * 1024 * 1024); data.write('%PDF-');
    const result = await handler(accountId)(upload(data), botId);
    expect(result.status).toBe(202); const jobId = (await result.json()).data.job_id;
    expect(await cardinality(botId)).toEqual({ sources: 1, files: 1, jobs: 1 });
    const rows = (await owner.query(`SELECT j.state, j.attempts, s.file_name, octet_length(f.bytes) AS size, f.sha256
      FROM index_job j JOIN source s ON s.id=j.source_id JOIN source_file f ON f.source_id=s.id WHERE j.id=$1`, [jobId])).rows;
    expect(rows).toEqual([{ state: 'queued', attempts: 0, file_name: '<unsafe>.pdf', size: data.length,
      sha256: createHash('sha256').update(data).digest('hex') }]);
  });
  it('PDF-01: a real SQL failure inserting job rolls back source and file', async () => {
    const { accountId, botId } = await seedBot(owner);
    // Keep the real tenant connection/transaction; replace only the final SQL with a NOT NULL violation.
    const broken = { connect: async () => {
      const c = await cabinet.connect();
      return { query: (sql: string, values?: unknown[]) => /INSERT INTO index_job/.test(sql)
        ? c.query('INSERT INTO index_job (source_id, account_id) VALUES (NULL, NULL)') : c.query(sql, values),
      release: () => c.release() };
    } } as unknown as Pool;
    await expect(enqueuePdfSource(broken, accountId, botId, 'x.pdf', bytes)).rejects.toThrow();
    expect(await cardinality(botId)).toEqual({ sources: 0, files: 0, jobs: 0 });
  });
  it('PDF-02: oversize/magic/duplicate and malformed multipart refuse without any records', async () => {
    const { accountId, botId } = await seedBot(owner); const post = handler(accountId);
    expect((await post(upload(Buffer.alloc(PDF_MAX_BYTES + 1)), botId)).status).toBe(413);
    expect((await post(upload(Buffer.from('not PDF')), botId)).status).toBe(415);
    expect((await post(upload(bytes, true), botId)).status).toBe(422);
    const malformed = new Request(BASE, { method: 'POST', body: 'broken', headers: { origin: BASE,
      cookie: `n6b_session=${TOKEN}`, 'content-type': 'multipart/form-data; boundary=x' } });
    expect((await post(malformed, botId)).status).toBe(422);
    expect(await cardinality(botId)).toEqual({ sources: 0, files: 0, jobs: 0 });
  });
  it('PDF-02: absent/underdeclared length streamed body cancels at cap with no source/file/job', async () => {
    const { accountId, botId } = await seedBot(owner);
    for (const declared of [null, '1']) {
      let cancelled = false; let reads = 0;
      const body = new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(Buffer.alloc(1024 * 1024)); },
        cancel() { cancelled = true; } }, { highWaterMark: 0 });
      const request = new Request(BASE, { method: 'POST', body, duplex: 'half', headers: { origin: BASE,
        cookie: `n6b_session=${TOKEN}`, 'content-type': 'multipart/form-data; boundary=x',
        ...(declared ? { 'content-length': declared } : {}) } } as RequestInit);
      expect((await handler(accountId)(request, botId)).status).toBe(413);
      expect(cancelled).toBe(true); expect(reads).toBe(11);
    }
    expect(await cardinality(botId)).toEqual({ sources: 0, files: 0, jobs: 0 });
  });
  it('PDF-03 cap: 10 concurrent requests at two Free PDFs accept exactly one; all others 409', async () => {
    const { accountId, botId } = await seedBot(owner);
    await enqueuePdfSource(cabinet, accountId, botId, '1.pdf', bytes);
    await enqueuePdfSource(cabinet, accountId, botId, '2.pdf', bytes);
    const post = handler(accountId);
    const codes = await Promise.all(Array.from({ length: 10 }, () => post(upload(bytes), botId).then((r) => r.status)));
    expect(codes.filter((code) => code === 202)).toHaveLength(1);
    expect(codes.filter((code) => code === 409)).toHaveLength(9);
    expect(await cardinality(botId)).toEqual({ sources: 3, files: 3, jobs: 3 });
  });
  it('PDF-03: unknown plan is Free; paid bot owner permits fourth PDF', async () => {
    const { accountId, botId } = await seedBot(owner);
    await owner.query("UPDATE account SET plan='PAID' WHERE id=$1", [accountId]);
    for (let i = 0; i < 3; i++) await enqueuePdfSource(cabinet, accountId, botId, 'x.pdf', bytes);
    expect(await enqueuePdfSource(cabinet, accountId, botId, 'x.pdf', bytes)).toBe('cap');
    await owner.query("UPDATE account SET plan='start' WHERE id=$1", [accountId]);
    expect(await enqueuePdfSource(cabinet, accountId, botId, 'x.pdf', bytes)).toHaveProperty('jobId');
  });
  it('PDF-03: foreign account/bot ->404 before reading upload; direct enqueue also rejects', async () => {
    const a = await seedBot(owner); const b = await seedBot(owner); let reads = 0;
    const body = new ReadableStream({ pull() { reads++; } }, { highWaterMark: 0 });
    const request = new Request(BASE, { method: 'POST', body, duplex: 'half', headers: { origin: BASE,
      cookie: `n6b_session=${TOKEN}`, 'content-type': 'multipart/form-data; boundary=x' } } as RequestInit);
    expect((await handler(a.accountId)(request, b.botId)).status).toBe(404); expect(reads).toBe(0);
    await request.body?.cancel();
    expect(await enqueuePdfSource(cabinet, a.accountId, b.botId, 'x.pdf', bytes)).toBeNull();
    expect(await cardinality(b.botId)).toEqual({ sources: 0, files: 0, jobs: 0 });
  });
});
