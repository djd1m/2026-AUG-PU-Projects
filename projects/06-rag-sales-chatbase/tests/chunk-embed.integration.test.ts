// chunk-embed на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6 (FR-INDEX-001/002, NFR-SEC-001, ADR-001/008/009):
// изоляция поиска по bot_id при чужих ближайших векторах (в том числе на пути HNSW), одна копия фрагментов
// при двух прогонах одной задачи, страница и фрагменты одной транзакцией, квота и бюджет предпросмотра,
// размерность 1536. Шлюз — подменный fetch за настоящим клиентом; живой OpenRouter не вызывается.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool as PgPool } from 'pg';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, readIndexJob, retryIndexJob } from '../packages/db/src/index-jobs';
import { SEARCH_CHUNKS_SQL, searchChunks } from '../packages/db/src/chunks';
import { chunkDocument, embeddingInput, estimateTokens, plainTextBlocks } from '../packages/rag/src/index';
import { noProcessorYet, processByKind, runIndexJob, type RunOutcome } from '../apps/worker/src/run-index-job';
import { createPdfProcessor } from '../apps/worker/src/pdf/pdf-processor';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { removeUpload } from '../apps/worker/src/pdf/uploads';
import type { Embedder } from '../apps/worker/src/embed/embed-and-store';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { fakeGateway, testEmbedder, vectorFor, type GatewayReply } from './fixtures/fake-embeddings';
import { article, startFakeSite, text } from './fixtures/fake-site';

const databaseUrl = process.env.DATABASE_URL;
const PAGES = ['Прайс: доставка по России от 350 ₽, самовывоз бесплатно.', 'Гарантия 12 месяцев на все товары магазина.', 'Контакты: телефон и адрес склада в Москве.'];
const pageTokens = (text: string, n: number) => chunkDocument({ title: `прайс.pdf, с. ${n}`, blocks: plainTextBlocks(text) })
  .reduce((sum, c) => sum + estimateTokens(embeddingInput(c)), 0);

describe.skipIf(!databaseUrl)('chunk-embed на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  let dir: string;
  const schema = `chunk_embed_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    dir = mkdtempSync(join(tmpdir(), 'n6-ce-uploads-'));
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const account = async () => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`])).rows[0]!.id;
  const bot = async (owner: string | null) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, $2, $3, 'Компания') RETURNING id`, [owner, owner ? 'active' : 'draft', randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const pdfJob = async (owner: string | null, budget?: { pageBudget: number; embedBudget: number }) => {
    const botId = await bot(owner);
    const created = await createSourceJob(pool, { botId, kind: 'pdf', fileName: 'прайс.pdf', idempotencyKey: randomUUID(), budget });
    writeFileSync(join(dir, created.indexJobId), '%PDF-1.7 подменный файл: текст отдаёт подменный разбор');
    return { botId, ...created };
  };
  const runPdf = (embedder: Embedder, id: string, generation = 0, pages = PAGES, p: Pool = pool): Promise<RunOutcome> => runIndexJob({
    pool: p, enqueue: async () => {},
    process: processByKind(p, { site: noProcessorYet, pdf: createPdfProcessor({ pool: p, uploadDir: dir, embedder, log: () => {},
      extract: async () => ({ numPages: pages.length, pages }) }) }),
    onSettled: async (lease) => { await removeUpload(dir, lease.indexJobId); },
  }, { index_job_id: id, generation });
  const chunksOf = async (sourceId: string) => (await pool.query<{ page_id: string; ordinal: number; text: string; context_path: string; url_or_page: string }>(
    `SELECT c.page_id, c.ordinal, c.text, c.context_path, p.url_or_page FROM chunk c JOIN page p ON p.id = c.page_id WHERE c.source_id = $1 ORDER BY p.url_or_page, c.ordinal`, [sourceId])).rows;
  const counter = async (scope: string, key: string) => Number((await pool.query<{ used: number }>(
    'SELECT COALESCE(sum(used), 0)::int AS used FROM quota_counter WHERE scope = $1 AND scope_key = $2', [scope, key])).rows[0]!.used);

  it('SC-US-004-1: страницы PDF → фрагменты с контекстом «прайс.pdf, с. N», поиск возвращает источник; квота = оценка по попыткам', async () => {
    const owner = await account();
    const job = await pdfJob(owner);
    const t = testEmbedder(pool);
    const globalBefore = await counter('global_embed_tokens', 'all');
    expect(await runPdf(t.embedder, job.indexJobId)).toBe('done');
    const rows = await chunksOf(job.sourceId);
    expect(rows.map((r) => [r.url_or_page, r.context_path, r.text])).toEqual(PAGES.map((p, i) => [`прайс.pdf#с. ${i + 1}`, `прайс.pdf, с. ${i + 1}`, p]));
    expect(await readIndexJob(pool, job.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 3, chunks_done: 3 });
    // Вектор, посчитанный от «контекст + текст» страницы 3, находит именно её.
    const [hit] = await searchChunks(pool, job.botId, vectorFor(`прайс.pdf, с. 3\n${PAGES[2]}`));
    expect(hit).toMatchObject({ urlOrPage: 'прайс.pdf#с. 3', pageTitle: 'прайс.pdf, с. 3', contextPath: 'прайс.pdf, с. 3', text: PAGES[2] });
    expect(hit!.similarity).toBeGreaterThan(0.999);
    const attempts = t.spend().filter((e) => e.phase === 'attempt');
    const expected = PAGES.reduce((n, p, i) => n + pageTokens(p, i + 1), 0);
    expect(attempts.every((e) => e.call === 'embed_index' && e.account_id === owner && e.index_job_id === job.indexJobId && e.unit === 'tokens')).toBe(true);
    expect(attempts.reduce((n, e) => n + e.quantity, 0)).toBe(expected);
    expect(await counter('account_embed_tokens', owner)).toBe(expected);
    expect(await counter('global_embed_tokens', 'all') - globalBefore).toBe(expected);
    expect(t.spend().filter((e) => e.phase === 'outcome').map((e) => e.result)).toEqual(['success', 'success', 'success']);
  });

  describe('Изоляция арендатора (NFR-SEC-001): ближайшие векторы чужого бота не возвращаются', () => {
    const q = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const near = (i: number) => { const v = q.map((x, k) => x + (k === (i % 1535) + 1 ? 0.02 : 0)); const n = Math.hypot(...v); return v.map((x) => x / n); };
    const far = (i: number) => Array.from({ length: 1536 }, (_, k) => (k === 1000 + i ? 1 : 0));
    let a: { botId: string; ids: string[] }, b: { botId: string; ids: string[] };
    const seed = async (vectors: number[][], text: string) => {
      const botId = await bot(await account());
      const source = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, file_name) VALUES ($1, 'pdf', 'прайс.pdf') RETURNING id`, [botId])).rows[0]!.id;
      const page = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'прайс.pdf#с. 1', 'прайс', $3) RETURNING id`,
        [source, botId, 'a'.repeat(64)])).rows[0]!.id;
      const ids: string[] = [];
      for (const [i, v] of vectors.entries()) {
        ids.push((await pool.query<{ id: string }>(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
          VALUES ($1, $2, $3, $4, 'прайс', $5, 10, $6::vector) RETURNING id`, [botId, source, page, i, text, `[${v.join(',')}]`])).rows[0]!.id);
      }
      return { botId, ids };
    };
    beforeAll(async () => {
      // Одинаковый прайс у двух ботов; у B 300 векторов ближе к вопросу, чем любой вектор A.
      a = await seed([far(0), far(1), far(2)], 'Прайс: доставка 350 ₽');
      b = await seed(Array.from({ length: 300 }, (_, i) => near(i)), 'Прайс: доставка 350 ₽');
      await pool.query('ANALYZE chunk');
    });
    it('план по умолчанию: бот A получает только свои 3 фрагмента, бот B — только свои', async () => {
      const hitsA = await searchChunks(pool, a.botId, q, 4);
      expect(hitsA.map((h) => h.chunkId).sort()).toEqual([...a.ids].sort());
      const hitsB = await searchChunks(pool, b.botId, q, 4);
      expect(hitsB).toHaveLength(4);
      expect(hitsB.every((h) => b.ids.includes(h.chunkId))).toBe(true);
    });
    it('планировщику закрыт упорядоченный обход HNSW даже при запрете перебора: свои не теряются, чужие не просачиваются', async () => {
      // Именно этот путь (HNSW + фильтр bot_id + iterative_scan) отдал 0 из 3 своих фрагментов (A-N6-028).
      const forced = new PgPool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000,
        options: `-c search_path=${schema},public -c enable_seqscan=off -c enable_sort=off -c enable_bitmapscan=off` });
      try {
        const plan = (await forced.query(`EXPLAIN ${SEARCH_CHUNKS_SQL}`, [a.botId, `[${q.join(',')}]`, 4])).rows
          .map((r: Record<string, string>) => r['QUERY PLAN']).join('\n');
        expect(plan).not.toContain('chunk_embedding_hnsw');
        const hitsA = await searchChunks(forced as unknown as Pool, a.botId, q, 4);
        expect(hitsA.map((h) => h.chunkId).sort()).toEqual([...a.ids].sort());
        expect((await searchChunks(forced as unknown as Pool, b.botId, q, 4)).every((h) => b.ids.includes(h.chunkId))).toBe(true);
      } finally { await forced.end(); }
    });
    it('цена точного перебора: 5000 фрагментов одного бота — поиск < 500 мс, верный ближайший первым; замер вставки в HNSW', async () => {
      const c = await seed([far(3)], 'цель');
      const ref = (await pool.query('SELECT source_id, page_id FROM chunk WHERE bot_id = $1', [c.botId])).rows[0];
      const noise = (client: { query: Pool['query'] }, from: number, count: number) => client.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
        SELECT $1, $2, $3, g.n, 'шум', 'шум', 10, (SELECT array_agg(random() - 0.5)::real[] FROM generate_series(1, 1536) d WHERE g.n > 0)::vector
        FROM generate_series($4::int, $4::int + $5::int - 1) AS g(n)`, [c.botId, ref.source_id, ref.page_id, from, count]);
      // Замер: вставка с поддержкой индекса HNSW (случайные векторы — худший случай для графа).
      let started = performance.now();
      for (const from of [1, 51]) await noise(pool, from, 50);
      console.log(`hnsw-insert: ${((performance.now() - started) / 100).toFixed(1)} мс на фрагмент (100 случайных векторов)`);
      // Перебор не зависит от HNSW; чтобы засеять 5000 строк за секунды, индекс снимается ВНУТРИ транзакции
      // этого соединения и возвращается откатом.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DROP INDEX chunk_embedding_hnsw');
        await noise(client, 101, 4900);
        const scoped = { query: client.query.bind(client) } as unknown as Pool;
        started = performance.now();
        const hits = await searchChunks(scoped, c.botId, far(3), 4);
        const ms = performance.now() - started;
        console.log(`search-exact 5001 фрагментов одного бота: ${Math.round(ms)} мс`);
        expect(hits[0]!.chunkId).toBe(c.ids[0]);
        expect(hits).toHaveLength(4);
        expect(ms).toBeLessThan(500);
      } finally { await client.query('ROLLBACK'); client.release(); }
      await pool.query('DELETE FROM chunk WHERE bot_id = $1 AND ordinal > 0', [c.botId]);
    }, 120_000);
    it('непригодный bot_id и вектор не 1536 — отказ до запроса', async () => {
      await expect(searchChunks(pool, 'x', q)).rejects.toThrow();
      await expect(searchChunks(pool, a.botId, q.slice(1))).rejects.toThrow();
    });
  });

  describe('Два прогона одной задачи → одна копия фрагментов', () => {
    const assertOneCopy = async (sourceId: string, indexJobId: string) => {
      const rows = await chunksOf(sourceId);
      expect(rows.map((r) => r.text)).toEqual(PAGES);
      expect(new Set(rows.map((r) => `${r.page_id}:${r.ordinal}`)).size).toBe(rows.length);
      expect((await pool.query('SELECT count(*)::int AS n FROM page WHERE source_id = $1', [sourceId])).rows[0].n).toBe(3);
      expect((await pool.query('SELECT chunks_done FROM index_job WHERE id = $1', [indexJobId])).rows[0].chunks_done).toBe(3);
    };
    it('одновременная двойная доставка сообщения: один done, второй skipped', async () => {
      const job = await pdfJob(await account());
      const t = testEmbedder(pool);
      const outcomes = await Promise.all([runPdf(t.embedder, job.indexJobId), runPdf(t.embedder, job.indexJobId)]);
      expect(outcomes.sort()).toEqual(['done', 'skipped']);
      await assertOneCopy(job.sourceId, job.indexJobId);
    });
    it('вторая попытка перехватила фенс, пока первая ждала шлюз: первая stale и ничего не дописала', async () => {
      const job = await pdfJob(await account());
      let second: Promise<RunOutcome> | null = null;
      const gateway = fakeGateway(async (n): Promise<GatewayReply> => {
        if (n === 1) { second = runPdf(t.embedder, job.indexJobId, 1); await second; }
        return 'ok';
      });
      const t = testEmbedder(pool, { gateway });
      const first = await runPdf(t.embedder, job.indexJobId);
      expect([first, await second]).toEqual(['stale', 'done']);
      await assertOneCopy(job.sourceId, job.indexJobId);
    });
    it('повторная доставка после done — skipped, фрагменты не тронуты', async () => {
      const job = await pdfJob(await account());
      const t = testEmbedder(pool);
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('done');
      const before = await chunksOf(job.sourceId);
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('skipped');
      expect(await chunksOf(job.sourceId)).toEqual(before);
    });
  });

  it('сбой записи фрагментов откатывает страницу: «Повторить» эмбеддит её заново, а не пропускает как известную', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const job = await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    const site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/about']), '/about': article('О нас') });
    // Пул, у которого ПЕРВАЯ вставка фрагментов отказывает (как обрыв соединения посреди записи).
    let armed = true;
    const failing = new Proxy(pool, { get(target, prop) {
      if (prop === 'connect') return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(c, p) {
          if (p === 'query') return (sql: unknown, ...rest: unknown[]) => {
            if (armed && typeof sql === 'string' && sql.startsWith('INSERT INTO chunk')) { armed = false; return Promise.reject(new Error('сбой записи фрагментов (тест)')); }
            return (c.query as (...a: unknown[]) => unknown).apply(c, [sql, ...rest]);
          };
          const value = Reflect.get(c, p); return typeof value === 'function' ? value.bind(c) : value;
        } });
      };
      const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
    } }) as Pool;
    try {
      const t = testEmbedder(failing);
      const run = (p: Pool, generation: number) => runIndexJob({ pool: p, enqueue: async () => {},
        process: processByKind(p, { site: createSiteProcessor({ pool: p, userAgent: 'SuflerBot/0.1', embedder: t.embedder, net: site.net, crawl: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }), pdf: noProcessorYet }),
      }, { index_job_id: job.indexJobId, generation });
      expect(await run(failing, 0)).toBe('failed');
      expect((await pool.query('SELECT count(*)::int AS n FROM page WHERE source_id = $1', [job.sourceId])).rows[0].n).toBe(0);
      const callsBefore = t.gateway.calls.length;
      const message = (await retryIndexJob(pool, job.indexJobId, owner))!;
      expect(await run(pool, message.generation)).toBe('done');
      const pages = (await pool.query<{ url_or_page: string; n: number }>(`SELECT p.url_or_page, count(c.id)::int AS n FROM page p LEFT JOIN chunk c ON c.page_id = p.id
        WHERE p.source_id = $1 GROUP BY p.url_or_page ORDER BY 1`, [job.sourceId])).rows;
      expect(pages.map((p) => p.url_or_page)).toEqual(['http://site.example/', 'http://site.example/about']);
      expect(pages.every((p) => p.n >= 1)).toBe(true);
      expect(t.gateway.calls.slice(callsBefore).flatMap((c) => c.texts).some((x) => x.startsWith('Главная'))).toBe(true);
    } finally { await site.close(); }
  });

  describe('Квота и бюджет ДО вызова (FR-LIMIT-003)', () => {
    it('предел аккаунта исчерпан → failed(quota_refused), шлюз не вызван, попытки не записаны', async () => {
      const owner = await account();
      const job = await pdfJob(owner);
      const t = testEmbedder(pool, { env: { QUOTA_ACCOUNT_EMBED: '5' } });
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('failed');
      expect((await readIndexJob(pool, job.indexJobId, { accountId: owner }))!.reason).toBe('quota_refused');
      expect(t.gateway.calls).toHaveLength(0);
      expect(t.spend()).toEqual([]);
      expect(await counter('account_embed_tokens', owner)).toBe(0);
    });
    it('предпросмотр: бюджет задачи + global_embed_tokens; аккаунт не списывается; сверх бюджета — отказ с откатом global', async () => {
      const ok = await pdfJob(null, { pageBudget: 20, embedBudget: 40_000 });
      const t = testEmbedder(pool);
      const g0 = await counter('global_embed_tokens', 'all');
      expect(await runPdf(t.embedder, ok.indexJobId)).toBe('done');
      const expected = PAGES.reduce((n, p, i) => n + pageTokens(p, i + 1), 0);
      expect((await pool.query('SELECT embed_used FROM index_job WHERE id = $1', [ok.indexJobId])).rows[0].embed_used).toBe(expected);
      expect(await counter('global_embed_tokens', 'all') - g0).toBe(expected);
      expect(t.spend().filter((e) => e.phase === 'attempt').every((e) => e.call === 'embed_preview' && e.account_id === undefined)).toBe(true);

      const tight = await pdfJob(null, { pageBudget: 20, embedBudget: pageTokens(PAGES[0]!, 1) + 1 });
      const g1 = await counter('global_embed_tokens', 'all');
      expect(await runPdf(t.embedder, tight.indexJobId)).toBe('failed');
      expect((await pool.query('SELECT failure_reason, embed_used FROM index_job WHERE id = $1', [tight.indexJobId])).rows[0])
        .toEqual({ failure_reason: 'quota_refused', embed_used: pageTokens(PAGES[0]!, 1) });
      expect(await counter('global_embed_tokens', 'all') - g1).toBe(pageTokens(PAGES[0]!, 1));
      expect((await chunksOf(tight.sourceId)).map((r) => r.text)).toEqual([PAGES[0]]); // уже вставленные фрагменты сохраняются
    });
    it('две задачи одного аккаунта одновременно у потолка: списано ≤ предела и ровно сумма разрешённых попыток', async () => {
      const owner = await account();
      const total = PAGES.reduce((n, p, i) => n + pageTokens(p, i + 1), 0);
      const limit = total + pageTokens(PAGES[0]!, 1);
      const t = testEmbedder(pool, { env: { QUOTA_ACCOUNT_EMBED: String(limit) } });
      const jobs = [await pdfJob(owner), await pdfJob(owner)];
      const outcomes = await Promise.all(jobs.map((j) => runPdf(t.embedder, j.indexJobId)));
      const used = await counter('account_embed_tokens', owner);
      expect(used).toBeLessThanOrEqual(limit);
      expect(used).toBe(t.spend().filter((e) => e.phase === 'attempt').reduce((n, e) => n + e.quantity, 0));
      expect(outcomes).toContain('failed');
    });
  });

  describe('Размерность 1536 (ADR-001) и отказы поставщика', () => {
    it('вектор 3072 от клиента → failed(internal), outcome dimension_mismatch, сигнал оператору, ни страницы, ни фрагмента', async () => {
      const owner = await account();
      const job = await pdfJob(owner);
      const logs: string[] = [];
      const t = testEmbedder(pool, { log: (l) => logs.push(l), client: { embed: async ({ texts }) => ({ vectors: texts.map(() => Array(3072).fill(0.01)) }) } });
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('failed');
      expect((await readIndexJob(pool, job.indexJobId, { accountId: owner }))!.reason).toBe('internal');
      expect(t.spend().filter((e) => e.phase === 'outcome').map((e) => e.result)).toEqual(['dimension_mismatch']);
      expect(logs.join('\n')).toContain('СИГНАЛ ОПЕРАТОРУ');
      expect(await chunksOf(job.sourceId)).toEqual([]);
      expect((await pool.query('SELECT count(*)::int AS n FROM page WHERE source_id = $1', [job.sourceId])).rows[0].n).toBe(0);
    });
    it('вектор 3072 от шлюза через настоящий клиент → тот же отказ', async () => {
      const job = await pdfJob(await account());
      const t = testEmbedder(pool, { gateway: fakeGateway(() => 'dim3072') });
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('failed');
      expect((await pool.query('SELECT failure_reason FROM index_job WHERE id = $1', [job.indexJobId])).rows[0].failure_reason).toBe('internal');
      expect(t.spend().filter((e) => e.phase === 'outcome').map((e) => e.result)).toEqual(['dimension_mismatch']);
    });
    it('отказ 400 (ключ, модель) — не повторяется: failed(embedding_unavailable) с первой попытки, одна попытка списана', async () => {
      const owner = await account();
      const job = await pdfJob(owner);
      const t = testEmbedder(pool, { gateway: fakeGateway(() => '400') });
      expect(await runPdf(t.embedder, job.indexJobId)).toBe('failed');
      expect((await readIndexJob(pool, job.indexJobId, { accountId: owner }))!.reason).toBe('embedding_unavailable');
      expect(t.gateway.calls).toHaveLength(1);
      expect(await counter('account_embed_tokens', owner)).toBe(pageTokens(PAGES[0]!, 1));
    });
  });
});
