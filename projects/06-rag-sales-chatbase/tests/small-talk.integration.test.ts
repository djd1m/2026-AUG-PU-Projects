// small-talk (A-N6-074) на НАСТОЯЩЕМ Postgres 16 + pgvector: POST /w/v1/ask по боевой связке createWidgetAskDependencies
// (подменены только шлюз модели и ограничитель двери). «Привет» → шаблон с темами из заголовков страниц бота: 0 эмбеддингов,
// 0 вызовов модели, 0 строк quota_counter, 0 строк журнала расхода, исход small_talk без текста. Не по теме — «не знаю» по сайту
// с контактом. Итоговый CHECK question_log.outcome после миграций = QUESTION_OUTCOME кода.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPool, readBotPageTitles, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { loadCeilings, QUESTION_OUTCOME } from '../packages/rag/src/index';
import { createWidgetAskDependencies } from '../apps/web/src/server/widget-ask-deps';
import { createWidgetAskHandler } from '../apps/web/src/server/widget-ask-handler';
import { createWidgetConfigHandler, createWidgetEventHandler } from '../apps/web/src/server/widget-handler';
import { parseAsk } from '../apps/widget/src/api';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
import { vectorFor } from './fixtures/fake-embeddings';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const HOST = 'https://shop.example';
const CONTACT = '+7 900 000-00-00';
const PRICE = 'Прайс: доставка по Москве от 350 ₽, самовывоз со склада бесплатно.';
type Json = { data?: { status?: string; text?: string; contact?: string; reason?: string } };
// Разбор ответа ПРЕЖНЕГО бандла виджета (apps/widget/src/api.ts на bf7ab6d0, ветка 200 дословно): он остаётся в кэше
// посетителей, пока не истечёт; новый ответ сервера обязан быть ему понятен.
function parseAskBeforeSmallTalk(status: number, value: unknown): { kind: string; text?: string } {
  if (typeof value !== 'object' || value === null || status !== 200) return { kind: 'error' };
  const data = (value as { data?: Record<string, unknown> }).data;
  if (!data) return { kind: 'error' };
  const text = typeof data.text === 'string' && data.text.length <= 4000 ? data.text : null;
  if (data.status === 'answered' && text) return { kind: 'answered', text };
  if (data.status === 'unknown' && text) return { kind: 'unknown', text };
  return { kind: 'error' };
}

describe.skipIf(!databaseUrl)('small-talk: POST /w/v1/ask на настоящем Postgres', () => {
  let pool: Pool;
  const schema = `small_talk_${randomBytes(8).toString('hex')}`;
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
    const gateway = fakeAnswerGateway(() => ({ status: 'answered', text: 'Доставка по Москве — от 350 ₽.', citations: ['F1'] }));
    gateway.vector = (text) => (/доставк/i.test(text) ? vectorFor(PRICE) : vectorFor(text));
    const h = answerHarness(gateway);
    const deps = createWidgetAskDependencies({ pool, ceilings: loadCeilings(environment()), publicOrigin: PUBLIC, secret, client: h.client, models: MODELS,
      spend: h.spend, allowMutation: async () => true, log: () => {} });
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.23', origin: HOST };
    const config = createWidgetConfigHandler(deps), event = createWidgetEventHandler(deps), ask = createWidgetAskHandler(deps);
    return {
      h,
      visitor: async (key: string) => {
        const r = await config(new Request(`${PUBLIC}/w/v1/config?bot=${key}`, { headers }));
        const token = ((await r.json()) as { data: { visitor_session: string } }).data.visitor_session;
        expect((await event(new Request(`${PUBLIC}/w/v1/event`, { method: 'POST', headers,
          body: JSON.stringify({ bot: key, visitor_session: token, type: 'badge_impression' }) }))).status).toBe(204);
        return token;
      },
      ask: async (key: string, visitorSession: string, question: string) => {
        const r = await ask(new Request(`${PUBLIC}/w/v1/ask?bot=${key}`, { method: 'POST', headers, body: JSON.stringify({ visitor_session: visitorSession, question }) }));
        return { status: r.status, acao: r.headers.get('access-control-allow-origin'), body: await r.json() as Json };
      },
    };
  }
  // Порядок обхода: главная, затем разделы; пропущенная страница в темы не попадает. paths — context_path фрагментов по
  // порядку (по умолчанию один фрагмент с путём = заголовок страницы, как у страницы без разделов).
  type SeedPage = { url: string; title: string; skipped?: string | null; paths?: string[] };
  const KOLOS: SeedPage[] = [{ url: 'https://kolos.example/', title: 'Главная | Колос' }, { url: 'https://kolos.example/ceny', title: 'Цены — Колос' },
    { url: 'https://kolos.example/secret', title: 'Черновик', skipped: 'no_text' }, { url: 'https://kolos.example/dostavka', title: 'Доставка и оплата' },
    { url: 'https://kolos.example/torty', title: 'Торты' }];
  async function seed(pages: SeedPage[] = KOLOS) {
    const account = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
      [`s${randomBytes(6).toString('hex')}@example.ru`])).rows[0]!.id;
    const key = randomBytes(16).toString('base64url');
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact)
      VALUES ($1, 'active', $2, 'Колос', $3) RETURNING id`, [account, key, CONTACT])).rows[0]!.id;
    await pool.query('INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, $2)', [bot, HOST]);
    const source = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, status) VALUES ($1, 'site', 'https://kolos.example/', 'ready') RETURNING id`, [bot])).rows[0]!.id;
    for (const { url, title, skipped = null, paths = [title] } of pages) {
      const page = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash, skipped_reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [source, bot, url, title, createHash('sha256').update(url + bot).digest('hex'), skipped])).rows[0]!.id;
      if (!skipped) {
        for (const [ordinal, path] of paths.entries()) await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding) VALUES ($1, $2, $3, $4, $5, $6, 20, $7::vector)`,
          [bot, source, page, ordinal, path, PRICE, `[${vectorFor(PRICE).join(',')}]`]);
      }
      await pool.query('SELECT pg_sleep(0.01)');   // created_at различим — порядок обхода детерминирован
    }
    await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [bot]);
    return { bot, key };
  }
  const quotaRows = async () => Number((await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM quota_counter')).rows[0]!.n);

  it('«привет!» → 200 small_talk с темами из заголовков; 0 эмбеддингов, 0 моделей, 0 списаний; small_talk без текста в журнале', async () => {
    const w = wire();
    const s = await seed();
    const vs = await w.visitor(s.key);
    const before = await quotaRows();
    const r = await w.ask(s.key, vs, 'привет!');
    expect(r.status).toBe(200);
    expect(r.acao).toBe(HOST);
    const HELLO = 'Здравствуйте! Я бот компании «Колос», отвечаю только по материалам сайта. Например, спросите о темах: Цены, Доставка и оплата, Торты.';
    expect(r.body.data).toEqual({ status: 'unknown', reason: 'small_talk', contact: CONTACT, text: HELLO });
    // Ревью круг 1: бандл виджета у посетителей кэширован (immutable) — ПРЕЖНИЙ разбор ответа обязан показать шаблон.
    expect(parseAskBeforeSmallTalk(r.status, r.body)).toEqual({ kind: 'unknown', text: HELLO });
    expect(parseAsk(r.status, r.body)).toEqual({ kind: 'small_talk', text: HELLO });
    expect(w.h.gateway.embeds).toHaveLength(0);
    expect(w.h.gateway.chats).toHaveLength(0);
    expect(w.h.spendEvents()).toEqual([]);
    expect(await quotaRows()).toBe(before);
    const log = (await pool.query('SELECT outcome, text, text_expires_at FROM question_log WHERE bot_id = $1', [s.bot])).rows;
    expect(log).toEqual([{ outcome: 'small_talk', text: null, text_expires_at: null }]);
    // Светская реплика — не установка и не ход истории.
    expect((await pool.query('SELECT first_answer_at FROM widget_install WHERE bot_id = $1', [s.bot])).rows.every((row) => row.first_answer_at === null)).toBe(true);
    expect((await pool.query('SELECT history FROM visitor_session WHERE bot_id = $1', [s.bot])).rows[0]?.history ?? []).toEqual([]);
  });

  it('«Спасибо!» и «Какая погода в Москве?»: благодарность — шаблон; не по теме — «не знаю» по сайту компании с контактом, модель НЕ вызвана', async () => {
    const w = wire();
    const s = await seed();
    const vs = await w.visitor(s.key);
    expect((await w.ask(s.key, vs, 'Спасибо!')).body.data).toEqual({ status: 'unknown', reason: 'small_talk', contact: CONTACT,
      text: 'Пожалуйста! Если появятся ещё вопросы — спрашивайте.' });
    const off = await w.ask(s.key, vs, 'Какая погода в Москве?');
    expect(off.body.data).toMatchObject({ status: 'unknown', reason: 'below_threshold', contact: CONTACT,
      text: `Я отвечаю только по материалам сайта компании «Колос» и не нашёл там ответа на этот вопрос. Напишите: ${CONTACT}` });
    expect(w.h.gateway.embeds).toHaveLength(1);
    expect(w.h.gateway.chats).toHaveLength(0);
    const outcomes = (await pool.query('SELECT outcome FROM question_log WHERE bot_id = $1 ORDER BY created_at', [s.bot])).rows.map((row) => row.outcome);
    expect(outcomes).toEqual(['small_talk', 'unknown']);
  });

  it('«привет, сколько стоит доставка?» — вопрос по теме: обычный путь, ответ модели по фрагменту', async () => {
    const w = wire();
    const s = await seed();
    const vs = await w.visitor(s.key);
    const r = await w.ask(s.key, vs, 'привет, сколько стоит доставка?');
    expect(r.body.data).toMatchObject({ status: 'answered' });
    expect(w.h.gateway.chats).toHaveLength(1);
  });

  it('CHECK question_log.outcome после ВСЕХ миграций = QUESTION_OUTCOME; small_talk с текстом отвергает question_text_only_unknown', async () => {
    const def = (await pool.query<{ def: string }>(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'question_log'::regclass AND conname = 'question_log_outcome_check'`)).rows[0]!.def;
    expect([...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort()).toEqual([...QUESTION_OUTCOME].sort());
    const s = await seed();
    await expect(pool.query(`INSERT INTO question_log (bot_id, outcome, text, text_expires_at) VALUES ($1, 'small_talk', 'привет', now())`, [s.bot])).rejects.toThrow(/question_text_only_unknown/);
    await expect(pool.query(`INSERT INTO question_log (bot_id, outcome) VALUES ($1, 'smalltalk')`, [s.bot])).rejects.toThrow(/question_log_outcome_check/);
  });

  // A-N6-076 (дефект стенда 28.09): темой приветствия стал адрес `http://info.cern.ch` — у страницы <title> совпадал с адресом.
  it('темы — заголовок первого раздела или страницы, но не адрес, не пустое и не «404»; чужой бот и пропущенная страница не видны', async () => {
    const w = wire();
    await seed([{ url: 'https://other.example/', title: 'Чужая тема' }, { url: 'https://other.example/b', title: 'Ещё чужая' }]);
    const s = await seed([
      { url: 'http://kolos.example/', title: 'http://kolos.example', paths: ['http://kolos.example', 'http://kolos.example › Свежий хлеб каждый день'] },
      { url: 'http://kolos.example/empty', title: '', paths: ['Раздел без заголовка страницы'] },
      { url: 'http://kolos.example/404', title: '404' },
      { url: 'http://kolos.example/secret', title: 'Секретный раздел', skipped: 'no_text' },
      { url: 'http://kolos.example/dostavka', title: 'Доставка | Колос', paths: ['Доставка | Колос › Доставка и оплата › Сроки'] },
      { url: 'http://kolos.example/ceny', title: 'Цены' },
    ]);
    expect(await readBotPageTitles(pool, s.bot)).toEqual([
      { title: 'http://kolos.example', heading: 'Свежий хлеб каждый день' }, { title: '', heading: null }, { title: '404', heading: null },
      { title: 'Доставка | Колос', heading: 'Доставка и оплата' }, { title: 'Цены', heading: null },
    ]);
    const vs = await w.visitor(s.key);
    const r = await w.ask(s.key, vs, 'Привет!');
    expect(r.body.data).toEqual({ status: 'unknown', reason: 'small_talk', contact: CONTACT,
      text: 'Здравствуйте! Я бот компании «Колос», отвечаю только по материалам сайта. Например, спросите о темах: Свежий хлеб каждый день, Доставка и оплата, Цены.' });
  });

  it('сайт, у которого единственная страница — адрес (info.cern.ch): приветствие без списка тем, а не «о темах: http://…»', async () => {
    const w = wire();
    const s = await seed([{ url: 'http://info.cern.ch/', title: 'http://info.cern.ch', paths: ['http://info.cern.ch › http://info.cern.ch - home of the first website'] }]);
    const vs = await w.visitor(s.key);
    const text = (await w.ask(s.key, vs, 'привет')).body.data?.text ?? '';
    expect(text).toBe('Здравствуйте! Я бот компании «Колос», отвечаю только по материалам сайта. Задайте вопрос о том, что есть на сайте компании.');
    expect(text).not.toMatch(/http|info\.cern/);
    expect(w.h.gateway.embeds.length + w.h.gateway.chats.length).toBe(0);
  });
});
