// PDF внутри задачи индексации на НАСТОЯЩЕМ Postgres (FR-SOURCE-003, SC-US-004-1/2/3, ADR-009, ADR-018):
// маршрут загрузки с настоящими readOwnedBot/createPdfSource, атомарный предел числа PDF под параллельной
// нагрузкой, три состояния по id, подписи страниц «файл.pdf#с. N», удаление файла после done И failed,
// сохранение файла при stale, подметание тома. Разбор — настоящий дочерний процесс pdfjs-dist.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeFailedTx, createPool, transaction, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createSourceJob, readIndexJob } from '../packages/db/src/index-jobs';
import { createPdfSource, findJobByIdempotencyKey, pdfLimitFor, readOwnedBotForPdf } from '../packages/db/src/pdf-sources';
import { noProcessorYet, processByKind, runIndexJob } from '../apps/worker/src/run-index-job';
import { createPdfProcessor } from '../apps/worker/src/pdf/pdf-processor';
import { removeUpload, sweepUploads } from '../apps/worker/src/pdf/uploads';
import { extractPdf } from '../apps/worker/src/pdf/extract-pdf';
import { createSourceUploadHandler } from '../apps/web/src/server/source-upload-handler';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { testEmbedder } from './fixtures/fake-embeddings';
import { brokenPdf, encryptedPdf, multiPagePdf, multipart, BOUNDARY, normalPdf, scanPdf } from './fixtures/pdf-factory';

const databaseUrl = process.env.DATABASE_URL;
const ORIGIN = 'https://sufler.test.invalid';

describe.skipIf(!databaseUrl)('PDF в задаче индексации на настоящем Postgres', () => {
  let pool: Pool;
  let dir: string;
  const logs: string[] = [];
  const schema = `pdf_job_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'n6-uploads-it-')); });

  const account = async (plan = 'free') => (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
    [`u${randomBytes(6).toString('hex')}@example.org`, plan])).rows[0]!.id;
  const bot = async (owner: string, status = 'active') => (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name)
    VALUES ($1, $2, $3, 'Компания') RETURNING id`, [owner, status, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
  // Задача PDF «как после загрузки»: строка задачи + файл в томе под её id.
  const pdfJob = async (owner: string, pdf: Buffer, fileName = 'прайс.pdf') => {
    const botId = await bot(owner);
    const created = await createSourceJob(pool, { botId, kind: 'pdf', fileName, idempotencyKey: randomUUID() });
    writeFileSync(join(dir, created.indexJobId), pdf);
    return { botId, ...created };
  };
  const run = (indexJobId: string, extract = extractPdf) => runIndexJob({
    pool, enqueue: async () => {},
    process: processByKind(pool, { site: noProcessorYet, pdf: createPdfProcessor({ pool, uploadDir: dir, embedder: testEmbedder(pool, { log: (l) => logs.push(l) }).embedder, extract, log: (l) => logs.push(l) }) }),
    onSettled: async (lease) => { await removeUpload(dir, lease.indexJobId); },
  }, { index_job_id: indexJobId, generation: 0 });
  const job = async (id: string) => (await pool.query('SELECT * FROM index_job WHERE id = $1', [id])).rows[0];

  it('SC-US-004-1: 12 страниц → done, страницы «прайс.pdf#с. N» с content_hash, прогресс 12 из 12, файл удалён', async () => {
    const owner = await account();
    const created = await pdfJob(owner, multiPagePdf(12));
    expect(await run(created.indexJobId)).toBe('done');
    expect(await readIndexJob(pool, created.indexJobId, { accountId: owner })).toMatchObject({ state: 'done', pages_done: 12, pages_total: 12 });
    const pages = (await pool.query('SELECT url_or_page, title, content_hash FROM page WHERE source_id = $1 ORDER BY created_at, url_or_page', [created.sourceId])).rows;
    expect(pages).toHaveLength(12);
    expect(pages.map((p) => p.url_or_page)).toContain('прайс.pdf#с. 3');
    expect(pages.find((p) => p.url_or_page === 'прайс.pdf#с. 3')!.title).toBe('прайс.pdf, с. 3');
    expect(pages.every((p) => /^[0-9a-f]{64}$/.test(p.content_hash))).toBe(true);
    expect((await pool.query('SELECT status, pages_indexed FROM source WHERE id = $1', [created.sourceId])).rows[0]).toEqual({ status: 'ready', pages_indexed: 12 });
    expect(existsSync(join(dir, created.indexJobId))).toBe(false);
    expect(logs.join('\n')).not.toMatch(/Позиция|прайс\.pdf/); // в журнале — только счётчики
  });

  it.each([
    ['SC-US-004-2 скан без текстового слоя', () => scanPdf(10, 0), 'no_text_layer'],
    ['шифрованный', encryptedPdf, 'no_text_layer'],
    ['битый', brokenPdf, 'not_pdf'],
    ['101 страница', () => multiPagePdf(101), 'too_large'],
    ['не PDF в томе (подмена после приёма)', () => Buffer.from('GIF89a не pdf'), 'not_pdf'],
  ])('%s → failed(%s), различимо по id; файл удалён ПОСЛЕ ОТКАЗА (ADR-018)', async (_t, make, reason) => {
    const owner = await account();
    const created = await pdfJob(owner, make());
    expect(await run(created.indexJobId)).toBe('failed');
    expect(await readIndexJob(pool, created.indexJobId, { accountId: owner })).toMatchObject({ state: 'failed', reason });
    expect((await pool.query('SELECT status FROM source WHERE id = $1', [created.sourceId])).rows[0].status).toBe('failed');
    expect(existsSync(join(dir, created.indexJobId))).toBe(false);
  }, 30_000);

  it('файла нет в томе (удалён после прошлого завершения) → failed(internal), а не done с пустым источником', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const created = await createSourceJob(pool, { botId, kind: 'pdf', fileName: 'a.pdf', idempotencyKey: randomUUID() });
    expect(await run(created.indexJobId)).toBe('failed');
    expect((await job(created.indexJobId)).failure_reason).toBe('internal');
  });

  it('фенс перехвачен во время разбора → stale, файл НЕ удалён (он нужен новой попытке), страниц не записано', async () => {
    const owner = await account();
    const created = await pdfJob(owner, normalPdf());
    const steal = async (bytes: Buffer) => {
      await transaction(pool, (tx) => closeFailedTx(tx, created.indexJobId, 'stalled', new Date()));
      return extractPdf(bytes);
    };
    expect(await run(created.indexJobId, steal)).toBe('stale');
    expect(existsSync(join(dir, created.indexJobId))).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM page WHERE source_id = $1', [created.sourceId])).rows[0].n).toBe(0);
  });

  it('подметание тома: удаляет файлы завершённых и несуществующих задач, оставляет живые, свежие и чужие имена', async () => {
    const owner = await account();
    const done = await pdfJob(owner, normalPdf());
    await pool.query(`UPDATE index_job SET status = 'done' WHERE id = $1`, [done.indexJobId]);
    const alive = await pdfJob(owner, normalPdf());
    const orphan = randomUUID(), fresh = randomUUID();
    for (const name of [orphan, fresh, 'README']) writeFileSync(join(dir, name), 'x');
    const old = new Date(Date.now() - 3600_000);
    for (const name of [done.indexJobId, alive.indexJobId, orphan, 'README']) utimesSync(join(dir, name), old, old);
    expect(await sweepUploads(pool, dir)).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([alive.indexJobId, fresh, 'README'].sort());
  });

  it('SC-US-004-3 параллельно: 6 загрузок на free при 2 PDF → ровно 1 принята, 5 — plan_limit', async () => {
    const owner = await account('free');
    const botId = await bot(owner);
    for (let i = 0; i < 2; i++) await createSourceJob(pool, { botId, kind: 'pdf', fileName: `${i}.pdf`, idempotencyKey: randomUUID() });
    // Прогрев 6 соединений пула: иначе первая транзакция успевает завершиться, пока остальные ещё
    // открывают соединение, и гонка «прочитать, потом записать» не возникает (мутация plan-limit-unlocked
    // дважды прошла незамеченной на прогоне chunk-embed).
    await Promise.all(Array.from({ length: 6 }, () => pool.query('SELECT pg_sleep(0.05)')));
    const results = await Promise.all(Array.from({ length: 6 }, () => createPdfSource(pool,
      { accountId: owner, botId, fileName: 'x.pdf', idempotencyKey: randomUUID(), indexJobId: randomUUID() })));
    expect(results.filter((r) => r.kind === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'plan_limit')).toHaveLength(5);
    expect((await pool.query(`SELECT count(*)::int AS n FROM source WHERE bot_id = $1 AND kind = 'pdf'`, [botId])).rows[0].n).toBe(3);
    // Отказавший PDF место не занимает.
    await pool.query(`UPDATE source SET status = 'failed' WHERE bot_id = $1 AND file_name = '0.pdf'`, [botId]);
    expect((await readOwnedBotForPdf(pool, botId, owner))!.pdfCount).toBe(2);
  });

  it('параллельный повтор с ОДНИМ ключом → одна задача, один источник, тот же id у всех', async () => {
    const owner = await account('nobadge');
    const botId = await bot(owner);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => createPdfSource(pool, { accountId: owner, botId, fileName: 'x.pdf', idempotencyKey: key, indexJobId: randomUUID() })));
    const ids = new Set(results.map((r) => ('indexJobId' in r ? r.indexJobId : null)));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.kind === 'created')).toHaveLength(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM source WHERE bot_id = $1', [botId])).rows[0].n).toBe(1);
  });

  it('чужой, черновой и удалённый бот — not_found; неизвестный план аккаунта читается как free (3)', async () => {
    const owner = await account(), stranger = await account();
    const own = await bot(owner);
    for (const [acc, b] of [[stranger, own], [owner, await bot(owner, 'draft')], [owner, await bot(owner, 'deleted')]] as const) {
      expect(await readOwnedBotForPdf(pool, b, acc)).toBeNull();
      expect((await createPdfSource(pool, { accountId: acc, botId: b, fileName: 'x.pdf', idempotencyKey: randomUUID(), indexJobId: randomUUID() })).kind).toBe('not_found');
    }
    expect(pdfLimitFor('free')).toBe(3);
  });

  it('маршрут целиком на настоящей БД: 202 → строка задачи ЕСТЬ и файл под её id ЕСТЬ; повтор — тот же id', async () => {
    const owner = await account();
    const botId = await bot(owner);
    const enqueued: string[] = [];
    const handler = createSourceUploadHandler({
      publicOrigin: ORIGIN, uploadDir: dir, log: () => {},
      authenticate: async () => ({ account_id: owner }), allowMutation: async () => true,
      readOwnedBot: (b, a) => readOwnedBotForPdf(pool, b, a), pdfLimit: pdfLimitFor,
      findJob: (b, k) => findJobByIdempotencyKey(pool, b, k), createPdfSource: (input) => createPdfSource(pool, input),
      enqueue: async (m) => { enqueued.push(m.index_job_id); },
    });
    const key = randomUUID();
    const send = () => {
      const body = multipart(normalPdf(), 'прайс.pdf');
      return handler(new Request(`${ORIGIN}/api/bots/${botId}/sources`, { method: 'POST', body: new Uint8Array(body), headers: {
        'x-forwarded-for': '198.51.100.7', origin: ORIGIN, cookie: `__Host-n6_session=${'b'.repeat(43)}`, 'idempotency-key': key,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`, 'content-length': String(body.length) } }), botId);
    };
    const first = await send();
    expect(first.status).toBe(202);
    const id = ((await first.json()) as { data: { index_job_id: string } }).data.index_job_id;
    expect((await job(id))).toMatchObject({ status: 'queued', bot_id: botId });
    expect((await pool.query('SELECT kind, file_name FROM source WHERE id = (SELECT source_id FROM index_job WHERE id = $1)', [id])).rows[0])
      .toEqual({ kind: 'pdf', file_name: 'прайс.pdf' });
    expect(readdirSync(dir)).toEqual([id]);
    const second = await send();
    expect(((await second.json()) as { data: { index_job_id: string } }).data.index_job_id).toBe(id);
    expect(readdirSync(dir)).toEqual([id]);
    expect(enqueued).toEqual([id]);
    // И задача доходит до done тем же воркером.
    expect(await run(id)).toBe('done');
    expect(readdirSync(dir)).toEqual([]);
  });
});
