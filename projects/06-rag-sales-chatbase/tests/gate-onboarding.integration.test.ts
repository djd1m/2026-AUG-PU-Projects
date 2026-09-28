// gate-onboarding (инцидент стенда 28.09, A-N6-066) на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: ворота A-N6-035 видны
// владельцу. Ответ ворот пишется в журнал исходом not_verified (без текста, без квоты, без модели), сводка и кабинет
// считают посетителей с заглушкой, снятие отметки базой оставляет пометку, тестовый чат владельца отвечает без отметки.
// Боевые связки createWidgetAskDependencies и createCabinetDependencies; подменены только шлюз модели и двери.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPool, readBotCabinet, readBotSummary, setAnswersVerified, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { loadCeilings } from '../packages/rag/src/index';
import { createWidgetAskDependencies } from '../apps/web/src/server/widget-ask-deps';
import { createWidgetAskHandler } from '../apps/web/src/server/widget-ask-handler';
import { createWidgetConfigHandler, createWidgetEventHandler } from '../apps/web/src/server/widget-handler';
import { createCabinetDependencies } from '../apps/web/src/server/cabinet-deps';
import { createOwnerAskHandler } from '../apps/web/src/server/cabinet-handler';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
import { vectorFor } from './fixtures/fake-embeddings';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const HOST = 'https://aicoding.example';
const CONTACT = '+7 900 000-00-00';
const PRICE = 'Прайс: доставка по Москве от 350 ₽, самовывоз со склада бесплатно.';
type Json = { data?: Record<string, unknown>; error?: { code: string } };

describe.skipIf(!databaseUrl)('gate-onboarding на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  const schema = `gate_onboarding_${randomBytes(8).toString('hex')}`;
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
    const ceilings = loadCeilings(environment());
    const deps = createWidgetAskDependencies({ pool, ceilings, publicOrigin: PUBLIC, secret, client: h.client, models: MODELS, spend: h.spend,
      allowMutation: async () => true, log: () => {} });
    const tokens = new Map<string, string>();
    const cabinet = createCabinetDependencies({ pool, ceilings, publicOrigin: PUBLIC, client: h.client, models: MODELS, spend: h.spend,
      allowMutation: async () => true, authenticate: async (token) => (tokens.has(token) ? { account_id: tokens.get(token)! } : null),
      enqueue: async () => {}, log: () => {} });
    const headers = (origin: string, ip: string) => ({ 'content-type': 'application/json', 'x-forwarded-for': ip, origin });
    const config = createWidgetConfigHandler(deps), event = createWidgetEventHandler(deps), ask = createWidgetAskHandler(deps), owner = createOwnerAskHandler(cabinet);
    return {
      h, tokens,
      visitor: async (key: string, ip = '198.51.100.23') => {
        const r = await config(new Request(`${PUBLIC}/w/v1/config?bot=${key}`, { headers: headers(HOST, ip) }));
        const token = ((await r.json()) as { data: { visitor_session: string } }).data.visitor_session;
        const e = await event(new Request(`${PUBLIC}/w/v1/event`, { method: 'POST', headers: headers(HOST, ip),
          body: JSON.stringify({ bot: key, visitor_session: token, type: 'badge_impression' }) }));
        expect(e.status).toBe(204);
        return token;
      },
      ask: async (key: string, token: string, question: string, ip = '198.51.100.23') => {
        const r = await ask(new Request(`${PUBLIC}/w/v1/ask?bot=${key}`, { method: 'POST', headers: headers(HOST, ip), body: JSON.stringify({ visitor_session: token, question }) }));
        return { status: r.status, body: await r.json() as Json };
      },
      owner: async (token: string, bot: string, question: string) => {
        const r = await owner(new Request(`${PUBLIC}/api/bots/${bot}/ask`, { method: 'POST', body: JSON.stringify({ question }),
          headers: { origin: PUBLIC, 'x-forwarded-for': '93.184.1.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${token}` } }), bot);
        return { status: r.status, body: await r.json() as Json };
      },
    };
  }
  async function seed(verified: boolean) {
    const account = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
      [`g${randomBytes(6).toString('hex')}@example.ru`])).rows[0]!.id;
    const key = randomBytes(16).toString('base64url');
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact)
      VALUES ($1, 'active', $2, 'Школа «Код»', $3) RETURNING id`, [account, key, CONTACT])).rows[0]!.id;
    await pool.query('INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, $2)', [bot, HOST]);
    const source = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, status) VALUES ($1, 'site', 'https://aicoding.example/', 'ready') RETURNING id`, [bot])).rows[0]!.id;
    const page = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'https://aicoding.example/ceny', 'Цены', $3) RETURNING id`,
      [source, bot, createHash('sha256').update(PRICE + bot).digest('hex')])).rows[0]!.id;
    await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
      VALUES ($1, $2, $3, 0, 'Цены', $4, 20, $5::vector)`, [bot, source, page, PRICE, `[${vectorFor(PRICE).join(',')}]`]);
    if (verified) await pool.query('UPDATE bot SET answers_verified_at = now() WHERE id = $1', [bot]);
    return { account, bot, key, source, page };
  }
  const addChunk = (s: { bot: string; source: string; page: string }, ordinal: number) => pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
    VALUES ($1, $2, $3, $4, 'Акции', 'Новая акция по средам.', 8, $5::vector)`, [s.bot, s.source, s.page, ordinal, `[${vectorFor('акция').join(',')}]`]);
  const quotaUsed = async () => Number((await pool.query<{ n: number }>('SELECT COALESCE(sum(used), 0)::int AS n FROM quota_counter')).rows[0]!.n);

  it('AC-5/6/7: заглушка пишется исходом not_verified — без текста, с сессией, без квоты и модели; сводка и кабинет считают РАЗЛИЧНЫХ посетителей за 7 дней', async () => {
    const w = wire();
    const s = await seed(false);
    const quotaBefore = await quotaUsed();
    const a = await w.visitor(s.key), b = await w.visitor(s.key, '203.0.113.40');
    for (const [token, ip] of [[a, '198.51.100.23'], [a, '198.51.100.23'], [b, '203.0.113.40']] as const) {
      const r = await w.ask(s.key, token, 'Сколько стоит курс?', ip);
      expect([r.status, r.body.data?.reason]).toEqual([200, 'not_verified']);
    }
    expect([w.h.gateway.embeds.length, w.h.gateway.chats.length]).toEqual([0, 0]);
    expect(await quotaUsed()).toBe(quotaBefore);
    const rows = (await pool.query('SELECT outcome, text, text_expires_at, visitor_session_id FROM question_log WHERE bot_id = $1 ORDER BY created_at', [s.bot])).rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect([row.outcome, row.text, row.text_expires_at]).toEqual(['not_verified', null, null]);
    expect(new Set(rows.map((r) => r.visitor_session_id))).toEqual(new Set([a.split('.')[0], b.split('.')[0]]));
    // Старше окна — не считается; вопрос без сессии — тоже.
    await pool.query(`INSERT INTO question_log (bot_id, visitor_session_id, outcome, created_at) VALUES ($1, $2, 'not_verified', now() - interval '8 days')`,
      [s.bot, (await pool.query(`INSERT INTO visitor_session (bot_id, ip_prefix, origin) VALUES ($1, '192.0.2.0/24', $2) RETURNING id`, [s.bot, HOST])).rows[0].id]);
    await pool.query(`INSERT INTO question_log (bot_id, visitor_session_id, outcome) VALUES ($1, NULL, 'not_verified')`, [s.bot]);
    expect(await readBotSummary(pool, s.bot, s.account)).toEqual({ answered: 0, unknown: 0, refused_limit: 0, not_verified_visitors: 2, last_unknown: [] });
    expect((await readBotCabinet(pool, s.bot, s.account))!.stub_visitors_7d).toBe(2);
    // Чужой бот своих заглушек не получает.
    const other = await seed(false);
    expect((await readBotCabinet(pool, other.bot, other.account))!.stub_visitors_7d).toBe(0);
  });

  it('AC-5: у проверенного бота заглушки нет и not_verified не пишется', async () => {
    const w = wire();
    const s = await seed(true);
    const vs = await w.visitor(s.key);
    expect((await w.ask(s.key, vs, 'Сколько стоит доставка?')).body.data).toMatchObject({ status: 'answered' });
    expect(Number((await pool.query(`SELECT count(*)::int AS n FROM question_log WHERE bot_id = $1 AND outcome = 'not_verified'`, [s.bot])).rows[0].n)).toBe(0);
  });

  it('AC-10: 152-ФЗ — у not_verified текст невозможен; неизвестный исход отвергается базой', async () => {
    const s = await seed(false);
    await expect(pool.query(`INSERT INTO question_log (bot_id, outcome, text, text_expires_at) VALUES ($1, 'not_verified', 'вопрос', now() + interval '14 days')`, [s.bot]))
      .rejects.toThrow(/question_text_only_unknown/);
    await expect(pool.query(`INSERT INTO question_log (bot_id, outcome) VALUES ($1, 'NOT_VERIFIED')`, [s.bot])).rejects.toThrow(/question_log_outcome_check/);
  });

  it('AC-8/9: новый фрагмент снимает отметку С ПОМЕТКОЙ (когда, new_material); повторная пачка дату не двигает; любое действие владельца пометку стирает', async () => {
    const s = await seed(true);
    expect((await readBotCabinet(pool, s.bot, s.account))!.verified_reset).toBeNull();
    await addChunk(s, 1);
    const cab = (await readBotCabinet(pool, s.bot, s.account))!;
    expect(cab.answers_verified).toBe(false);
    expect(cab.verified_reset).toMatchObject({ reason: 'new_material' });
    expect(Date.now() - Date.parse(cab.verified_reset!.at)).toBeLessThan(60_000);
    await pool.query(`UPDATE bot SET answers_verified_reset_at = answers_verified_reset_at - interval '1 hour' WHERE id = $1`, [s.bot]);
    const first = (await readBotCabinet(pool, s.bot, s.account))!.verified_reset!.at;
    await addChunk(s, 2);
    expect((await readBotCabinet(pool, s.bot, s.account))!.verified_reset!.at).toBe(first);
    // Поставил — пометки нет; база сняла снова — есть; снял вручную — пометки нет (иначе «материалы обновились» — неправда).
    expect(await setAnswersVerified(pool, s.bot, s.account, true)).toEqual({ answers_verified: true });
    expect((await readBotCabinet(pool, s.bot, s.account))!.verified_reset).toBeNull();
    await addChunk(s, 3);
    expect((await readBotCabinet(pool, s.bot, s.account))!.verified_reset).not.toBeNull();
    expect(await setAnswersVerified(pool, s.bot, s.account, false)).toEqual({ answers_verified: false });
    const row = (await pool.query('SELECT answers_verified_reset_at, answers_verified_reset_reason FROM bot WHERE id = $1', [s.bot])).rows[0];
    expect([row.answers_verified_reset_at, row.answers_verified_reset_reason]).toEqual([null, null]);
    // Неснятый бот пометку не получает; «время без причины» отвергается базой.
    const clean = await seed(false);
    await addChunk(clean, 1);
    expect((await readBotCabinet(pool, clean.bot, clean.account))!.verified_reset).toBeNull();
    await expect(pool.query('UPDATE bot SET answers_verified_reset_at = now() WHERE id = $1', [clean.bot])).rejects.toThrow(/bot_verified_reset_pair/);
    await expect(pool.query(`UPDATE bot SET answers_verified_reset_at = now(), answers_verified_reset_reason = 'other' WHERE id = $1`, [clean.bot]))
      .rejects.toThrow(/bot_verified_reset_reason_check/);
  });

  // Ревью круга 1: гонка триггера снятия и действия владельца на ОДНОЙ строке бота — двумя соединениями, порядок задан
  // блокировкой строки. Итог в обоих порядках: побеждает последний, «проверено» и «снята» вместе не бывают (CHECK).
  it('AC-8/9 конкурентно: вставка фрагмента и отметка владельца сериализуются строкой бота; оба порядка дают согласованный итог', async () => {
    const pending = <T,>(promise: Promise<T>) => { let done = false; void promise.finally(() => { done = true; }); return () => done; };
    const state = async (bot: string) => (await pool.query('SELECT answers_verified_at IS NOT NULL AS v, answers_verified_reset_at IS NOT NULL AS r, answers_verified_reset_reason AS why FROM bot WHERE id = $1', [bot])).rows[0];
    // Порядок 1: индексация (фрагмент) держит строку бота → владелец ставит отметку ПОСЛЕ неё.
    const s = await seed(true);
    const a = await pool.connect();
    try {
      await a.query('BEGIN');
      await a.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
        VALUES ($1, $2, $3, 5, 'Акции', 'Новое.', 2, $4::vector)`, [s.bot, s.source, s.page, `[${vectorFor('новое').join(',')}]`]);
      const verify = setAnswersVerified(pool, s.bot, s.account, true);
      const done = pending(verify);
      await new Promise((r) => setTimeout(r, 300));
      expect(done()).toBe(false);                       // ждёт строку бота
      await a.query('COMMIT');
      expect(await verify).toEqual({ answers_verified: true });
    } finally { a.release(); }
    expect(await state(s.bot)).toEqual({ v: true, r: false, why: null });
    // Порядок 2: отметка владельца держит строку → фрагмент приходит ПОСЛЕ и снимает её с пометкой.
    const b = await pool.connect();
    try {
      await b.query('BEGIN');
      await b.query(`UPDATE bot SET answers_verified_at = now(), answers_verified_reset_at = NULL, answers_verified_reset_reason = NULL WHERE id = $1`, [s.bot]);
      const insert = addChunk(s, 6);
      const done = pending(insert);
      await new Promise((r) => setTimeout(r, 300));
      expect(done()).toBe(false);                       // триггер ждёт строку бота
      await b.query('COMMIT');
      await insert;
    } finally { b.release(); }
    expect(await state(s.bot)).toEqual({ v: false, r: true, why: 'new_material' });
    // Инвариант держит база: «проверено» вместе с пометкой снятия записать нельзя.
    await expect(pool.query(`UPDATE bot SET answers_verified_at = now() WHERE id = $1`, [s.bot])).rejects.toThrow(/bot_verified_or_reset/);
  });

  it('AC-4: тестовый чат владельца отвечает и без отметки «проверено» (он и есть способ проверить); в журнал не пишется', async () => {
    const w = wire();
    const s = await seed(false);
    const token = randomBytes(32).toString('base64url');   // форма cookie сессии: 43 символа base64url (readSessionCookie)
    w.tokens.set(token, s.account);
    const r = await w.owner(token, s.bot, 'Сколько стоит доставка?');
    expect([r.status, r.body.data?.status]).toEqual([200, 'answered']);
    expect(Number((await pool.query('SELECT count(*)::int AS n FROM question_log WHERE bot_id = $1', [s.bot])).rows[0].n)).toBe(0);
    expect((await readBotCabinet(pool, s.bot, s.account))!.answers_verified).toBe(false);
  });
});
