import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { deleteSource, readBotStats, recrawlSource } from '../../src/source-management';
import { enqueueSiteSource, listCabinetSources, retryJob } from '../../src/jobs';
import { acceptHandover, issueHandover } from '../../src/handover';
import { withTenant } from '../../src/tenant';
import { searchChunks } from '../../../rag/src/search';
import { createSourceManagementHandler } from '../../../../apps/web/src/server/source-management-handler';
import { ownerPool, tenantPool, servicePool, seedTenant, vector, uniq, type Tenant } from './helpers';
const owner = ownerPool(); const tenant = tenantPool(8); const service = servicePool();
afterAll(async () => { await Promise.all([owner.end(), tenant.end(), service.end()]); });
const terminal = async (a: Tenant) => owner.query("UPDATE index_job SET state = 'failed' WHERE id = $1", [a.jobId]);
const snapshot = async (a: Tenant) => {
  const r = await owner.query(`SELECT
    (SELECT count(*)::int FROM source WHERE id=$1) AS sources,
    (SELECT count(*)::int FROM source_file WHERE source_id=$1) AS files,
    (SELECT count(*)::int FROM document WHERE source_id=$1) AS documents,
    (SELECT count(*)::int FROM chunk WHERE document_id=$2) AS chunks,
    (SELECT count(*)::int FROM index_job WHERE source_id=$1) AS jobs`, [a.sourceId, a.documentId]);
  return r.rows[0];
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
/** Test-only barrier around real PostgreSQL statements; no SQL result is mocked. */
function intercepted(after: (sql: string, c: pg.PoolClient) => Promise<void>): pg.Pool {
  return new Proxy(tenant, { get(pool, key) {
    if (key === 'connect') return async () => {
      const c = await pool.connect();
      return new Proxy(c, { get(client, prop) {
        if (prop === 'query') return async (sql: string, values?: unknown[]) => {
          const result = await client.query(sql, values); await after(sql, client); return result;
        };
        const value = Reflect.get(client, prop); return typeof value === 'function' ? value.bind(client) : value;
      } });
    };
    const value = Reflect.get(pool, key); return typeof value === 'function' ? value.bind(pool) : value;
  } });
}
async function waitForLock(sqlPattern: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await owner.query(`SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid()
      AND state = 'active' AND wait_event_type = 'Lock' AND query LIKE $1`, [sqlPattern]);
    if (r.rowCount) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('expected PostgreSQL lock wait was not observed');
}

describe('SRC-01/06 atomic source deletion under tenant privileges', () => {
  it('SC-US-017-1 removes complete chain and real retrieval; other source/bot/tenant unchanged', async () => {
    const a = await seedTenant(owner); const b = await seedTenant(owner);
    await terminal(a);
    const extra = (await owner.query<{ id: string }>(`INSERT INTO source (bot_id,account_id,kind,url)
      VALUES ($1,$2,'site','https://other-source.test') RETURNING id`, [a.botId, a.accountId])).rows[0]!.id;
    const beforeB = await snapshot(b);
    const v = JSON.parse(vector()) as number[];
    expect((await searchChunks(service, a.botId, v)).map((r) => r.id)).toContain(a.chunkId);
    expect(await deleteSource(tenant, a.accountId, a.sourceId)).toBe('deleted');
    expect(await snapshot(a)).toEqual({ sources: 0, files: 0, documents: 0, chunks: 0, jobs: 0 });
    expect(await searchChunks(service, a.botId, v)).toEqual([]);
    expect(await snapshot(b)).toEqual(beforeB);
    expect((await owner.query('SELECT id FROM source WHERE id=$1', [extra])).rowCount).toBe(1);
    expect((await owner.query('SELECT id FROM bot WHERE id=$1', [a.botId])).rowCount).toBe(1);
    expect(await deleteSource(tenant, a.accountId, a.sourceId)).toBe('not-found');
    expect(await deleteSource(tenant, a.accountId, b.sourceId)).toBe('not-found');
  });
  it('queued/running return busy and rollback ALL tentative job deletes', async () => {
    for (const state of ['queued', 'running']) {
      const a = await seedTenant(owner);
      await owner.query('UPDATE index_job SET state=$2 WHERE id=$1', [a.jobId, state]);
      await owner.query("INSERT INTO index_job(source_id,account_id,state) VALUES ($1,$2,'failed')", [a.sourceId, a.accountId]);
      const before = await snapshot(a);
      expect(await deleteSource(tenant, a.accountId, a.sourceId)).toBe('source-busy');
      expect(await snapshot(a)).toEqual(before);
      const response = await createSourceManagementHandler('delete', { tenantPool: tenant,
        publicBaseUrl: 'https://cabinet.test', authenticate: async () => a.accountId, log: () => undefined })(
        new Request('https://cabinet.test/api/sources/'+a.sourceId, { method: 'DELETE',
          headers: { origin: 'https://cabinet.test', cookie: `n6b_session=${'a'.repeat(43)}` } }), a.sourceId);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: { code: 'source_busy', message: 'дождитесь окончания индексации' } });
      expect(await snapshot(a)).toEqual(before);
      expect((await owner.query('SELECT state FROM index_job WHERE id=$1', [a.jobId])).rows[0].state).toBe(state);
    }
  });
  it('worker holds job FOR SHARE then saves document: source lock permits FK check, no deadlock and atomic busy', async () => {
    const a = await seedTenant(owner);
    await owner.query("UPDATE index_job SET state='running' WHERE id=$1", [a.jobId]);
    const writer = await service.connect(); let deletion: Promise<unknown> | undefined;
    try {
      await writer.query('BEGIN'); await writer.query('SET LOCAL ROLE n6b_service');
      await writer.query('SELECT id FROM index_job WHERE id=$1 FOR SHARE', [a.jobId]);
      deletion = deleteSource(tenant, a.accountId, a.sourceId);
      await waitForLock('DELETE FROM index_job WHERE source_id%');
      await writer.query("SET LOCAL statement_timeout='3s'");
      await writer.query(`INSERT INTO document(source_id,account_id,locator_url,title,text,content_sha256)
        VALUES($1,$2,'https://example.test/worker','worker','worker text','worker hash')`, [a.sourceId,a.accountId]);
      await writer.query('COMMIT');
      expect(await deletion).toBe('source-busy');
      expect(await snapshot(a)).toEqual({ sources: 1, files: 1, documents: 2, chunks: 1, jobs: 1 });
    } finally { await writer.query('ROLLBACK'); writer.release(); if (deletion) await deletion; }
  });
  it('failure after child deletion rolls back source, file, document, chunks and jobs', async () => {
    const a = await seedTenant(owner); await terminal(a); const before = await snapshot(a);
    const failing = intercepted(async (sql) => { if (sql.startsWith('DELETE FROM document')) throw new Error('injected rollback'); });
    await expect(deleteSource(failing, a.accountId, a.sourceId)).rejects.toThrow('injected rollback');
    expect(await snapshot(a)).toEqual(before);
  });
  it('retry wins existing failed job lock: DELETE waits, sees queued, returns409-equivalent with no partial effects', async () => {
    const a = await seedTenant(owner); await terminal(a); const before = await snapshot(a);
    const retry = await tenant.connect(); let deletion: Promise<unknown> | undefined;
    try {
      await retry.query('BEGIN'); await retry.query('SET LOCAL ROLE n6b_tenant');
      await retry.query("SELECT set_config('app.account_id',$1,true)", [a.accountId]);
      expect((await retry.query('SELECT n6b_retry_job($1) AS result', [a.jobId])).rows[0].result).toBe('retried');
      deletion = deleteSource(tenant, a.accountId, a.sourceId);
      await waitForLock('DELETE FROM index_job WHERE source_id%');
      await retry.query('COMMIT');
      expect(await deletion).toBe('source-busy'); expect(await snapshot(a)).toEqual(before);
      expect((await owner.query('SELECT state FROM index_job WHERE id=$1', [a.jobId])).rows[0].state).toBe('queued');
    } finally { await retry.query('ROLLBACK'); retry.release(); if (deletion) await deletion; }
  });
  it('delete wins job row lock: old failed retry waits and becomes not-found', async () => {
    const a = await seedTenant(owner); await terminal(a);
    const entered = deferred(); const release = deferred();
    const deleting = intercepted(async (sql) => { if (sql.startsWith('DELETE FROM index_job')) { entered.resolve(); await release.promise; } });
    const deletion = deleteSource(deleting, a.accountId, a.sourceId); await entered.promise;
    const retry = retryJob(tenant, a.accountId, a.jobId);
    try { await waitForLock('SELECT n6b_retry_job%'); } finally { release.resolve(); }
    expect(await deletion).toBe('deleted'); expect(await retry).toBe('not-found');
  });
  it('delete wins source lock: new recrawl waits then404; no orphan/FK error', async () => {
    const a = await seedTenant(owner); await terminal(a);
    const entered = deferred(); const release = deferred();
    const deleting = intercepted(async (sql) => { if (sql.startsWith('SELECT id FROM source')) { entered.resolve(); await release.promise; } });
    const deletion = deleteSource(deleting, a.accountId, a.sourceId); await entered.promise;
    const recrawl = recrawlSource(tenant, a.accountId, a.sourceId);
    try { await waitForLock('SELECT account_id FROM source%'); } finally { release.resolve(); }
    expect(await deletion).toBe('deleted'); expect(await recrawl).toBeNull();
    expect(await snapshot(a)).toEqual({ sources: 0, files: 0, documents: 0, chunks: 0, jobs: 0 });
  });
  it('recrawl wins source lock: deletion waits, then busy and preserves new live job', async () => {
    const a = await seedTenant(owner); await terminal(a);
    const entered = deferred(); const release = deferred();
    const crawling = intercepted(async (sql) => { if (sql.includes('RETURNING id') && sql.startsWith('INSERT INTO index_job')) {
      entered.resolve(); await release.promise;
    } });
    const recrawl = recrawlSource(crawling, a.accountId, a.sourceId); await entered.promise;
    const deletion = deleteSource(tenant, a.accountId, a.sourceId);
    try { await waitForLock('SELECT id FROM source%'); } finally { release.resolve(); }
    const newJob = await recrawl; expect(newJob?.created).toBe(true); expect(await deletion).toBe('source-busy');
    expect((await snapshot(a)).jobs).toBe(2);
  });
  it('existing enqueueSiteSource waits for source deletion then linearizes safely', async () => {
    const a = await seedTenant(owner); await terminal(a);
    const entered = deferred(); const release = deferred();
    const deleting = intercepted(async (sql) => { if (sql.startsWith('SELECT id FROM source')) { entered.resolve(); await release.promise; } });
    const deletion = deleteSource(deleting, a.accountId, a.sourceId); await entered.promise;
    const enqueue = enqueueSiteSource(tenant, a.accountId, a.botId, 'https://example.test');
    try { await waitForLock('%source%'); } finally { release.resolve(); }
    expect(await deletion).toBe('deleted');
    const accepted = await enqueue;
    // ON CONFLICT may choose the old row then SELECT misses it, or insert a fresh source after DELETE commits.
    if (accepted) expect(accepted.sourceId).not.toBe(a.sourceId);
    expect((await owner.query('SELECT id FROM source WHERE id=$1', [a.sourceId])).rowCount).toBe(0);
  });
});

describe('SRC-02/03/04/06 recrawl, latest task, ownership and two-number statistics', () => {
  it('site/PDF recrawl preserves source/file/docs/chunks; concurrent202 share one new defaults job', async () => {
    for (const kind of ['site', 'pdf']) {
      const a = await seedTenant(owner); await terminal(a);
      if (kind === 'pdf') await owner.query("UPDATE source SET kind='pdf',url=NULL,file_name='original.pdf' WHERE id=$1", [a.sourceId]);
      await owner.query('UPDATE index_job SET attempts=3,progress_done=42,progress_total=50 WHERE id=$1', [a.jobId]);
      const jobs = await Promise.all(Array.from({ length: 6 }, () => recrawlSource(tenant, a.accountId, a.sourceId)));
      expect(new Set(jobs.map((j) => j?.jobId)).size).toBe(1); expect(jobs.filter((j) => j?.created).length).toBe(1);
      expect(jobs[0]?.jobId).not.toBe(a.jobId);
      expect(await snapshot(a)).toEqual({ sources: 1, files: 1, documents: 1, chunks: 1, jobs: 2 });
      const fresh = (await owner.query('SELECT * FROM index_job WHERE id=$1', [jobs[0]!.jobId])).rows[0];
      expect(fresh).toMatchObject({ state: 'queued', attempts: 0, progress_done: 0, progress_total: null,
        error: null, note: null, lease_fence: 0, leased_until: null, run_started_at: null, finished_at: null });
      expect((await owner.query('SELECT sha256 FROM source_file WHERE source_id=$1', [a.sourceId])).rows[0].sha256).toBe('h');
    }
  });
  it('latest task deterministic on timestamp ties; foreign and missing stats/recrawl hidden', async () => {
    const a = await seedTenant(owner); const b = await seedTenant(owner); await terminal(a);
    const newerId = randomUUID();
    await owner.query("INSERT INTO index_job(id,source_id,account_id,state,created_at) SELECT $1,source_id,account_id,'succeeded',created_at FROM index_job WHERE id=$2",
      [newerId, a.jobId]);
    expect((await listCabinetSources(tenant, a.accountId)).find((s) => s.source_id === a.sourceId)?.job?.job_id).toBe([a.jobId, newerId].sort().at(-1));
    expect(await recrawlSource(tenant, a.accountId, b.sourceId)).toBeNull();
    expect(await recrawlSource(tenant, a.accountId, randomUUID())).toBeNull();
    expect(await readBotStats(tenant, a.accountId, b.botId)).toBeNull();
    expect(await readBotStats(tenant, a.accountId, randomUUID())).toBeNull();
    expect(await readBotStats(tenant, a.accountId, a.botId)).toEqual({ questions_7d: 0, dont_know_7d: 0 });
  });
  it('strict7day boundary; only widget/demo and exact unknown outcomes; no text/visitor leak', async () => {
    const a = await seedTenant(owner);
    const fixed = intercepted(async (sql, c) => {
      if (!sql.includes("set_config('app.account_id'")) return;
      await c.query(`INSERT INTO question_log(bot_id,account_id,channel,question,outcome,visitor_key,created_at)
        SELECT $1,$2,v.channel,'private question',v.outcome,'private visitor',now()-v.age::interval
        FROM (VALUES ('widget','answered','1 day'),('widget','below_threshold','1 day'),
          ('demo','model_unknown','1 day'),('demo','invalid_citation','1 day'),('widget','limited','1 day'),
          ('demo','error','1 day'),('sandbox','below_threshold','1 day'),('widget','answered','7 days'),
          ('demo','model_unknown','7 days 1 microsecond'),('widget','answered','6 days 23 hours')) v(channel,outcome,age)`,
      [a.botId, a.accountId]);
    });
    expect(await readBotStats(fixed, a.accountId, a.botId)).toEqual({ questions_7d: 7, dont_know_7d: 3 });
  });
  it('accessible and revoked studio after real handover use existing RLS', async () => {
    const studio = await seedTenant(owner, { kind: 'studio' });
    for (const keep of [true, false]) {
      const child = await seedTenant(owner, { parent: studio.accountId, studioAccess: true, email: null });
      await owner.query('UPDATE account SET password_hash=NULL WHERE id=$1', [child.accountId]); await terminal(child);
      const hash = uniq('handover'); expect(await issueHandover(service, studio.accountId, child.accountId, hash)).toBeTypeOf('object');
      expect(await acceptHandover(service, { tokenHash: hash, email: `${uniq('owner')}@test.example`, passwordHash: 'hash',
        keepStudioAccess: keep, session: { tokenHash: uniq('session'), expiresAt: new Date(Date.now()+86400000) } }))
        .toEqual({ accountId: child.accountId });
      expect(await readBotStats(tenant, studio.accountId, child.botId)).toEqual(keep ? { questions_7d: 0, dont_know_7d: 0 } : null);
      if (keep) { expect(await recrawlSource(tenant, studio.accountId, child.sourceId)).not.toBeNull();
        expect(await deleteSource(tenant, studio.accountId, child.sourceId)).toBe('source-busy'); }
      else { expect(await recrawlSource(tenant, studio.accountId, child.sourceId)).toBeNull();
        expect(await deleteSource(tenant, studio.accountId, child.sourceId)).toBe('not-found'); }
      expect(await readBotStats(tenant, child.accountId, child.botId)).toEqual({ questions_7d: 0, dont_know_7d: 0 });
    }
  });
});
