// crawl-coverage (A-N6-070) на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: обход, упёршийся в предел страниц тарифа, — done С
// ПОМЕТКОЙ page_budget, pages_total = число ИЗВЕСТНЫХ адресов (а не прочитанных), до 5 непрочитанных путей для ленты.
// Дефект стенда 28.09: aicoding.space на плане free — done «50 из 50» без пометки, ни одной записи блога.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, readIndexJob } from '../packages/db/src/index-jobs';
import { readBotCabinet } from '../packages/db/src/bots';
import { reindexSource } from '../packages/db/src/sources';
import { noProcessorYet, processByKind, runIndexJob, type RunOutcome } from '../apps/worker/src/run-index-job';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { testEmbedder } from './fixtures/fake-embeddings';
import { article, startFakeSite, text } from './fixtures/fake-site';
import { BLOG_PATHS, sectionedSite } from './fixtures/sectioned-site';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('crawl-coverage на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  let big: Awaited<ReturnType<typeof startFakeSite>>;
  let small: Awaited<ReturnType<typeof startFakeSite>>;
  const schema = `crawl_cov_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    big = await startFakeSite(sectionedSite());
    small = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/a']), '/a': article('Доставка') });
  }, 60_000);
  afterAll(async () => { await big?.close(); await small?.close(); if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const account = async () => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`])).rows[0]!.id;
  const bot = async (owner: string) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, 'active', $2, 'Компания') RETURNING id`, [owner, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const run = (site: typeof big, id: string, generation = 0): Promise<RunOutcome> => runIndexJob({ pool, enqueue: async () => {},
    process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: 'SuflerBot/0.1', embedder: testEmbedder(pool).embedder, net: site.net,
      crawl: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }), pdf: noProcessorYet }),
  }, { index_job_id: id, generation });
  const job = async (id: string) => (await pool.query<{ status: string; truncated_by: string | null; pages_done: number; pages_total: number | null;
    unread_sample: string[] | null }>('SELECT status, truncated_by, pages_done, pages_total, unread_sample FROM index_job WHERE id = $1', [id])).rows[0]!;

  it('free, сайт «42 курса + 10 блога + 5 прочих»: done, page_budget, 50 из ≥ 58, 5 непрочитанных путей; все записи блога записаны', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const created = await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    expect(await run(big, created.indexJobId)).toBe('done');
    const row = await job(created.indexJobId);
    expect(row).toMatchObject({ status: 'done', truncated_by: 'page_budget', pages_done: 50, pages_total: 58 });
    expect(row.unread_sample).toHaveLength(5);
    expect(row.unread_sample!.every((p) => p.startsWith('/courses/'))).toBe(true);
    const pages = (await pool.query<{ url_or_page: string }>('SELECT url_or_page FROM page WHERE source_id = $1', [created.sourceId])).rows
      .map((r) => new URL(r.url_or_page).pathname);
    expect(pages).toHaveLength(50);
    expect(BLOG_PATHS.every((p) => pages.includes(p))).toBe(true);
    // Экран владельца получает пометку, известные адреса и примеры — и через задачу, и через кабинет бота.
    const view = await readIndexJob(pool, created.indexJobId, { accountId: owner });
    expect(view).toMatchObject({ state: 'done', truncated: 'page_budget', pages_done: 50, pages_total: 58, unread: row.unread_sample });
    const cabinet = await readBotCabinet(pool, botId, owner);
    expect(cabinet!.sources[0]!.job).toMatchObject({ truncated: 'page_budget', pages_total: 58, unread: row.unread_sample });

    // «Обновить»: пометка и примеры сбрасываются при постановке, а не живут от прошлой серии.
    const queued = await reindexSource(pool, created.sourceId, owner);
    if (queued?.kind !== 'queued') throw new Error('ожидалась постановка «Обновить»');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'queued', truncated_by: null, unread_sample: null });
  });

  it('ревью круг 1: потолок времени обхода через всю цепочку — done, crawl_limit, известные больше прочитанных, примеры записаны', async () => {
    const owner = await account();
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    const outcome = await runIndexJob({ pool, enqueue: async () => {}, process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: 'SuflerBot/0.1',
      embedder: testEmbedder(pool).embedder, net: big.net, crawl: { pauseMs: 30, timeoutMs: 2000, timeBudgetMs: 400 }, log: () => {} }), pdf: noProcessorYet }) },
    { index_job_id: created.indexJobId, generation: 0 });
    expect(outcome).toBe('done');
    const row = await job(created.indexJobId);
    expect(row).toMatchObject({ status: 'done', truncated_by: 'crawl_limit' });
    expect(row.pages_done).toBeGreaterThan(0);
    expect(row.pages_done).toBeLessThan(50);
    expect(row.pages_total!).toBeGreaterThan(row.pages_done);
    expect(row.unread_sample).toHaveLength(5);
  });

  it('сайт меньше предела: done без пометки, pages_total = прочитанным, примеров нет', async () => {
    const owner = await account();
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    expect(await run(small, created.indexJobId)).toBe('done');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'done', truncated_by: null, pages_done: 2, pages_total: 2, unread_sample: null });
    const view = await readIndexJob(pool, created.indexJobId, { accountId: owner });
    expect(view).toMatchObject({ state: 'done', truncated: null });
    expect(view).not.toHaveProperty('unread');
  });

  it('БД держит инвариант: новые значения пометки приняты; примеры только у усечённой, не больше 5', async () => {
    const owner = await account();
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [created.indexJobId]);
    await expect(pool.query(`UPDATE index_job SET unread_sample = ARRAY['/a'] WHERE id = $1`, [created.indexJobId])).rejects.toThrow(/index_job_unread_only_truncated/);
    for (const value of ['page_budget', 'crawl_limit', 'embed_budget', 'series_embed_budget']) {
      await pool.query('UPDATE index_job SET truncated_by = $2 WHERE id = $1', [created.indexJobId, value]);
    }
    await expect(pool.query(`UPDATE index_job SET truncated_by = 'pages' WHERE id = $1`, [created.indexJobId])).rejects.toThrow(/index_job_truncated_known/);
    await expect(pool.query(`UPDATE index_job SET unread_sample = ARRAY['/1','/2','/3','/4','/5','/6'] WHERE id = $1`, [created.indexJobId]))
      .rejects.toThrow(/index_job_unread_sample_small/);
    await expect(pool.query(`UPDATE index_job SET unread_sample = ARRAY[]::text[] WHERE id = $1`, [created.indexJobId])).rejects.toThrow(/index_job_unread_sample_small/);
  });
});
