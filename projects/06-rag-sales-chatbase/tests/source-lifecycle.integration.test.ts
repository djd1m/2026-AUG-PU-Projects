// source-lifecycle (фича 16, FR-INDEX-004) на НАСТОЯЩЕМ Postgres + pgvector: «Обновить» переэмбеддит только изменённые
// страницы той же задачей (SC-US-014-1), исчезнувшие страницы удаляются только после полного обхода, удаление
// источника убирает его фрагменты из поиска одной транзакцией (SC-US-014-2), опоздавший воркер после удаления ничего не
// дописывает, суточный предел запусков считает отказы и держится при конкурентных запусках, бюджет серии источника.
// Сайт — локальный HTTP-сервер (fixtures/fake-site.ts), шлюз эмбеддингов — фейк со счётчиком вызовов.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSiteSource } from '../packages/db/src/bots';
import { createSourceJob, leaseIndexJob, retryIndexJob, StaleAttemptError } from '../packages/db/src/index-jobs';
import { capPageChunks, searchChunks, writeIndexedPage } from '../packages/db/src/chunks';
import { createPdfSource, readOwnedBotForPdf } from '../packages/db/src/pdf-sources';
import { deleteSource, indexStartsToday, reindexSource } from '../packages/db/src/sources';
import { CHUNKS_PER_PAGE_MAX, INDEX_STARTS_PER_BOT_DAY, SOURCE_EMBED_BUDGET_BY_PLAN } from '../packages/rag/src/constants';
import { noProcessorYet, processByKind, runIndexJob, StepFailure } from '../apps/worker/src/run-index-job';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { article, text, startFakeSite, type FakeSite, type Handler } from './fixtures/fake-site';
import { testEmbedder, vectorFor } from './fixtures/fake-embeddings';

const databaseUrl = process.env.DATABASE_URL;
const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
const noRobots = { '/robots.txt': text('', 'text/plain', 404) };
const fail500: Handler = (_q, response) => { response.writeHead(500, { 'content-type': 'text/html' }); response.end('<html><body>сбой</body></html>'); };

describe.skipIf(!databaseUrl)('Жизненный цикл источника на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  let site: FakeSite | null = null;
  const schema = `source_life_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });
  afterEach(async () => { await site?.close(); site = null; });

  const account = async (plan = 'free') => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`, plan])).rows[0]!.id;
  const bot = async (owner: string) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, 'active', $2, 'Компания') RETURNING id`, [owner, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const siteJob = async () => {
    const owner = await account();
    const botId = await bot(owner);
    return { owner, botId, ...(await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID() })) };
  };
  const wire = () => {
    const t = testEmbedder(pool);
    const run = (s: FakeSite, indexJobId: string, generation: number) => runIndexJob({
      pool, enqueue: async () => {},
      process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: UA, embedder: t.embedder, net: s.net, crawl: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }), pdf: noProcessorYet }),
    }, { index_job_id: indexJobId, generation });
    return { ...t, run };
  };
  const pageUrls = async (sourceId: string) => (await pool.query<{ url_or_page: string }>('SELECT url_or_page FROM page WHERE source_id = $1 ORDER BY url_or_page', [sourceId]))
    .rows.map((r) => r.url_or_page);
  const count = async (sql: string, args: unknown[]) => Number((await pool.query<{ n: number }>(sql, args)).rows[0]!.n);
  const fivePages = (tag: Record<string, string>): Record<string, Handler> => ({
    ...noRobots,
    '/': article('Главная', ['/a', '/b', '/c', '/d'], tag['/'] ?? ''),
    ...Object.fromEntries(['/a', '/b', '/c', '/d'].map((p) => [p, article(`Раздел ${p}`, [], tag[p] ?? '')])),
  });

  it('SC-US-014-1: «Обновить» — та же задача, новая серия, переэмбеддятся ровно 3 изменённые страницы из 5; без изменений — ни одного вызова; новые фрагменты снимают отметку «проверено»', async () => {
    const w = wire();
    const j = await siteJob();
    const routes = fivePages({});
    site = await startFakeSite(routes);
    expect(await w.run(site, j.indexJobId, 0)).toBe('done');
    expect(await pageUrls(j.sourceId)).toHaveLength(5);
    await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [j.botId]);
    const before = w.gateway.calls.length;
    Object.assign(routes, fivePages({ '/a': 'Новая цена 990 рублей.', '/b': 'Доставка теперь бесплатно.', '/c': 'Открылся второй зал.' }));

    const again = await reindexSource(pool, j.sourceId, j.owner);
    expect(again).toMatchObject({ kind: 'queued', message: { index_job_id: j.indexJobId } });
    if (again?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, again.message.generation)).toBe('done');
    const embedded = w.gateway.calls.slice(before).flatMap((c) => c.texts);
    expect(w.gateway.calls.length - before).toBe(3);
    expect(embedded.join('\n')).toMatch(/990 рублей[\s\S]*бесплатно|бесплатно[\s\S]*990 рублей/);
    expect(embedded.join('\n')).toContain('Открылся второй зал');
    expect(await count('SELECT count(DISTINCT series_no)::int AS n FROM job_attempt WHERE index_job_id = $1', [j.indexJobId])).toBe(2);
    expect(await count('SELECT count(*)::int AS n FROM index_job WHERE source_id = $1', [j.sourceId])).toBe(1);
    expect((await pool.query('SELECT answers_verified_at FROM bot WHERE id = $1', [j.botId])).rows[0].answers_verified_at).toBeNull();

    // Ничего не изменилось: вызовов шлюза нет, отметка не снимается (A-N6-036: снимает только НОВЫЙ фрагмент).
    await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [j.botId]);
    const quiet = w.gateway.calls.length;
    const third = await reindexSource(pool, j.sourceId, j.owner);
    if (third?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, third.message.generation)).toBe('done');
    expect(w.gateway.calls.length).toBe(quiet);
    expect((await pool.query('SELECT answers_verified_at FROM bot WHERE id = $1', [j.botId])).rows[0].answers_verified_at).not.toBeNull();
    expect(await pageUrls(j.sourceId)).toHaveLength(5);
  });

  it('исчезнувшая страница удаляется после ПОЛНОГО обхода; при временном сбое другой страницы — не удаляется («не увидели» ≠ «нет»)', async () => {
    const w = wire();
    const j = await siteJob();
    const routes = fivePages({});
    site = await startFakeSite(routes);
    expect(await w.run(site, j.indexJobId, 0)).toBe('done');
    // /d исчезла с сайта (ссылки нет, адрес 404), а /b отвечает 500 — обход не полный, ничего не удаляется
    Object.assign(routes, { '/': article('Главная', ['/a', '/b', '/c']), '/d': text('нет', 'text/html', 404), '/b': fail500 });
    const r1 = await reindexSource(pool, j.sourceId, j.owner);
    if (r1?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, r1.message.generation)).toBe('done');
    expect(await pageUrls(j.sourceId)).toContain('http://site.example/d');
    // /b ожил — обход полный, /d с фрагментами удаляется, chunks_done уменьшен
    routes['/b'] = article('Раздел /b');
    const r2 = await reindexSource(pool, j.sourceId, j.owner);
    if (r2?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, r2.message.generation)).toBe('done');
    expect(await pageUrls(j.sourceId)).toEqual(['http://site.example/', 'http://site.example/a', 'http://site.example/b', 'http://site.example/c']);
    const chunks = await count('SELECT count(*)::int AS n FROM chunk WHERE source_id = $1', [j.sourceId]);
    expect(await count('SELECT chunks_done AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBe(chunks);
  });

  it('SC-US-014-2: удаление источника — страниц, фрагментов, задач 0; поиск бота не видит его фрагментов, соседний источник цел; чужой и несуществующий — null', async () => {
    const w = wire();
    const j = await siteJob();
    site = await startFakeSite(fivePages({ '/a': 'Прайс: доставка 350 рублей.' }));
    expect(await w.run(site, j.indexJobId, 0)).toBe('done');
    await site.close(); site = null;
    const other = await createSourceJob(pool, { botId: j.botId, kind: 'site', rootUrl: 'http://other.example/', idempotencyKey: randomUUID() });
    const otherPage = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'http://other.example/', 'Другой', $3) RETURNING id`,
      [other.sourceId, j.botId, 'b'.repeat(64)])).rows[0]!.id;
    await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding) VALUES ($1, $2, $3, 0, 'Другой', 'Часы работы 9–18', 5, $4::vector)`,
      [j.botId, other.sourceId, otherPage, `[${vectorFor('Часы работы').join(',')}]`]);
    const q = vectorFor('Прайс: доставка 350 рублей.');
    expect((await searchChunks(pool, j.botId, q, 20)).some((h) => h.sourceId === j.sourceId)).toBe(true);

    expect(await deleteSource(pool, j.sourceId, await account())).toBeNull();          // чужой
    expect(await deleteSource(pool, randomUUID(), j.owner)).toBeNull();                 // несуществующий
    const removed = await deleteSource(pool, j.sourceId, j.owner);
    expect(removed).toMatchObject({ deleted: true });
    expect(removed!.chunks).toBeGreaterThan(0);
    for (const table of ['page', 'chunk', 'index_job']) {
      expect(await count(`SELECT count(*)::int AS n FROM ${table} WHERE source_id = $1`, [j.sourceId]), table).toBe(0);
    }
    const hits = await searchChunks(pool, j.botId, q, 20);
    expect(hits.some((h) => h.sourceId === j.sourceId)).toBe(false);
    expect(hits.map((h) => h.sourceId)).toEqual([other.sourceId]);
    expect(await deleteSource(pool, j.sourceId, j.owner)).toBeNull();                 // повторное удаление — 404
  });

  it('удаление посреди индексации: опоздавшая запись страницы — StaleAttemptError и откат, ничего не дописано', async () => {
    const j = await siteJob();
    const lease = await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 0 });
    expect(lease).not.toBeNull();
    expect(await deleteSource(pool, j.sourceId, j.owner)).toMatchObject({ deleted: true });
    const chunk = { ordinal: 0, contextPath: 'П', text: 'Текст', tokenCount: 3, embedding: vectorFor('Текст') };
    await expect(writeIndexedPage(pool, lease!, { urlOrPage: 'http://site.example/', title: 'П', contentHash: 'c'.repeat(64) }, [chunk]))
      .rejects.toBeInstanceOf(StaleAttemptError);
    expect(await count('SELECT count(*)::int AS n FROM chunk WHERE bot_id = $1', [j.botId])).toBe(0);
    expect(await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 1 })).toBeNull();
  });

  it('суточный предел запусков: вчерашние не считаются; 20-й проходит, 21-й — daily_limit; «Обновить» тоже тратит запуск; PDF — отказ до приёма тела и в транзакции', async () => {
    const owner = await account('nobadge');
    const botId = await bot(owner);
    await pool.query(`INSERT INTO index_start (bot_id, kind, created_at) SELECT $1, 'site', now() - interval '1 day' FROM generate_series(1, 30)`, [botId]);
    await pool.query(`INSERT INTO index_start (bot_id, kind) SELECT $1, 'pdf' FROM generate_series(1, $2::int)`, [botId, INDEX_STARTS_PER_BOT_DAY - 2]);
    expect(await indexStartsToday(pool, botId)).toBe(INDEX_STARTS_PER_BOT_DAY - 2);
    const first = await createSiteSource(pool, { accountId: owner, botId, rootUrl: 'http://site.example/', idempotencyKey: randomUUID() });
    expect(first.kind).toBe('created');
    // повтор с тем же ключом — та же задача и не новый запуск
    const key = randomUUID();
    const second = await createSiteSource(pool, { accountId: owner, botId, rootUrl: 'http://site2.example/', idempotencyKey: key });
    expect(second.kind).toBe('created');
    expect((await createSiteSource(pool, { accountId: owner, botId, rootUrl: 'http://site2.example/', idempotencyKey: key })).kind).toBe('existing');
    expect(await createSiteSource(pool, { accountId: owner, botId, rootUrl: 'http://site3.example/', idempotencyKey: randomUUID() }))
      .toEqual({ kind: 'daily_limit', limit: INDEX_STARTS_PER_BOT_DAY });
    // «Обновить» готового источника упирается в тот же предел
    const src = (await pool.query<{ source_id: string; id: string }>('SELECT source_id, id FROM index_job WHERE bot_id = $1 LIMIT 1', [botId])).rows[0]!;
    await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [src.id]);
    expect(await reindexSource(pool, src.source_id, owner)).toEqual({ kind: 'daily_limit', limit: INDEX_STARTS_PER_BOT_DAY });
    // PDF: дешёвая проверка до тела видит исчерпание, решающая — в транзакции
    expect((await readOwnedBotForPdf(pool, botId, owner))!.startsToday).toBe(INDEX_STARTS_PER_BOT_DAY);
    expect(await createPdfSource(pool, { accountId: owner, botId, fileName: 'прайс.pdf', idempotencyKey: randomUUID(), indexJobId: randomUUID() }))
      .toEqual({ kind: 'daily_limit', limit: INDEX_STARTS_PER_BOT_DAY });
  });

  it('конкурентно: 30 одновременных запусков при остатке 5 → ровно 5 задач, 25 × daily_limit (счёт под блокировкой строки бота)', async () => {
    const owner = await account();
    const botId = await bot(owner);
    await pool.query(`INSERT INTO index_start (bot_id, kind) SELECT $1, 'site' FROM generate_series(1, $2::int)`, [botId, INDEX_STARTS_PER_BOT_DAY - 5]);
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => createSiteSource(pool, { accountId: owner, botId, rootUrl: `http://s${i}.example/`, idempotencyKey: randomUUID() })));
    expect(results.filter((r) => r.kind === 'created')).toHaveLength(5);
    expect(results.filter((r) => r.kind === 'daily_limit')).toHaveLength(25);
    expect(await indexStartsToday(pool, botId)).toBe(INDEX_STARTS_PER_BOT_DAY);
    expect(await count('SELECT count(*)::int AS n FROM index_job WHERE bot_id = $1', [botId])).toBe(5);
  });

  it('«Обновить»: идущая задача — тот же id без второй серии; PDF — pdf_reupload; чужой — null', async () => {
    const j = await siteJob();
    const startsBefore = await indexStartsToday(pool, j.botId);
    expect(await reindexSource(pool, j.sourceId, j.owner)).toEqual({ kind: 'running', indexJobId: j.indexJobId });
    expect(await reindexSource(pool, j.sourceId, j.owner)).toEqual({ kind: 'running', indexJobId: j.indexJobId });
    // повторные нажатия на идущей задаче не тратят суточный предел запусков и не поднимают фенс
    expect(await indexStartsToday(pool, j.botId)).toBe(startsBefore);
    expect(await count('SELECT current_fence AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBe(0);
    expect(await reindexSource(pool, j.sourceId, await account())).toBeNull();
    const pdf = await createSourceJob(pool, { botId: j.botId, kind: 'pdf', fileName: 'прайс.pdf', idempotencyKey: randomUUID() });
    await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [pdf.indexJobId]);
    expect(await reindexSource(pool, pdf.sourceId, j.owner)).toEqual({ kind: 'pdf_reupload' });
  });

  it('бюджет серии источника: сверх предела плана — quota_refused; новая серия (из queued) начинает с нуля; предпросмотр счётчик серии не трогает', async () => {
    const w = wire();
    const j = await siteJob();
    const lease = (await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 0 }))!;
    const limit = SOURCE_EMBED_BUDGET_BY_PLAN.free;
    await pool.query('UPDATE index_job SET series_embed_used = $2 WHERE id = $1', [j.indexJobId, limit - 1]);
    const chunk = { ordinal: 0, contextPath: 'П', text: 'Достаточно длинный текст фрагмента для оценки токенов', tokenCount: 20 };
    await expect(w.embedder.embed(lease, [chunk])).rejects.toMatchObject({ reason: 'quota_refused' });
    await expect(w.embedder.embed(lease, [chunk])).rejects.toBeInstanceOf(StepFailure);
    expect(w.gateway.calls).toHaveLength(0);                                            // отказ ДО вызова шлюза
    // новая серия: «Повторить» после отказа — счётчик серии с нуля
    await pool.query(`UPDATE index_job SET status = 'failed', failure_reason = 'quota_refused' WHERE id = $1`, [j.indexJobId]);
    const r = await reindexSource(pool, j.sourceId, j.owner);
    if (r?.kind !== 'queued') throw new Error('ожидалась постановка');
    const next = (await leaseIndexJob(pool, r.message))!;
    expect(await count('SELECT series_embed_used AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBe(0);
    await w.embedder.embed(next, [chunk]);
    expect(await count('SELECT series_embed_used AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBeGreaterThan(0);
    // Сброс держит САМА аренда новой серии, а не только «Обновить»: путь «Повторить» по id задачи (retryIndexJob)
    // бюджет серии не обнуляет, и без сброса в leaseIndexJob отказ quota_refused повторялся бы вечно.
    await pool.query(`UPDATE index_job SET status = 'failed', failure_reason = 'quota_refused', series_embed_used = $2 WHERE id = $1`, [j.indexJobId, limit]);
    const byId = await retryIndexJob(pool, j.indexJobId, j.owner);
    expect(byId).not.toBeNull();
    expect(await count('SELECT series_embed_used AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBe(limit);
    expect(await leaseIndexJob(pool, byId!)).not.toBeNull();
    expect(await count('SELECT series_embed_used AS n FROM index_job WHERE id = $1', [j.indexJobId])).toBe(0);
    // предпросмотр (embed_budget задан) платит своим бюджетом, series_embed_used не растёт
    const draft = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name) VALUES (NULL, 'draft', $1, 'Черновик') RETURNING id`,
      [randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
    const preview = await createSourceJob(pool, { botId: draft, kind: 'site', rootUrl: 'http://p.example/', idempotencyKey: randomUUID(), budget: { pageBudget: 20, embedBudget: 40_000 } });
    const pl = (await leaseIndexJob(pool, { index_job_id: preview.indexJobId, generation: 0 }))!;
    await w.embedder.embed(pl, [chunk]);
    expect(await count('SELECT series_embed_used AS n FROM index_job WHERE id = $1', [preview.indexJobId])).toBe(0);
    expect(await count('SELECT embed_used AS n FROM index_job WHERE id = $1', [preview.indexJobId])).toBeGreaterThan(0);
  });

  it('ревью находка 1: удаление и «Обновить» параллельно с записью страницы воркером — без взаимной блокировки (порядок «задача → бот»)', async () => {
    for (const action of ['delete', 'reindex'] as const) {
      const j = await siteJob();
      await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [j.botId]);   // триггер снятия отметки тоже берёт строку бота
      const lease = (await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 0 }))!;
      const worker = await pool.connect();
      try {
        await worker.query('BEGIN');
        // как recordProgressTx: воркер держит строку задачи с проверкой фенса
        expect((await worker.query(`UPDATE index_job SET pages_done = pages_done + 1 WHERE id = $1 AND current_fence = $2 AND status = 'running'`,
          [j.indexJobId, lease.fence])).rowCount).toBe(1);
        const other = action === 'delete' ? deleteSource(pool, j.sourceId, j.owner) : reindexSource(pool, j.sourceId, j.owner);
        await new Promise((r) => setTimeout(r, 300));                                            // вторая сторона уже ждёт
        // запись страницы: внешние ключи page → source/bot и триггер chunk → bot берут строку бота
        const page = (await worker.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'http://site.example/', 'Г', $3) RETURNING id`,
          [j.sourceId, j.botId, 'e'.repeat(64)])).rows[0]!.id;
        await worker.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding) VALUES ($1, $2, $3, 0, '', 'т', 1, $4::vector)`,
          [j.botId, j.sourceId, page, `[${vectorFor('т').join(',')}]`]);
        await worker.query('COMMIT');
        const result = await other;
        if (action === 'delete') {
          expect(result).toMatchObject({ deleted: true });
          expect(await count('SELECT count(*)::int AS n FROM chunk WHERE bot_id = $1', [j.botId])).toBe(0);
        } else {
          expect(result).toEqual({ kind: 'running', indexJobId: j.indexJobId });
        }
      } finally { worker.release(); }
    }
  });

  it('ревью находки 2, 5: сбой sitemap — обнаружение неполное, страницы только из sitemap не удаляются; ссылка на 404 — страницы нет, удаляется', async () => {
    const w = wire();
    const j = await siteJob();
    const routes: Record<string, Handler> = { ...noRobots, '/': article('Главная', ['/a', '/gone']), '/a': article('Раздел А'), '/gone': article('Исчезнет'),
      '/sitemap.xml': text('<urlset><url><loc>http://site.example/only-sitemap</loc></url></urlset>', 'application/xml'), '/only-sitemap': article('Только из карты') };
    site = await startFakeSite(routes);
    expect(await w.run(site, j.indexJobId, 0)).toBe('done');
    expect(await pageUrls(j.sourceId)).toContain('http://site.example/only-sitemap');
    routes['/sitemap.xml'] = fail500;                                            // карта сайта временно недоступна
    routes['/gone'] = text('нет', 'text/html', 404);                             // а эту страницу удалили
    const r1 = await reindexSource(pool, j.sourceId, j.owner);
    if (r1?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, r1.message.generation)).toBe('done');
    expect(await pageUrls(j.sourceId)).toContain('http://site.example/only-sitemap');
    expect(await pageUrls(j.sourceId)).toContain('http://site.example/gone');     // обход неполный — ничего не удалено
    routes['/sitemap.xml'] = text('<urlset><url><loc>http://site.example/only-sitemap</loc></url></urlset>', 'application/xml');
    const r2 = await reindexSource(pool, j.sourceId, j.owner);
    if (r2?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, r2.message.generation)).toBe('done');
    expect(await pageUrls(j.sourceId)).toEqual(['http://site.example/', 'http://site.example/a', 'http://site.example/only-sitemap']);
  });

  it('ревью находка 4: неизменная страница переехала на новый адрес — адрес актуализирован, без переэмбеддинга', async () => {
    const w = wire();
    const j = await siteJob();
    const routes: Record<string, Handler> = { ...noRobots, '/': article('Главная', ['/old']), '/old': article('Прайс', [], 'Доставка 350 рублей.') };
    site = await startFakeSite(routes);
    expect(await w.run(site, j.indexJobId, 0)).toBe('done');
    const calls = w.gateway.calls.length;
    Object.assign(routes, { '/': article('Главная', ['/new']), '/new': article('Прайс', [], 'Доставка 350 рублей.'), '/old': text('нет', 'text/html', 404) });
    const r = await reindexSource(pool, j.sourceId, j.owner);
    if (r?.kind !== 'queued') throw new Error('ожидалась постановка');
    expect(await w.run(site, j.indexJobId, r.message.generation)).toBe('done');
    expect(await pageUrls(j.sourceId)).toEqual(['http://site.example/', 'http://site.example/new']);
    expect(w.gateway.calls.length).toBe(calls);
  });

  it('ревью находка 3: «Обновить» сохранённого предпросмотра снимает бюджеты предпросмотра — дальше платит аккаунт', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const job = await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://p.example/', idempotencyKey: randomUUID(), budget: { pageBudget: 20, embedBudget: 40_000 } });
    await pool.query(`UPDATE index_job SET status = 'done', embed_used = 39_000 WHERE id = $1`, [job.indexJobId]);
    const r = await reindexSource(pool, job.sourceId, owner);
    expect(r).toMatchObject({ kind: 'queued' });
    expect((await pool.query('SELECT page_budget, embed_budget, embed_used, series_embed_used FROM index_job WHERE id = $1', [job.indexJobId])).rows[0])
      .toEqual({ page_budget: null, embed_budget: null, embed_used: 0, series_embed_used: 0 });
  });

  it('ревью находка 6: «Повторить» по id задачи тратит суточный запуск; предел исчерпан — null и задача остаётся failed', async () => {
    const j = await siteJob();
    await pool.query(`UPDATE index_job SET status = 'failed', failure_reason = 'unreachable' WHERE id = $1`, [j.indexJobId]);
    await pool.query(`INSERT INTO index_start (bot_id, kind) SELECT $1, 'site' FROM generate_series(1, $2::int)`, [j.botId, INDEX_STARTS_PER_BOT_DAY]);
    expect(await retryIndexJob(pool, j.indexJobId, j.owner)).toBeNull();
    expect((await pool.query('SELECT status FROM index_job WHERE id = $1', [j.indexJobId])).rows[0].status).toBe('failed');
    await pool.query('DELETE FROM index_start WHERE bot_id = $1', [j.botId]);
    expect(await retryIndexJob(pool, j.indexJobId, j.owner)).toMatchObject({ index_job_id: j.indexJobId });
    expect(await indexStartsToday(pool, j.botId)).toBe(1);
  });

  it('предел фрагментов страницы: capPageChunks отбрасывает сверх 300; запись > 300 — отказ; chunks_dropped хранится у страницы', async () => {
    const many = Array.from({ length: CHUNKS_PER_PAGE_MAX + 7 }, (_, i) => i);
    expect(capPageChunks(many)).toEqual({ kept: many.slice(0, CHUNKS_PER_PAGE_MAX), dropped: 7 });
    expect(capPageChunks([1, 2])).toEqual({ kept: [1, 2], dropped: 0 });
    const j = await siteJob();
    const lease = (await leaseIndexJob(pool, { index_job_id: j.indexJobId, generation: 0 }))!;
    const v = vectorFor('x');
    const chunks = Array.from({ length: CHUNKS_PER_PAGE_MAX + 1 }, (_, i) => ({ ordinal: i, contextPath: '', text: `ф${i}`, tokenCount: 2, embedding: v }));
    await expect(writeIndexedPage(pool, lease, { urlOrPage: 'http://site.example/big', title: 'Большая', contentHash: 'd'.repeat(64) }, chunks)).rejects.toThrow(/300/);
    await writeIndexedPage(pool, lease, { urlOrPage: 'http://site.example/big', title: 'Большая', contentHash: 'd'.repeat(64), chunksDropped: 1 }, chunks.slice(0, CHUNKS_PER_PAGE_MAX));
    expect((await pool.query('SELECT chunks_dropped FROM page WHERE source_id = $1', [j.sourceId])).rows).toEqual([{ chunks_dropped: 1 }]);
    expect(await count('SELECT count(*)::int AS n FROM chunk WHERE source_id = $1', [j.sourceId])).toBe(CHUNKS_PER_PAGE_MAX);
  }, 60_000);
});
