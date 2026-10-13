import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recrawlSource, deleteSource, type Limits } from '@n6b/db';
import { ownerPool, servicePool, tenantPool, seedTenant, runDate } from '../../../../packages/db/tests/int/helpers';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { FakeProvider } from '../../../../packages/rag/src/provider/fake';
import { runOnce } from '../../src/loop';
import { createIndexRunner } from '../../src/index-runner';
import { saveDocument } from '../../src/crawl/store';
import { isolateQueue } from './helpers';
const owner = ownerPool(); const service = servicePool(); const tenant = tenantPool();
afterAll(async () => { await Promise.all([owner.end(), service.end(), tenant.end()]); });
beforeEach(async () => { await isolateQueue(owner); });
const limits: Limits = { answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
  sandboxGlobalDay: 2000, embedTokensAccountDay: 2000000, embedTokensGlobalDay: 20000000 };

describe('SRC-02/06 SC-US-017-2 recrawl through real worker/PG, fake model', () => {
  it('site and PDF: new handle, leased worker transitions, unchanged hashes reuse zero embeddings/quotas', async () => {
    for (const [i, kind] of (['site', 'pdf'] as const).entries()) {
      const a = await seedTenant(owner);
      if (kind === 'pdf') await owner.query("UPDATE source SET kind='pdf',url=NULL,file_name='original.pdf' WHERE id=$1", [a.sourceId]);
      const provider = new FakeProvider(); const at = runDate(180+i);
      const gateway = constructGateway({ pool: service, provider, limits, now: () => at });
      // Explicit extractor fixture: site persists unchanged document via guarded saveDocument; PDF uses stored document.
      // This is a worker/hash-reuse test, not a network crawl or live PDF parser/browser completion claim.
      const runner = createIndexRunner({ pool: service, gateway, extractors: {
        site: async (ctx) => { await saveDocument(service, ctx, 'https://example.test/a', 'A', 'text'); return null; },
        pdf: async () => null,
      } });
      expect(await runOnce({ pool: service, runner, log: () => undefined })).toMatchObject({ kind: 'finished', jobId: a.jobId,
        outcome: { state: 'succeeded' }, write: 'written' });
      expect(provider.calls.embed).toBe(1);
      const readChunks = () => owner.query(`SELECT c.id,c.text_sha256,c.embedding::text FROM chunk c
        JOIN document d ON d.id=c.document_id WHERE d.source_id=$1 ORDER BY c.id`, [a.sourceId]);
      const chunks = (await readChunks()).rows;
      const counters = (await owner.query('SELECT scope,day,used FROM quota_counter WHERE scope=$1', [`embed:account:${a.accountId}`])).rows;
      const next = await recrawlSource(tenant, a.accountId, a.sourceId); expect(next?.jobId).not.toBe(a.jobId);
      expect(await deleteSource(tenant, a.accountId, a.sourceId)).toBe('source-busy');
      expect(await runOnce({ pool: service, runner, log: () => undefined })).toMatchObject({ kind: 'finished', jobId: next!.jobId,
        outcome: { state: 'succeeded' }, write: 'written' });
      expect(provider.calls.embed).toBe(1); expect((await readChunks()).rows).toEqual(chunks);
      expect((await owner.query('SELECT scope,day,used FROM quota_counter WHERE scope=$1', [`embed:account:${a.accountId}`])).rows).toEqual(counters);
      expect((await owner.query('SELECT id FROM source_file WHERE source_id=$1', [a.sourceId])).rowCount).toBe(1);
      expect(await deleteSource(tenant, a.accountId, a.sourceId)).toBe('deleted');
    }
  });
});
