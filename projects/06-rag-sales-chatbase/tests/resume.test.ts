// Отказ поставщика и продолжение по content_hash на НАСТОЯЩЕМ Postgres (SC-US-016-1, SC-US-016-2, ADR-009,
// model-call-cost п.4): 429/5xx — 2 повтора, КАЖДЫЙ списан квотой и строкой attempt; серия из 2 попыток →
// failed(embedding_unavailable) с сохранёнными фрагментами; повтор эмбеддит только оставшиеся страницы.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, readIndexJob, retryIndexJob } from '../packages/db/src/index-jobs';
import { noProcessorYet, processByKind, runIndexJob, type RunOutcome } from '../apps/worker/src/run-index-job';
import { createPdfProcessor } from '../apps/worker/src/pdf/pdf-processor';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { removeUpload } from '../apps/worker/src/pdf/uploads';
import type { Embedder } from '../apps/worker/src/embed/embed-and-store';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { fakeGateway, testEmbedder } from './fixtures/fake-embeddings';
import { article, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const databaseUrl = process.env.DATABASE_URL;
const PAGES = ['Страница первая: прайс и доставка по России.', 'Страница вторая: гарантия и возврат товара.', 'Страница третья: контакты и адрес склада.'];

describe.skipIf(!databaseUrl)('Отказ шлюза эмбеддингов и продолжение по content_hash', () => {
  let pool: Pool;
  let dir: string;
  let site: FakeSite | null = null;
  const schema = `resume_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    dir = mkdtempSync(join(tmpdir(), 'n6-resume-uploads-'));
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });
  afterEach(async () => { await site?.close(); site = null; });

  const account = async () => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`])).rows[0]!.id;
  const bot = async (owner: string) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, 'active', $2, 'Компания') RETURNING id`, [owner, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const pdfJob = async (owner: string) => {
    const created = await createSourceJob(pool, { botId: await bot(owner), kind: 'pdf', fileName: 'прайс.pdf', idempotencyKey: randomUUID() });
    writeFileSync(join(dir, created.indexJobId), '%PDF-1.7 подменный файл');
    return created;
  };
  const runPdf = (embedder: Embedder, id: string, generation: number): Promise<RunOutcome> => runIndexJob({
    pool, enqueue: async () => {},
    process: processByKind(pool, { site: noProcessorYet, pdf: createPdfProcessor({ pool, uploadDir: dir, embedder, log: () => {},
      extract: async () => ({ numPages: PAGES.length, pages: PAGES }) }) }),
    onSettled: async (lease) => { await removeUpload(dir, lease.indexJobId); },
  }, { index_job_id: id, generation });
  const fence = async (id: string) => Number((await pool.query('SELECT current_fence FROM index_job WHERE id = $1', [id])).rows[0].current_fence);
  const texts = async (sourceId: string) => (await pool.query<{ text: string }>(
    'SELECT c.text FROM chunk c JOIN page p ON p.id = c.page_id WHERE c.source_id = $1 ORDER BY p.url_or_page, c.ordinal', [sourceId])).rows.map((r) => r.text);
  const used = async (owner: string) => Number((await pool.query('SELECT COALESCE(sum(used), 0)::int AS n FROM quota_counter WHERE scope = $1 AND scope_key = $2',
    ['account_embed_tokens', owner])).rows[0].n);

  it('SC-US-016-1: шлюз недоступен → 2 повтора на пачку, серия из 2 попыток → failed(embedding_unavailable); каждая попытка списана', async () => {
    const owner = await account();
    const job = await pdfJob(owner);
    const t = testEmbedder(pool, { gateway: fakeGateway((n) => (n === 1 ? 'ok' : n % 2 ? '500' : '429')) });
    expect(await runPdf(t.embedder, job.indexJobId, 0)).toBe('retry');   // автоматический повтор серии
    expect(await readIndexJob(pool, job.indexJobId, { accountId: owner })).toMatchObject({ state: 'running' });
    expect(await runPdf(t.embedder, job.indexJobId, await fence(job.indexJobId))).toBe('failed');
    expect(await readIndexJob(pool, job.indexJobId, { accountId: owner })).toMatchObject({ state: 'failed', reason: 'embedding_unavailable' });
    expect(await texts(job.sourceId)).toEqual([PAGES[0]]);                // уже вставленные фрагменты сохраняются
    const attempts = t.spend().filter((e) => e.phase === 'attempt');
    // 1 успешная пачка (страница 1) + (1 + 2 повтора) страницы 2 в КАЖДОЙ из двух попыток серии.
    expect(attempts).toHaveLength(7);
    expect(t.gateway.calls).toHaveLength(7);
    expect(t.spend().filter((e) => e.phase === 'outcome').map((e) => e.result).slice(1)).toEqual(
      ['rate_limited', 'provider_error', 'rate_limited', 'provider_error', 'rate_limited', 'provider_error']);
    // Счёт по ПОПЫТКАМ: отказ поставщика списанное не возвращает, повтор списывает заново.
    expect(await used(owner)).toBe(attempts.reduce((n, e) => n + e.quantity, 0));
    expect(await used(owner)).toBe(attempts[0]!.quantity + 6 * attempts[1]!.quantity);
  });

  it('автоповтор серии продолжает: страница, записанная первой попыткой, второй раз не эмбеддится', async () => {
    const owner = await account();
    const job = await pdfJob(owner);
    const t = testEmbedder(pool, { gateway: fakeGateway((n) => (n >= 2 && n <= 4 ? '500' : 'ok')) });
    expect(await runPdf(t.embedder, job.indexJobId, 0)).toBe('retry');
    const before = t.gateway.calls.length;
    expect(await runPdf(t.embedder, job.indexJobId, await fence(job.indexJobId))).toBe('done');
    const second = t.gateway.calls.slice(before).flatMap((c) => c.texts);
    expect(second.map((x) => x.split('\n')[1])).toEqual([PAGES[1], PAGES[2]]);
    expect(await texts(job.sourceId)).toEqual(PAGES);
    expect(await readIndexJob(pool, job.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 3, chunks_done: 3 });
  });

  it('SC-US-016-2: после отказа «Повторить» эмбеддит только оставшиеся страницы сайта (3 из 5 уже есть → 2)', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const job = await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    const routes: Record<string, Handler> = { '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/p1', '/p2', '/p3', '/p4']) };
    for (const n of [1, 2, 3, 4]) routes[`/p${n}`] = article(`Страница ${n}`);
    site = await startFakeSite(routes);
    let down = true;
    const t = testEmbedder(pool, { gateway: fakeGateway((_n, input) => (down && input.some((x) => /^Страница [34]/.test(x)) ? '500' : 'ok')) });
    const run = (generation: number) => runIndexJob({ pool, enqueue: async () => {},
      process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: 'SuflerBot/0.1', embedder: t.embedder, net: site!.net, crawl: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }), pdf: noProcessorYet }),
    }, { index_job_id: job.indexJobId, generation });
    expect(await run(0)).toBe('retry');
    expect(await run(await fence(job.indexJobId))).toBe('failed');
    expect((await readIndexJob(pool, job.indexJobId, { accountId: owner }))!.reason).toBe('embedding_unavailable');
    expect((await pool.query('SELECT count(*)::int AS n FROM page WHERE source_id = $1', [job.sourceId])).rows[0].n).toBe(3);

    down = false;
    const before = t.gateway.calls.length;
    const message = (await retryIndexJob(pool, job.indexJobId, owner))!;
    expect(await run(message.generation)).toBe('done');
    const embedded = t.gateway.calls.slice(before).flatMap((c) => c.texts).map((x) => x.split('\n')[0]);
    expect(embedded.sort()).toEqual(['Страница 3', 'Страница 4']);
    const pages = (await pool.query<{ n: number }>(`SELECT count(c.id)::int AS n FROM page p LEFT JOIN chunk c ON c.page_id = p.id
      WHERE p.source_id = $1 GROUP BY p.id`, [job.sourceId])).rows;
    expect(pages).toHaveLength(5);
    expect(pages.every((p) => p.n >= 1)).toBe(true);
    expect(await readIndexJob(pool, job.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 5 });
  });
});
