// text-source (FR-SOURCE-005, A-N6-080) на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: миграция 015 (CHECK дописаны, а не
// перечислены), задача «текстовый файл» целиком (AC-4), «Обновить» неизменного файла — 0 вызовов эмбеддингов (AC-5),
// предел страниц тарифа по разделам (page_budget), отказы not_text / too_large / blocked_address с закрытой причиной.
// Подменный сайт — tests/fixtures/fake-site.ts; подменный шлюз эмбеддингов — tests/fixtures/fake-embeddings.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { readIndexJob } from '../packages/db/src/index-jobs';
import { createSiteSource, readBotCabinet } from '../packages/db/src/bots';
import { reindexSource } from '../packages/db/src/sources';
import { noProcessorYet, processByKind, runIndexJob } from '../apps/worker/src/run-index-job';
import { createTextProcessor } from '../apps/worker/src/text/text-processor';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { testEmbedder } from './fixtures/fake-embeddings';
import { html, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const databaseUrl = process.env.DATABASE_URL;
const para = (topic: string) => `${topic}: подробное описание условий, цен и сроков для клиентов компании. `.repeat(4);
const sectionsFile = (n: number, change?: number) => `# Компания\n\n${para('Вступление')}\n\n`
  + Array.from({ length: n }, (_, i) => `## Раздел ${i + 1}\n\n### Подробности\n\n${para(`Тема ${i + 1}${change === i ? ' ИЗМЕНЕНО' : ''}`)}\n`).join('\n');

describe.skipIf(!databaseUrl)('text-source на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  let site: FakeSite;
  let body = sectionsFile(3);
  const schema = `text_src_${randomBytes(8).toString('hex')}`;
  const file: Handler = (_q, r) => { r.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' }); r.end(body); };
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/llms-full.txt': file,
      '/page.html': html('<!doctype html><html><body>страница</body></html>'),
      '/big.txt': (_q, r) => { r.writeHead(200, { 'content-type': 'text/plain' }); r.end(Buffer.alloc(2 * 1024 * 1024 + 1, 0x61)); } });
  }, 60_000);
  afterAll(async () => { await site?.close(); if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  const account = async (plan = 'free') => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`, plan])).rows[0]!.id;
  const bot = async (owner: string) => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, 'active', $2, 'Компания') RETURNING id`, [owner, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  const w = () => testEmbedder(pool);
  const run = (embedder: ReturnType<typeof w>, id: string, generation = 0) => runIndexJob({ pool, enqueue: async () => {},
    process: processByKind(pool, { site: noProcessorYet, pdf: noProcessorYet,
      text: createTextProcessor({ pool, userAgent: 'SuflerBot/0.1', embedder: embedder.embedder, net: site.net, fetch: { pauseMs: 0, timeoutMs: 2000 }, log: () => {} }) }),
  }, { index_job_id: id, generation });
  const create = async (owner: string, url = 'http://site.example/llms-full.txt') => {
    const botId = await bot(owner);
    const created = await createSiteSource(pool, { accountId: owner, botId, rootUrl: url, idempotencyKey: randomUUID(), kind: 'text' });
    if (created.kind !== 'created') throw new Error('источник не создан');
    const source = (await pool.query<{ id: string }>('SELECT source_id AS id FROM index_job WHERE id = $1', [created.indexJobId])).rows[0]!.id;
    return { botId, jobId: created.indexJobId, sourceId: source };
  };
  const job = async (id: string) => (await pool.query<{ status: string; failure_reason: string | null; truncated_by: string | null; pages_done: number;
    pages_total: number | null; unread_sample: string[] | null }>('SELECT status, failure_reason, truncated_by, pages_done, pages_total, unread_sample FROM index_job WHERE id = $1', [id])).rows[0]!;

  it('миграция 015: CHECK дописаны к набору 001 (прежние значения на месте), связка «вид → адрес» — импликациями', async () => {
    const def = async (con: string) => (await pool.query<{ d: string }>(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = $1
      AND connamespace = $2::regnamespace`, [con, schema])).rows[0]?.d ?? '';
    expect(await def('source_kind_check')).toMatch(/'text'.*'site'.*'pdf'/s);
    expect(await def('index_job_failure_reason_check')).toMatch(/'not_text'/);
    for (const old of ['robots_disallowed', 'no_text_layer', 'internal']) expect(await def('index_job_failure_reason_check')).toContain(`'${old}'`);
    expect(await def('index_start_kind_check')).toMatch(/'text'.*'site'.*'pdf'.*'retry'.*'reindex'/s);
    expect(await def('source_check')).toBe('');
    const botId = await bot(await account());
    await expect(pool.query(`INSERT INTO source (bot_id, kind) VALUES ($1, 'text')`, [botId])).rejects.toThrow(/source_text_has_url/);
    await expect(pool.query(`INSERT INTO source (bot_id, kind) VALUES ($1, 'site')`, [botId])).rejects.toThrow(/source_site_has_url/);
    await expect(pool.query(`INSERT INTO source (bot_id, kind, root_url) VALUES ($1, 'pdf', 'x')`, [botId])).rejects.toThrow(/source_pdf_has_file/);
    await expect(pool.query(`INSERT INTO source (bot_id, kind, root_url) VALUES ($1, 'ftp', 'x')`, [botId])).rejects.toThrow(/source_kind_check/);
    await expect(pool.query(`INSERT INTO source (bot_id, kind, root_url, content_bytes) VALUES ($1, 'site', 'x', 5)`, [botId])).rejects.toThrow(/source_content_only_text/);
    await expect(pool.query(`INSERT INTO source (bot_id, kind, root_url, content_bytes) VALUES ($1, 'text', 'x', 2097153)`, [botId])).rejects.toThrow(/source_content_bytes_range/);
  });

  it('файл → done: раздел — строка page «адрес#якорь», фрагменты с контекстом ###, размер и sha256 в source; кабинет видит text', async () => {
    body = sectionsFile(3);
    const owner = await account();
    const s = await create(owner);
    const e = w();
    expect(await run(e, s.jobId)).toBe('done');
    expect(await job(s.jobId)).toMatchObject({ status: 'done', truncated_by: null, pages_done: 4, pages_total: 4 });
    const pages = (await pool.query<{ url_or_page: string; title: string }>('SELECT url_or_page, title FROM page WHERE source_id = $1 ORDER BY url_or_page', [s.sourceId])).rows;
    expect(pages.map((p) => decodeURIComponent(p.url_or_page))).toEqual(['http://site.example/llms-full.txt#компания',
      'http://site.example/llms-full.txt#раздел-1', 'http://site.example/llms-full.txt#раздел-2', 'http://site.example/llms-full.txt#раздел-3']);
    expect(pages.map((p) => p.title)).toContain('Компания › Раздел 2');
    const chunk = (await pool.query<{ context_path: string }>(`SELECT context_path FROM chunk WHERE source_id = $1 AND context_path LIKE '%Раздел 2%'`, [s.sourceId])).rows[0]!;
    expect(chunk.context_path).toBe('Компания › Раздел 2 › Подробности');
    const src = (await pool.query<{ content_bytes: number; content_sha256: string; status: string }>('SELECT content_bytes, content_sha256, status FROM source WHERE id = $1', [s.sourceId])).rows[0]!;
    expect(src).toMatchObject({ content_bytes: Buffer.byteLength(body), status: 'ready' });
    expect(src.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    const cabinet = await readBotCabinet(pool, s.botId, owner);
    expect(cabinet!.sources[0]).toMatchObject({ kind: 'text', title: 'http://site.example/llms-full.txt' });
    expect(await readIndexJob(pool, s.jobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 4 });
  });

  it('«Обновить» неизменного файла — 0 вызовов эмбеддингов, фрагменты те же; изменён один раздел — эмбеддится только он; исчезнувший — удалён', async () => {
    body = sectionsFile(3);
    const owner = await account();
    const s = await create(owner);
    const e = w();
    expect(await run(e, s.jobId)).toBe('done');
    const chunksBefore = (await pool.query<{ id: string }>('SELECT id FROM chunk WHERE source_id = $1 ORDER BY id', [s.sourceId])).rows.map((r) => r.id);
    const callsBefore = e.gateway.calls.length;
    expect(callsBefore).toBeGreaterThan(0);

    const again = await reindexSource(pool, s.sourceId, owner);
    if (again?.kind !== 'queued') throw new Error('ожидалась постановка «Обновить»');
    expect(await run(e, s.jobId, again.message.generation)).toBe('done');
    expect(e.gateway.calls.length).toBe(callsBefore);                       // AC-5: ни одного вызова
    expect((await pool.query<{ id: string }>('SELECT id FROM chunk WHERE source_id = $1 ORDER BY id', [s.sourceId])).rows.map((r) => r.id)).toEqual(chunksBefore);
    expect(await job(s.jobId)).toMatchObject({ status: 'done', pages_done: 4 });

    body = sectionsFile(2, 1);   // раздел 2 изменён, раздел 3 исчез
    const third = await reindexSource(pool, s.sourceId, owner);
    if (third?.kind !== 'queued') throw new Error('ожидалась постановка «Обновить»');
    expect(await run(e, s.jobId, third.message.generation)).toBe('done');
    const embedded = e.gateway.calls.slice(callsBefore).flatMap((c) => c.texts);
    expect(embedded.length).toBeGreaterThan(0);
    expect(embedded.every((t) => t.includes('Раздел 2'))).toBe(true);
    const pages = (await pool.query<{ url_or_page: string }>('SELECT url_or_page FROM page WHERE source_id = $1', [s.sourceId])).rows.map((r) => decodeURIComponent(r.url_or_page));
    expect(pages).toHaveLength(3);
    expect(pages.some((p) => p.endsWith('#раздел-3'))).toBe(false);
  });

  it('разделов больше предела тарифа free (50): done с page_budget, 50 из 55, 5 непрочитанных «путь#якорь»; эмбеддинги — только 50', async () => {
    body = sectionsFile(54);   // 54 раздела ## + вступление = 55
    const s = await create(await account('free'));
    const e = w();
    expect(await run(e, s.jobId)).toBe('done');
    const row = await job(s.jobId);
    expect(row).toMatchObject({ status: 'done', truncated_by: 'page_budget', pages_done: 50, pages_total: 55 });
    expect(row.unread_sample).toEqual(['/llms-full.txt#раздел-50', '/llms-full.txt#раздел-51', '/llms-full.txt#раздел-52', '/llms-full.txt#раздел-53', '/llms-full.txt#раздел-54']);
    expect(Number((await pool.query<{ n: string }>('SELECT count(*) AS n FROM page WHERE source_id = $1', [s.sourceId])).rows[0]!.n)).toBe(50);
    expect(e.gateway.calls.flatMap((c) => c.texts).some((t) => t.includes('Раздел 50'))).toBe(false);
  });

  it('отказы с закрытой причиной: HTML — not_text, 2 МиБ + 1 — too_large, адрес во внутреннюю сеть — blocked_address; эмбеддингов нет', async () => {
    const e = w();
    for (const [url, reason] of [['http://site.example/page.html', 'not_text'], ['http://site.example/big.txt', 'too_large'],
      ['http://10.0.0.5/llms.txt', 'blocked_address']] as const) {
      const s = await create(await account(), url);
      expect(await run(e, s.jobId), url).toBe('failed');
      expect(await job(s.jobId), url).toMatchObject({ status: 'failed', failure_reason: reason });
    }
    expect(e.gateway.calls).toHaveLength(0);
    expect(site.dials.every((ip) => ip === '93.184.215.14')).toBe(true);
  });

  it('обработчик text не подключён — задача failed(internal), а не «успех без работы»', async () => {
    const s = await create(await account());
    expect(await runIndexJob({ pool, enqueue: async () => {}, process: processByKind(pool, { site: noProcessorYet, pdf: noProcessorYet }) },
      { index_job_id: s.jobId, generation: 0 })).toBe('failed');
    expect(await job(s.jobId)).toMatchObject({ status: 'failed', failure_reason: 'internal' });
  });
});
