// Краулер ВНУТРИ задачи индексации на НАСТОЯЩЕМ Postgres (ADR-009, ADR-010, FR-SOURCE-001/002,
// SC-US-001-2/3/4): три состояния по id, прогресс «N из M», фенс останавливает обход, «Повторить»
// продолжает по content_hash, бюджет страниц по плану. Сайт — локальный HTTP-сервер (fixtures/fake-site.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { closeFailedTx, createPool, transaction, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, readIndexJob, retryIndexJob } from '../packages/db/src/index-jobs';
import { noProcessorYet, processByKind, runIndexJob } from '../apps/worker/src/run-index-job';
import { createSiteProcessor } from '../apps/worker/src/crawl/site-processor';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { article, html, redirect, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const databaseUrl = process.env.DATABASE_URL;
const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';

describe.skipIf(!databaseUrl)('Краулер в задаче индексации на настоящем Postgres', () => {
  let pool: Pool;
  let site: FakeSite | null = null;
  const logs: string[] = [];
  const schema = `crawl_job_${randomBytes(8).toString('hex')}`;
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
  const bot = async (owner: string | null) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, $2, $3, 'Компания') RETURNING id`, [owner, owner ? 'active' : 'draft', randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const newJob = async (owner: string | null, budget?: { pageBudget: number; embedBudget: number }) => {
    const botId = await bot(owner);
    return { botId, ...(await createSourceJob(pool, { botId, kind: 'site', rootUrl: 'http://site.example/', idempotencyKey: randomUUID(), budget })) };
  };
  const run = (s: FakeSite, indexJobId: string, generation = 0) => runIndexJob({
    pool, enqueue: async () => {},
    process: processByKind(pool, { site: createSiteProcessor({ pool, userAgent: UA, net: s.net, crawl: { pauseMs: 0, timeoutMs: 2000 }, log: (l) => logs.push(l) }), pdf: noProcessorYet }),
  }, { index_job_id: indexJobId, generation });
  const job = async (id: string) => (await pool.query('SELECT * FROM index_job WHERE id = $1', [id])).rows[0];
  const pages = async (sourceId: string) => (await pool.query('SELECT id, url_or_page, content_hash FROM page WHERE source_id = $1 ORDER BY url_or_page', [sourceId])).rows;
  const noRobots = { '/robots.txt': text('', 'text/plain', 404) };

  it('успех: страницы записаны с content_hash, «N из M», пропуски с причиной, в журнале только счётчики', async () => {
    const owner = await account();
    const created = await newJob(owner);
    site = await startFakeSite({ '/robots.txt': text('User-agent: *\nDisallow: /admin\n'), '/': article('Главная', ['/about', '/admin']), '/about': article('О нас') });
    expect(await run(site, created.indexJobId)).toBe('done');
    const row = await job(created.indexJobId);
    expect([row.status, row.pages_done, row.pages_total]).toEqual(['done', 2, 2]);
    const source = (await pool.query('SELECT status, pages_indexed, pages_skipped FROM source WHERE id = $1', [created.sourceId])).rows[0];
    expect(source).toEqual({ status: 'ready', pages_indexed: 2, pages_skipped: 1 });
    expect((await pages(created.sourceId)).map((p) => p.url_or_page)).toEqual(['http://site.example/', 'http://site.example/about']);
    expect(await readIndexJob(pool, created.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 2, pages_total: 2 });
    const line = logs.find((l) => l.includes(created.indexJobId))!;
    expect(line).toContain('прочитано 2');
    expect(line).toContain('robots=1');
    expect(logs.join('\n')).not.toMatch(/Содержательный абзац|site\.example/);
  });

  it.each([
    ['SC-US-001-2 robots Disallow: /', { '/robots.txt': text('User-agent: *\nDisallow: /\n'), '/': article('Главная') }, 'robots_disallowed'],
    ['SC-US-001-4 корень перенаправляет на 169.254.169.254', { ...noRobots, '/': redirect('http://169.254.169.254/latest/meta-data/') }, 'blocked_address'],
    ['SC-US-001-3 пустая оболочка SPA', { ...noRobots, '/': html('<html><body><div id="root"></div></body></html>') }, 'no_text'],
  ] as Array<[string, Record<string, Handler>, string]>)('%s → failed с причиной, различимо по id', async (_title, routes, reason) => {
    const owner = await account();
    const created = await newJob(owner);
    site = await startFakeSite(routes);
    expect(await run(site, created.indexJobId)).toBe('failed');
    expect(await readIndexJob(pool, created.indexJobId, { accountId: owner })).toMatchObject({ state: 'failed', reason });
    expect((await pool.query('SELECT status FROM source WHERE id = $1', [created.sourceId])).rows[0].status).toBe('failed');
    expect(site.dials.every((ip) => ip === '93.184.215.14')).toBe(true);
  });

  it('фенс перехвачен посреди обхода → stale, обход останавливается; «Повторить» продолжает по content_hash', async () => {
    const owner = await account();
    const created = await newJob(owner);
    let steal = true;
    const about: Handler = (request, response) => {
      const respond = () => article('О нас')(request, response);
      if (!steal) { respond(); return; }
      // Сторож закрывает задачу, пока попытка качает страницу: запись этой страницы обязана быть отвергнута.
      void transaction(pool, (tx) => closeFailedTx(tx, created.indexJobId, 'stalled', new Date())).then(respond);
    };
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/about', '/contacts']), '/about': about, '/contacts': article('Контакты') });
    expect(await run(site, created.indexJobId)).toBe('stale');
    expect(site.requests.map((r) => r.path)).not.toContain('/contacts');
    const before = await pages(created.sourceId);
    expect(before.map((p) => p.url_or_page)).toEqual(['http://site.example/']);
    expect((await job(created.indexJobId)).failure_reason).toBe('stalled');

    steal = false;
    const message = (await retryIndexJob(pool, created.indexJobId, owner))!;
    expect(await run(site, created.indexJobId, message.generation)).toBe('done');
    const after = await pages(created.sourceId);
    expect(after).toHaveLength(3);
    expect(after.find((p) => p.url_or_page === 'http://site.example/')).toEqual(before[0]); // строка не переписана
    expect((await job(created.indexJobId)).pages_done).toBe(3);
    expect(logs.find((l) => l.includes(created.indexJobId) && l.includes('без изменений 1'))).toBeDefined();
  });

  it('бюджет страниц: free — 50, предпросмотр — 20 из задачи, nobadge — все 55', async () => {
    const links = Array.from({ length: 54 }, (_, i) => `/p${i}`);
    const routes: Record<string, Handler> = { ...noRobots, '/': article('Главная', links) };
    for (const l of links) routes[l] = article(`Страница ${l}`);
    site = await startFakeSite(routes);
    const free = await newJob(await account('free'));
    const preview = await newJob(null, { pageBudget: 20, embedBudget: 40_000 });
    const paid = await newJob(await account('nobadge'));
    for (const j of [free, preview, paid]) expect(await run(site, j.indexJobId)).toBe('done');
    expect([(await job(free.indexJobId)).pages_done, (await job(preview.indexJobId)).pages_done, (await job(paid.indexJobId)).pages_done]).toEqual([50, 20, 55]);
  });

  it('источник PDF не уходит в краулер: до фичи pdf-source — failed(internal), а не «готово»', async () => {
    const botId = await bot(await account());
    const created = await createSourceJob(pool, { botId, kind: 'pdf', fileName: 'прайс.pdf', idempotencyKey: randomUUID() });
    site = await startFakeSite({});
    expect(await run(site, created.indexJobId)).toBe('failed');
    expect((await job(created.indexJobId)).failure_reason).toBe('internal');
    expect(site.requests).toEqual([]);
  });
});
