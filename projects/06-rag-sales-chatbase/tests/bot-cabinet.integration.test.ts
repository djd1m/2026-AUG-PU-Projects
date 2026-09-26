// bot-cabinet на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: CreateBot и предел плана (последовательно и одновременно),
// список, настройки и контакт, AddAllowedOrigin (нормализация, предел 20 под одновременной записью), сайт-источник
// (CheckAddress до записи, идемпотентность), «Повторить», тестовый чат владельца (квота бота ДО эмбеддинга, журнал
// вопросов не трогается), и ВЛАДЕНИЕ: чужой бот → один и тот же 404 на каждом маршруте кабинета. Связка — боевая
// createCabinetDependencies + настоящие AuthService/PgAuthStore; подменены только сеть (DNS, шлюз модели), очередь и
// ограничитель двери.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPool, createPdfSource, findJobByIdempotencyKey, pdfLimitFor, readBotCabinet, readIndexJob, readOwnedBotForPdf, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { loadCeilings } from '../packages/rag/src/index';
import { installSnippet } from '../packages/rag/src/bot-settings';
import { createCabinetDependencies } from '../apps/web/src/server/cabinet-deps';
import { createBotCreateHandler, createBotPatchHandler, createBotsListHandler, createOriginAddHandler, createOwnerAskHandler,
  createSiteSourceHandler, createSourceRetryHandler } from '../apps/web/src/server/cabinet-handler';
import { createSourceUploadHandler } from '../apps/web/src/server/source-upload-handler';
import { createIndexJobReadHandler } from '../apps/web/src/server/index-job-handler';
import { AuthService } from '../apps/web/src/server/auth';
import { PgAuthStore } from '../apps/web/src/server/auth-store';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
import { vectorFor } from './fixtures/fake-embeddings';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const databaseUrl = process.env.DATABASE_URL;
const ORIGIN = 'https://sufler.test.invalid';
const PRICE = 'Прайс: доставка по Москве от 350 ₽, самовывоз со склада бесплатно.';
const DNS: Record<string, string[]> = { 'kolos.example': ['93.184.216.34'], 'inside.example': ['93.184.216.36', '10.0.0.5'] };
const uuid = () => crypto.randomUUID();
type Json = { data?: Record<string, unknown>; error?: { code: string; message: string; field?: string } };

describe.skipIf(!databaseUrl)('bot-cabinet на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  const schema = `bot_cabinet_${randomBytes(8).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  function wire() {
    const gateway = fakeAnswerGateway((call) => ({ status: 'answered', text: 'Доставка по Москве — от 350 ₽.',
      citations: [call.messages[1]!.content.includes('<материал id="F1"') ? 'F1' : 'F9'] }));
    gateway.vector = (text) => (/доставк/i.test(text) ? vectorFor(PRICE) : vectorFor(text));
    const h = answerHarness(gateway);
    const auth = new AuthService(new PgAuthStore(pool), secret);
    const enqueued: Array<{ index_job_id: string; generation: number }> = [];
    const lookups: string[] = [];
    const deps = createCabinetDependencies({
      pool, ceilings: loadCeilings(environment()), publicOrigin: ORIGIN, client: h.client, models: MODELS, spend: h.spend,
      allowMutation: async () => true, authenticate: (token) => auth.authenticate(token), enqueue: async (m) => { enqueued.push(m); },
      resolver: async (host) => { lookups.push(host); const ips = DNS[host]; if (!ips) throw new Error('ENOTFOUND'); return ips; }, log: () => {},
    });
    const headers = (token: string, extra: Record<string, string> = {}) => ({ origin: ORIGIN, 'x-forwarded-for': '93.184.1.7',
      'content-type': 'application/json', cookie: `__Host-n6_session=${token}`, ...extra });
    const req = (method: string, url: string, token: string, body?: unknown, extra: Record<string, string> = {}) =>
      new Request(`${ORIGIN}${url}`, { method, headers: headers(token, extra), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const out = async (response: Response) => ({ status: response.status, body: await response.json() as Json });
    const handlers = {
      list: createBotsListHandler(deps), create: createBotCreateHandler(deps), patch: createBotPatchHandler(deps), origin: createOriginAddHandler(deps),
      site: createSiteSourceHandler(deps), retry: createSourceRetryHandler(deps), ask: createOwnerAskHandler(deps),
      pdf: createSourceUploadHandler({ publicOrigin: ORIGIN, uploadDir: mkdtempSync(path.join(tmpdir(), 'n6-cab-up-')), authenticate: (t) => auth.authenticate(t),
        allowMutation: async () => true, readOwnedBot: (b, a) => readOwnedBotForPdf(pool, b, a), pdfLimit: pdfLimitFor,
        findJob: (b, k) => findJobByIdempotencyKey(pool, b, k), createPdfSource: (i) => createPdfSource(pool, i), enqueue: async () => {} }),
      job: createIndexJobReadHandler({ authenticate: (t) => auth.authenticate(t), resolvePreviewBot: async () => null, read: (id, a) => readIndexJob(pool, id, a) }),
    };
    return {
      h, deps, auth, enqueued, lookups,
      list: async (t: string) => out(await handlers.list(req('GET', '/api/bots', t))),
      create: async (t: string, body: unknown) => out(await handlers.create(req('POST', '/api/bots', t, body))),
      patch: async (t: string, bot: string, body: unknown) => out(await handlers.patch(req('PATCH', `/api/bots/${bot}`, t, body), bot)),
      origin: async (t: string, bot: string, domain: unknown) => out(await handlers.origin(req('POST', `/api/bots/${bot}/origins`, t, { domain }), bot)),
      site: async (t: string, bot: string, url: string, key = uuid()) => out(await handlers.site(req('POST', `/api/bots/${bot}/sources`, t, { url }, { 'idempotency-key': key }), bot)),
      pdf: async (t: string, bot: string) => {
        const body = '--b\r\nContent-Disposition: form-data; name="file"; filename="p.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 x\r\n--b--\r\n';
        return out(await handlers.pdf(new Request(`${ORIGIN}/api/bots/${bot}/sources`, { method: 'POST', body, headers: { ...headers(t),
          'content-type': 'multipart/form-data; boundary=b', 'content-length': String(Buffer.byteLength(body)), 'idempotency-key': uuid() } }), bot));
      },
      retry: async (t: string, source: string) => out(await handlers.retry(req('POST', `/api/sources/${source}/reindex`, t, {}), source)),
      ask: async (t: string, bot: string, body: unknown) => out(await handlers.ask(req('POST', `/api/bots/${bot}/ask`, t, body), bot)),
      job: async (t: string, id: string) => out(await handlers.job(req('GET', `/api/index-jobs/${id}`, t), id)),
    };
  }
  let n = 0;
  async function account(w: ReturnType<typeof wire>, plan: 'free' | 'nobadge' | 'studio' = 'free') {
    const token = await w.auth.register(`owner-${n++}-${randomBytes(4).toString('hex')}@example.org`, 'пароль-надёжный-1', '93.184.1.0/24');
    const accountId = (await w.auth.authenticate(token))!.account_id;
    if (plan !== 'free') await pool.query('UPDATE account SET plan = $2 WHERE id = $1', [accountId, plan]);
    return { token, accountId };
  }
  async function bot(w: ReturnType<typeof wire>, token: string, contact = '+7 900 000-00-00') {
    const r = await w.create(token, { company_name: 'Пекарня «Колос»', contact, greeting: 'Здравствуйте!' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return String(r.body.data!.bot_id);
  }
  const count = async (sql: string, params: unknown[] = []) => Number((await pool.query<{ n: number }>(sql, params)).rows[0]!.n);
  async function indexed(botId: string, status: 'done' | 'failed' = 'done', kind: 'site' | 'pdf' = 'site') {
    const source = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, file_name, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [botId, kind, kind === 'site' ? 'https://kolos.example/' : null, kind === 'pdf' ? 'прайс.pdf' : null, status === 'done' ? 'ready' : 'failed'])).rows[0]!.id;
    const job = (await pool.query<{ id: string }>(`INSERT INTO index_job (bot_id, source_id, idempotency_key, status, failure_reason, current_fence, pages_done, pages_total)
      VALUES ($1, $2, $3, $4, $5, 1, 1, 1) RETURNING id`, [botId, source, uuid(), status, status === 'failed' ? 'unreachable' : null])).rows[0]!.id;
    if (status === 'done') {
      const page = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'https://kolos.example/ceny', 'Цены', $3) RETURNING id`,
        [source, botId, createHash('sha256').update(PRICE + botId).digest('hex')])).rows[0]!.id;
      await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding) VALUES ($1, $2, $3, 0, 'Цены', $4, 20, $5::vector)`,
        [botId, source, page, PRICE, `[${vectorFor(PRICE).join(',')}]`]);
    }
    return { source, job };
  }

  it('SC-US-012-3 и FR-TARIFF-003: free — 1 бот, второй 403 с названием предела; studio — 10, 11-й отказ; список только свой', async () => {
    const w = wire();
    const free = await account(w);
    await bot(w, free.token);
    const second = await w.create(free.token, { company_name: 'Второй' });
    expect(second.status).toBe(403);
    expect(second.body.error).toMatchObject({ code: 'plan_limit' });
    expect(second.body.error!.message).toContain('Предел плана free: не больше 1 бота');
    const studio = await account(w, 'studio');
    for (let i = 0; i < 10; i++) expect((await w.create(studio.token, { company_name: `Клиент ${i + 1}` })).status).toBe(201);
    const eleventh = await w.create(studio.token, { company_name: 'Клиент 11' });
    expect(eleventh.status).toBe(403);
    expect(eleventh.body.error!.message).toContain('Предел плана studio: не больше 10 ботов');
    expect(await count('SELECT count(*)::int AS n FROM bot WHERE account_id = $1', [studio.accountId])).toBe(10);
    const listed = await w.list(free.token);
    expect(listed.body.data).toMatchObject({ plan: 'free', limit: 1 });
    expect((listed.body.data!.bots as unknown[]).length).toBe(1);
    expect(((await w.list(studio.token)).body.data!.bots as unknown[]).length).toBe(10);
  });

  it('CreateBot одновременно: 6 создания на free одним аккаунтом → ровно 1 бот, 5 × 403 (блокировка строки аккаунта)', async () => {
    const w = wire();
    for (let round = 0; round < 3; round++) {
      const a = await account(w);
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => w.create(a.token, { company_name: `Бот ${i}` })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 403, 403, 403, 403, 403]);
      expect(await count(`SELECT count(*)::int AS n FROM bot WHERE account_id = $1 AND status <> 'deleted'`, [a.accountId])).toBe(1);
    }
  });

  it('FR-BOT-001: настройки — контакт проверяется (почта, телефон, https), стереть нельзя; публичный ключ 22 символа', async () => {
    const w = wire();
    const a = await account(w);
    const id = String((await w.create(a.token, { company_name: '  Пекарня   «Колос» ' })).body.data!.bot_id);
    const row = (await pool.query('SELECT company_name, contact, greeting, status, public_key FROM bot WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ company_name: 'Пекарня «Колос»', contact: null, greeting: '', status: 'active' });
    expect(row.public_key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    for (const bad of ['', 'позвоните нам', 'javascript:alert(1)', 'http://kolos.example', '123', 'a@b', 'x\ny@z.ru']) {
      const r = await w.patch(a.token, id, { contact: bad });
      expect(r.status, bad).toBe(422);
      expect(r.body.error).toMatchObject({ code: 'invalid_contact', field: 'contact' });
    }
    expect((await w.patch(a.token, id, { contact: 'Info@Kolos.Example' })).body.data).toMatchObject({ contact: 'info@kolos.example' });
    expect((await w.patch(a.token, id, { contact: '+7 (900) 000-00-00' })).body.data).toMatchObject({ contact: '+7 (900) 000-00-00' });
    expect((await w.patch(a.token, id, { contact: 'https://t.me/kolos', greeting: 'Спросите о хлебе' })).body.data)
      .toMatchObject({ contact: 'https://t.me/kolos', greeting: 'Спросите о хлебе' });
    expect((await w.patch(a.token, id, { bot_id: id })).status).toBe(400);
    expect((await w.patch(a.token, id, {})).status).toBe(400);
  });

  it('SC-US-005-2: домен → origin https://домен; дубль не множится; путь, IP, свой origin — 422; не больше 20 доменов даже одновременно', async () => {
    const w = wire();
    const a = await account(w);
    const id = await bot(w, a.token);
    const added = await w.origin(a.token, id, 'Shop.Example');
    expect(added).toEqual({ status: 201, body: { data: { origin: 'https://shop.example' } } });
    expect((await w.origin(a.token, id, 'https://shop.example/')).status).toBe(200);
    expect((await w.origin(a.token, id, 'http://stand.example:8099')).body.data).toEqual({ origin: 'http://stand.example:8099' });
    for (const bad of ['shop.example/catalog', '10.0.0.5', '93.184.216.34', 'localhost', ORIGIN, 'ftp://shop.example', 'user:pw@shop.example', '']) {
      const r = await w.origin(a.token, id, bad);
      expect(r.status, bad).toBe(422);
      expect(r.body.error!.code).toBe('invalid_origin');
    }
    for (let i = 0; i < 16; i++) expect((await w.origin(a.token, id, `s${i}.example`)).status).toBe(201);
    // 18 доменов; 5 одновременных добавлений при остатке 2 → ровно 2 проходят.
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => w.origin(a.token, id, `race${i}.example`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 403)).toHaveLength(3);
    expect(await count('SELECT count(*)::int AS n FROM allowed_origin WHERE bot_id = $1', [id])).toBe(20);
  });

  it('сайт-источник: адрес внутренней сети — 422 до записи и постановки; адрес — 202 и задача queued; повтор ключа — та же задача', async () => {
    const w = wire();
    const a = await account(w);
    const id = await bot(w, a.token);
    for (const url of ['http://127.0.0.1/', 'inside.example', 'http://169.254.169.254/']) expect((await w.site(a.token, id, url)).status, url).toBe(422);
    expect(await count('SELECT count(*)::int AS n FROM source WHERE bot_id = $1', [id])).toBe(0);
    expect(w.enqueued).toEqual([]);
    const key = uuid();
    const r = await w.site(a.token, id, 'kolos.example', key);
    expect(r.status).toBe(202);
    const jobId = String(r.body.data!.index_job_id);
    expect(w.enqueued).toEqual([{ index_job_id: jobId, generation: 0 }]);
    expect((await w.site(a.token, id, 'kolos.example', key)).body.data).toEqual({ index_job_id: jobId });
    expect(w.enqueued).toHaveLength(1);
    const cabinet = await readBotCabinet(pool, id, a.accountId);
    expect(cabinet!.sources).toHaveLength(1);
    expect(cabinet!.sources[0]).toMatchObject({ kind: 'site', title: 'https://kolos.example/', job: { index_job_id: jobId, state: 'running', queued: true } });
  });

  it('«Повторить»: отказавший сайт — тот же index_job_id, фенс +1, queued; готовый — 409; PDF после отказа — 409 «загрузите заново»', async () => {
    const w = wire();
    const a = await account(w, 'nobadge');
    const id = await bot(w, a.token);
    const failed = await indexed(id, 'failed');
    const r = await w.retry(a.token, failed.source);
    expect(r).toEqual({ status: 202, body: { data: { index_job_id: failed.job } } });
    expect(w.enqueued).toEqual([{ index_job_id: failed.job, generation: 2 }]);
    expect((await pool.query('SELECT status, failure_reason, current_fence FROM index_job WHERE id = $1', [failed.job])).rows[0])
      .toEqual({ status: 'queued', failure_reason: null, current_fence: '2' });
    expect((await w.retry(a.token, failed.source)).status).toBe(409);            // уже queued
    const done = await indexed(id, 'done');
    expect((await w.retry(a.token, done.source)).body.error!.code).toBe('not_failed');
    const pdf = await indexed(id, 'failed', 'pdf');
    expect((await w.retry(a.token, pdf.source)).body.error!.code).toBe('reupload');
  });

  it('тестовый чат владельца: ответ с развёрнутой цитатой, «не знаю» без модели, квота бота ДО эмбеддинга, журнал вопросов не пишется', async () => {
    const w = wire();
    const a = await account(w);
    const id = await bot(w, a.token);
    await indexed(id);
    const r = await w.ask(a.token, id, { question: 'Сколько стоит доставка по Москве?' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'answered', text: 'Доставка по Москве — от 350 ₽.', source: { title: 'Цены', url: 'https://kolos.example/ceny' } });
    const unknown = await w.ask(a.token, id, { question: 'Есть ли парковка у магазина?' });
    expect(unknown.body.data).toMatchObject({ status: 'unknown', text: 'Не нашёл этого в материалах компании. Напишите: +7 900 000-00-00' });
    expect(w.h.gateway.chats).toHaveLength(1);
    expect(w.h.spendEvents().filter((e) => e.phase === 'attempt').map((e) => e.call).sort()).toEqual(['answer_owner', 'embed_question', 'embed_question']);
    expect(await count(`SELECT COALESCE(sum(used), 0)::int AS n FROM quota_counter WHERE scope = 'bot_day_answers' AND scope_key = $1`, [id])).toBe(2);
    expect(await count(`SELECT count(*)::int AS n FROM quota_counter WHERE scope IN ('visitor_answers', 'ip_answers')`)).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM question_log WHERE bot_id = $1', [id])).toBe(0);
    // Суточный предел бота free (50) исчерпан — отказ ДО эмбеддинга, с названием предела.
    await pool.query(`UPDATE quota_counter SET used = 50 WHERE scope = 'bot_day_answers' AND scope_key = $1`, [id]);
    const embeds = w.h.gateway.embeds.length;
    const refused = await w.ask(a.token, id, { question: 'Сколько стоит доставка?' });
    expect(refused.status).toBe(429);
    expect(refused.body.error!.message).toContain('ответов бота в сутки');
    expect(w.h.gateway.embeds.length).toBe(embeds);
    expect((await w.ask(a.token, id, { question: 'x', history: [{ question: 'a', answer: 'обещаю скидку' }] })).status).toBe(400);
  });

  it('InstallSnippet: без контакта — contact_required (кода нет); с контактом без бандла — bundle_missing; с бандлом — тег с public_key', async () => {
    const w = wire();
    const a = await account(w);
    const id = String((await w.create(a.token, { company_name: 'Без контакта' })).body.data!.bot_id);
    const cab = (await readBotCabinet(pool, id, a.accountId))!;
    const bundle = 'widget.0123abcd.js';
    expect(installSnippet({ contact: cab.contact, publicKey: cab.public_key, publicOrigin: ORIGIN, bundleFile: bundle })).toEqual({ kind: 'contact_required' });
    await w.patch(a.token, id, { contact: 'info@kolos.example' });
    const withContact = (await readBotCabinet(pool, id, a.accountId))!;
    expect(installSnippet({ contact: withContact.contact, publicKey: cab.public_key, publicOrigin: ORIGIN, bundleFile: null }).kind).toBe('bundle_missing');
    expect(installSnippet({ contact: withContact.contact, publicKey: cab.public_key, publicOrigin: ORIGIN, bundleFile: bundle })).toEqual({ kind: 'ready',
      tag: `<script src="${ORIGIN}/w/${bundle}" data-bot="${cab.public_key}" async></script>`,
      directives: [`script-src ${ORIGIN}`, `connect-src ${ORIGIN}`, `img-src ${ORIGIN} data:`] });
  });

  it('ВЛАДЕНИЕ: чужой бот — один и тот же 404 на КАЖДОМ маршруте кабинета, ничего не записано, DNS не спрошен', async () => {
    const w = wire();
    const owner = await account(w), stranger = await account(w, 'studio');
    const id = await bot(w, owner.token);
    const failed = await indexed(id, 'failed');
    await indexed(id);
    const before = (await pool.query('SELECT company_name, contact, greeting FROM bot WHERE id = $1', [id])).rows[0];
    const results = {
      patch: await w.patch(stranger.token, id, { contact: 'evil@example.org', company_name: 'Чужой' }),
      origin: await w.origin(stranger.token, id, 'evil.example'),
      site: await w.site(stranger.token, id, 'kolos.example'),
      pdf: await w.pdf(stranger.token, id),
      retry: await w.retry(stranger.token, failed.source),
      ask: await w.ask(stranger.token, id, { question: 'Сколько стоит доставка по Москве?' }),
      job: await w.job(stranger.token, failed.job),
    };
    for (const [route, r] of Object.entries(results)) {
      expect(r.status, route).toBe(404);
      expect(r.body.error!.code, route).toBe('not_found');
    }
    // Несуществующий бот — тот же ответ (нельзя отличить чужой от несуществующего).
    const ghost = uuid();
    for (const r of [await w.patch(stranger.token, ghost, { greeting: 'x' }), await w.origin(stranger.token, ghost, 'a.example'), await w.ask(stranger.token, ghost, { question: 'x' })]) {
      expect(r).toEqual({ status: 404, body: { error: { code: 'not_found', message: 'Бот не найден' } } });
    }
    expect(await readBotCabinet(pool, id, stranger.accountId)).toBeNull();
    expect((await pool.query('SELECT company_name, contact, greeting FROM bot WHERE id = $1', [id])).rows[0]).toEqual(before);
    expect(await count('SELECT count(*)::int AS n FROM allowed_origin WHERE bot_id = $1', [id])).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM source WHERE bot_id = $1', [id])).toBe(2);
    expect((await pool.query('SELECT status FROM index_job WHERE id = $1', [failed.job])).rows[0]!.status).toBe('failed');
    expect(w.lookups).toEqual([]);
    expect(w.h.gateway.embeds).toEqual([]);
    expect(await count(`SELECT count(*)::int AS n FROM quota_counter WHERE scope_key = $1`, [id])).toBe(0);
    // Без сессии: маршрут бота — 404, список — 401.
    expect((await w.patch('A'.repeat(43), id, { greeting: 'x' })).status).toBe(404);
    expect((await w.list('A'.repeat(43))).status).toBe(401);
    // Владелец свой бот видит.
    expect((await w.patch(owner.token, id, { greeting: 'Свой' })).status).toBe(200);
  });
});
