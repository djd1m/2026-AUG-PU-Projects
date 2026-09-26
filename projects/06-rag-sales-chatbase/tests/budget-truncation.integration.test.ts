// budget-truncation (A-N6-052) на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: исчерпание СОБСТВЕННОГО бюджета задачи
// (предпросмотра embed_budget, серии источника series_embed_budget) — усечение: задача done с пометкой и прочитанным,
// страница, не влезшая в бюджет, не оплачивается и не пишется ни одним фрагментом. Ноль прочитанных страниц — отказ.
// Внешние потолки (account/global) — отказ, как раньше (см. chunk-embed.integration «предел аккаунта исчерпан»).
// Дефект, ради которого это написано: стенд 26.09, предпросмотр aicoding.space — 10 страниц прочитаны, 11-я не
// влезла в 40 000 токенов, и вся задача стала failed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, leaseIndexJob, readIndexJob } from '../packages/db/src/index-jobs';
import { reindexSource } from '../packages/db/src/sources';
import { SOURCE_EMBED_BUDGET_BY_PLAN } from '../packages/rag/src/index';
import { noProcessorYet, processByKind, runIndexJob, type RunOutcome } from '../apps/worker/src/run-index-job';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { EmbedBudgetExhausted, type Embedder } from '../apps/worker/src/embed/embed-and-store';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { testEmbedder } from './fixtures/fake-embeddings';
import { article, startFakeSite, text } from './fixtures/fake-site';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('budget-truncation на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  let site: Awaited<ReturnType<typeof startFakeSite>>;
  const schema = `budget_trunc_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    // Четыре страницы одинакового объёма по цепочке ссылок: обход читает их по порядку «/» → a → b → c.
    site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/a']), '/a': article('Доставка', ['/b']),
      '/b': article('Гарантия', ['/c']), '/c': article('Контакты') });
  }, 60_000);
  afterAll(async () => { await site?.close(); if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const account = async () => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`])).rows[0]!.id;
  const bot = async (owner: string | null) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, $2, $3, 'Компания') RETURNING id`, [owner, owner ? 'active' : 'draft', randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const previewJob = async (embedBudget: number) =>
    createSourceJob(pool, { botId: await bot(null), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID(), budget: { pageBudget: 20, embedBudget } });
  const run = (embedder: Embedder, id: string, generation = 0): Promise<RunOutcome> => runIndexJob({ pool, enqueue: async () => {},
    process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: 'SuflerBot/0.1', embedder, net: site.net, crawl: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }), pdf: noProcessorYet }),
  }, { index_job_id: id, generation });
  const job = async (id: string) => (await pool.query<{ status: string; failure_reason: string | null; truncated_by: string | null; pages_done: number; embed_used: number }>(
    'SELECT status, failure_reason, truncated_by, pages_done, embed_used FROM index_job WHERE id = $1', [id])).rows[0]!;
  const pagesOf = async (sourceId: string) => (await pool.query<{ url_or_page: string; n: number }>(`SELECT p.url_or_page, count(c.id)::int AS n
    FROM page p LEFT JOIN chunk c ON c.page_id = p.id WHERE p.source_id = $1 GROUP BY p.url_or_page ORDER BY 1`, [sourceId])).rows;

  // Оценка токенов одной страницы подменного сайта — измеряется прогоном с запасом бюджета, а не угадывается.
  let perPage = 0;
  beforeAll(async () => {
    const roomy = await previewJob(1_000_000);
    expect(await run(testEmbedder(pool).embedder, roomy.indexJobId)).toBe('done');
    const measured = await job(roomy.indexJobId);
    expect(measured.pages_done).toBe(4);
    perPage = Math.ceil(measured.embed_used / 4);
    expect(perPage).toBeGreaterThan(0);
  });

  it('AC-1, AC-2: предпросмотр — две страницы влезли, третья нет → done, truncated_by=embed_budget, прочитано 2; третья не оплачена и не записана', async () => {
    const created = await previewJob(Math.floor(perPage * 2.5));
    const t = testEmbedder(pool);
    expect(await run(t.embedder, created.indexJobId)).toBe('done');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'done', failure_reason: null, truncated_by: 'embed_budget', pages_done: 2 });
    const pages = await pagesOf(created.sourceId);
    expect(pages.map((p) => p.url_or_page)).toEqual(['http://site.example/', 'http://site.example/a']);
    expect(pages.every((p) => p.n >= 1)).toBe(true);
    // Третья страница не дошла до шлюза: попыток ровно столько, сколько пачек у двух записанных страниц, а в
    // отправленных текстах нет «Гарантия» — ни одной её пачки не оплачено.
    expect(t.gateway.calls.flatMap((c) => c.texts).some((x) => x.includes('Гарантия'))).toBe(false);
    expect(t.spend().filter((e) => e.phase === 'attempt')).toHaveLength(2);           // по одной пачке на страницу — третьей нет
    expect((await job(created.indexJobId)).embed_used).toBeLessThanOrEqual(Math.floor(perPage * 2.5));
    // Представление задачи отдаёт пометку экрану предпросмотра.
    const draft = (await pool.query<{ bot_id: string }>('SELECT bot_id FROM index_job WHERE id = $1', [created.indexJobId])).rows[0]!.bot_id;
    expect(await readIndexJob(pool, created.indexJobId, { previewBotId: draft })).toMatchObject({ state: 'done', pages_done: 2, truncated: 'embed_budget' });
  });

  it('AC-5: бюджет меньше первой страницы → failed(quota_refused), ни страницы, ни фрагмента, ни вызова шлюза', async () => {
    const created = await previewJob(Math.floor(perPage / 2));
    const t = testEmbedder(pool);
    expect(await run(t.embedder, created.indexJobId)).toBe('failed');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'failed', failure_reason: 'quota_refused', truncated_by: null, embed_used: 0 });
    expect(await pagesOf(created.sourceId)).toEqual([]);
    expect(t.gateway.calls).toHaveLength(0);
  });

  it('AC-3: бюджет серии источника — эмбеддер бросает EmbedBudgetExhausted(series_embed_budget) ДО вызова шлюза, а не quota_refused', async () => {
    const owner = await account();
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    const lease = (await leaseIndexJob(pool, { index_job_id: created.indexJobId, generation: 0 }))!;
    await pool.query('UPDATE index_job SET series_embed_used = $2 WHERE id = $1', [created.indexJobId, SOURCE_EMBED_BUDGET_BY_PLAN.free - 1]);
    const t = testEmbedder(pool);
    const chunk = { ordinal: 0, contextPath: 'П', text: 'Достаточно длинный текст фрагмента для оценки токенов', tokenCount: 20 };
    const error = await t.embedder.embed(lease, [chunk]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmbedBudgetExhausted);
    expect((error as EmbedBudgetExhausted).truncation).toBe('series_embed_budget');
    expect(t.gateway.calls).toHaveLength(0);
  });

  it('AC-3, AC-6: задача аккаунта, бюджет серии кончился после первой страницы → done+series_embed_budget; «Обновить» сбрасывает пометку и дочитывает, прочитанная страница не переэмбеддится', async () => {
    const owner = await account();
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    const real = testEmbedder(pool);
    // Встроенный порог серии (500 000) на подменном сайте не достижим: эмбеддер-обёртка честно отдаёт первую страницу
    // и объявляет бюджет серии исчерпанным на второй — ровно так, как это делает createEmbedder при нехватке остатка.
    let pagesEmbedded = 0;
    const truncating: Embedder = { async embed(lease, chunks) {
      if (pagesEmbedded >= 1) throw new EmbedBudgetExhausted('series_embed_budget');
      pagesEmbedded += 1;
      return real.embedder.embed(lease, chunks);
    } };
    expect(await run(truncating, created.indexJobId)).toBe('done');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'done', truncated_by: 'series_embed_budget', pages_done: 1 });
    expect((await pagesOf(created.sourceId)).map((p) => p.url_or_page)).toEqual(['http://site.example/']);
    expect(await readIndexJob(pool, created.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', truncated: 'series_embed_budget' });

    const queued = await reindexSource(pool, created.sourceId, owner);
    if (queued?.kind !== 'queued') throw new Error('ожидалась постановка «Обновить»');
    expect((await job(created.indexJobId)).truncated_by).toBeNull();
    const callsBefore = real.gateway.calls.length;
    expect(await run(real.embedder, created.indexJobId, queued.message.generation)).toBe('done');
    expect(await job(created.indexJobId)).toMatchObject({ status: 'done', truncated_by: null, pages_done: 4 });
    expect((await pagesOf(created.sourceId)).map((p) => p.url_or_page)).toEqual(
      ['http://site.example/', 'http://site.example/a', 'http://site.example/b', 'http://site.example/c']);
    // Прочитанная в прошлой серии «Главная» не оплачивается заново (content_hash).
    expect(real.gateway.calls.slice(callsBefore).flatMap((c) => c.texts).some((x) => x.startsWith('Главная'))).toBe(false);
  });

  it('БД держит инвариант: пометка только у done и только из закрытого набора', async () => {
    const created = await previewJob(1_000);
    await expect(pool.query(`UPDATE index_job SET truncated_by = 'embed_budget' WHERE id = $1`, [created.indexJobId])).rejects.toThrow(/index_job_truncated_only_done/);
    await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [created.indexJobId]);
    await expect(pool.query(`UPDATE index_job SET truncated_by = 'budget' WHERE id = $1`, [created.indexJobId])).rejects.toThrow(/index_job_truncated_known/);
  });
});
