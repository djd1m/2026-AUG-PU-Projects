// rag-answer на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: изоляция ботов в ответе (NFR-SEC-001, SC-SEC-001),
// квота вопроса по часам БД, журнал вопроса (152-ФЗ: текст только у unknown, 14 дней), SC-US-002-1/2.
// Связка боевая: loadAnswerBot → chargeAnswerQuota → searchChunks → answerQuestion → recordQuestion.
// Шлюз — настоящий клиент OpenRouter за подменным fetch; живая модель НЕ вызывается.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { searchChunks } from '../packages/db/src/chunks';
import { chargeAnswerQuota, loadAnswerBot, recordQuestion } from '../packages/db/src/answers';
import { answerQuestion, loadCeilings, type AnswerDeps } from '../packages/rag/src/index';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
import { vectorFor } from './fixtures/fake-embeddings';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const databaseUrl = process.env.DATABASE_URL;
const PRICE = 'Прайс: доставка по Москве от 350 ₽, самовывоз со склада бесплатно.';
const QUESTION = 'Сколько стоит доставка по Москве?';

describe.skipIf(!databaseUrl)('rag-answer на настоящем Postgres + pgvector: изоляция ботов и журнал', () => {
  let pool: Pool;
  const schema = `rag_answer_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  async function makeBot(texts: string[], plan = 'free') {
    const owner = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
      [`u${randomBytes(6).toString('hex')}@example.org`, plan])).rows[0]!.id;
    const botId = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact)
      VALUES ($1, 'active', $2, 'Пекарня', 'hello@kolos.example') RETURNING id`, [owner, randomBytes(16).toString('base64url').slice(0, 22)])).rows[0]!.id;
    const sourceId = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, status) VALUES ($1, 'site', 'https://kolos.example/', 'ready') RETURNING id`, [botId])).rows[0]!.id;
    const chunkIds: string[] = [];
    for (const [i, text] of texts.entries()) {
      const pageId = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [sourceId, botId, `https://kolos.example/p${i}`, `Страница ${i}`, createHash('sha256').update(text + botId).digest('hex')])).rows[0]!.id;
      chunkIds.push((await pool.query<{ id: string }>(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
        VALUES ($1, $2, $3, 0, $4, $5, 20, $6::vector) RETURNING id`, [botId, sourceId, pageId, `Страница ${i}`, text, `[${vectorFor(text).join(',')}]`])).rows[0]!.id);
    }
    const visitorSession = (await pool.query<{ id: string }>(`INSERT INTO visitor_session (bot_id, ip_prefix, origin) VALUES ($1, '203.0.113.0/24', 'https://kolos.example') RETURNING id`, [botId])).rows[0]!.id;
    return { botId, chunkIds, visitorSession };
  }

  function wire(env: Record<string, string> = {}) {
    const gateway = fakeAnswerGateway((call) => {
      // Модель «цитирует» первую выданную метку — ровно то, что сделала бы честная модель по прайсу.
      return { status: 'answered', text: 'Доставка по Москве — от 350 ₽.', citations: [call.messages[1]!.content.includes('<материал id="F1"') ? 'F1' : 'F9'] };
    });
    gateway.vector = (text) => (text === QUESTION ? vectorFor(PRICE) : vectorFor(text));   // вопрос ≈ прайс
    const h = answerHarness(gateway);
    const ceilings = loadCeilings({ ...environment(), ...env });
    const ask = async (bot: { botId: string; visitorSession: string }, question = QUESTION) => {
      const loaded = await loadAnswerBot(pool, bot.botId);
      if (!loaded) throw new Error('бот не найден');
      const deps: AnswerDeps = {
        client: h.client, models: MODELS, spend: h.spend,
        chargeQuota: () => chargeAnswerQuota(pool, ceilings, { mode: 'widget', botId: loaded.id, plan: loaded.plan, visitorSession: bot.visitorSession, ipPrefix: '203.0.113.0/24' }),
        search: (botId, embedding) => searchChunks(pool, botId, embedding),
        logQuestion: (entry) => recordQuestion(pool, { ...entry, visitorSessionId: bot.visitorSession }),
      };
      return answerQuestion(deps, loaded, 'widget', { question, history: [] });
    };
    return { h, ask };
  }
  const logOf = async (botId: string) => (await pool.query<{ outcome: string; text: string | null; ttl_days: number | null; cited_chunk_ids: string[] }>(
    `SELECT outcome, text, round(extract(epoch FROM text_expires_at - created_at) / 86400)::int AS ttl_days, cited_chunk_ids FROM question_log WHERE bot_id = $1 ORDER BY created_at`, [botId])).rows;
  const used = async (scope: string, key: string) => Number((await pool.query<{ used: number }>(
    'SELECT COALESCE(sum(used), 0)::int AS used FROM quota_counter WHERE scope = $1 AND scope_key = $2', [scope, key])).rows[0]!.used);

  it('SC-US-002-1: у бота с прайсом — ответ с источником; журнал без текста; 5 scope списаны по разу; расход по попыткам', async () => {
    const a = await makeBot([PRICE, 'Гарантия 12 месяцев на всё.']);
    const w = wire();
    const r = await w.ask(a);
    expect(r).toMatchObject({ status: 'answered', text: 'Доставка по Москве — от 350 ₽.' });
    if (r.status === 'answered') expect(r.sourceChip).toEqual({ chunkId: a.chunkIds[0], title: 'Страница 0', url: 'https://kolos.example/p0', excerpt: PRICE });
    expect(await logOf(a.botId)).toEqual([{ outcome: 'answered', text: null, ttl_days: null, cited_chunk_ids: [a.chunkIds[0]] }]);
    for (const [scope, key] of [['visitor_answers', a.visitorSession], ['ip_answers', '203.0.113.0/24'], ['bot_day_answers', a.botId], ['bot_month_answers', a.botId]]) {
      expect(await used(scope!, key!)).toBe(1);
    }
    expect(w.h.spendEvents().filter((e) => e.phase === 'attempt').map((e) => e.call)).toEqual(['embed_question', 'answer']);
  });

  it('изоляция: у чужого бота ответ есть — у нашего «не знаю», модель не вызвана, текст вопроса хранится 14 дней', async () => {
    const theirs = await makeBot([PRICE]);
    const ours = await makeBot(['Мы печём хлеб на закваске каждое утро.']);
    const w = wire();
    expect((await w.ask(theirs)).status).toBe('answered');
    const chatsBefore = w.h.gateway.chats.length;
    const r = await w.ask(ours);
    expect(r).toMatchObject({ status: 'unknown', reason: 'below_threshold', contact: 'hello@kolos.example' });
    expect(w.h.gateway.chats.length).toBe(chatsBefore);
    expect(await logOf(ours.botId)).toEqual([{ outcome: 'unknown', text: QUESTION, ttl_days: 14, cited_chunk_ids: [] }]);
  });

  it('SC-SEC-001: два бота с одинаковым прайсом — цитата и все фрагменты контекста только своего бота', async () => {
    const a = await makeBot([PRICE]);
    const b = await makeBot([PRICE]);
    const w = wire();
    const ra = await w.ask(a), rb = await w.ask(b);
    expect(ra.status === 'answered' && ra.sourceChip.chunkId).toBe(a.chunkIds[0]);
    expect(rb.status === 'answered' && rb.sourceChip.chunkId).toBe(b.chunkIds[0]);
    expect((await logOf(a.botId))[0]!.cited_chunk_ids).toEqual([a.chunkIds[0]]);
    expect((await logOf(b.botId))[0]!.cited_chunk_ids).toEqual([b.chunkIds[0]]);
    // В промпт ответа бота B не попал ни один фрагмент бота A: ровно один материал на каждый вызов.
    for (const call of w.h.gateway.chats) expect(call.messages[1]!.content.match(/<материал id="/g)).toHaveLength(1);
  });

  it('квота вопроса по часам БД: QUOTA_VISITOR_ANSWERS=1 — второй вопрос refused_limit, ни эмбеддинга, ни модели, откат всех scope', async () => {
    const a = await makeBot([PRICE]);
    const w = wire({ QUOTA_VISITOR_ANSWERS: '1' });
    expect((await w.ask(a)).status).toBe('answered');
    const embeds = w.h.gateway.embeds.length;
    const r = await w.ask(a);
    expect(r).toMatchObject({ status: 'refused', reason: 'limit', scope: 'visitor_answers', contact: 'hello@kolos.example' });
    expect(w.h.gateway.embeds.length).toBe(embeds);
    expect(await used('bot_day_answers', a.botId)).toBe(1);   // отказавшее списание откатило все scope
    expect((await logOf(a.botId)).map((l) => l.outcome)).toEqual(['answered', 'refused_limit']);
  });

  it('отказ модели после списания: «не знаю», квота не возвращается, журнал без текста', async () => {
    const a = await makeBot([PRICE]);
    const w = wire();
    w.h.gateway.reply = () => 503;
    expect(await w.ask(a)).toMatchObject({ status: 'unknown', reason: 'service_unavailable' });
    expect(await used('visitor_answers', a.visitorSession)).toBe(1);
    expect(await logOf(a.botId)).toEqual([{ outcome: 'unknown', text: null, ttl_days: null, cited_chunk_ids: [] }]);
  });

  it('loadAnswerBot: несуществующий и непригодный id — null; статус и план читаются fail-closed', async () => {
    expect(await loadAnswerBot(pool, randomUUID())).toBeNull();
    expect(await loadAnswerBot(pool, 'не-uuid')).toBeNull();
    const a = await makeBot([PRICE], 'nobadge');
    expect(await loadAnswerBot(pool, a.botId)).toMatchObject({ id: a.botId, status: 'active', plan: 'nobadge', contact: 'hello@kolos.example' });
    await expect(recordQuestion(pool, { botId: a.botId, outcome: 'answered', text: 'утечка', citedChunkIds: [], visitorSessionId: null })).rejects.toThrow(/152-ФЗ/);
  });
});
