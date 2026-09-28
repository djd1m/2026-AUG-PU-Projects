// verify-audit (инцидент стенда 28.09, A-N6-077) на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: журнал отметки «Я проверил
// ответы бота» (миграция 014) пишет БАЗА на переходе, в той же транзакции; кто снял — владелец или новые материалы;
// маршрут отказывает в снятии без подтверждения. Боевая связка createCabinetDependencies; подменены только шлюз модели и двери.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPool, readBotCabinet, setAnswersVerified, VERIFICATION_EVENTS_SHOWN, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { loadCeilings } from '../packages/rag/src/index';
import { createCabinetDependencies } from '../apps/web/src/server/cabinet-deps';
import { createBotVerifyHandler } from '../apps/web/src/server/cabinet-handler';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
import { vectorFor } from './fixtures/fake-embeddings';
import { answerHarness, fakeAnswerGateway, MODELS } from './fixtures/fake-answer-gateway';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const PRICE = 'Прайс: доставка по Москве от 350 ₽.';

describe.skipIf(!databaseUrl)('verify-audit на настоящем Postgres + pgvector', () => {
  let pool: Pool;
  const schema = `verify_audit_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  async function seed() {
    const account = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', 'free') RETURNING id`,
      [`v${randomBytes(6).toString('hex')}@example.ru`])).rows[0]!.id;
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact)
      VALUES ($1, 'active', $2, 'Школа «Код»', '+7 900 000-00-00') RETURNING id`, [account, randomBytes(16).toString('base64url')])).rows[0]!.id;
    const source = (await pool.query<{ id: string }>(`INSERT INTO source (bot_id, kind, root_url, status) VALUES ($1, 'site', 'https://kod.example/', 'ready') RETURNING id`, [bot])).rows[0]!.id;
    const page = (await pool.query<{ id: string }>(`INSERT INTO page (source_id, bot_id, url_or_page, title, content_hash) VALUES ($1, $2, 'https://kod.example/ceny', 'Цены', $3) RETURNING id`,
      [source, bot, createHash('sha256').update(PRICE + bot).digest('hex')])).rows[0]!.id;
    return { account, bot, source, page };
  }
  const addChunk = (s: { bot: string; source: string; page: string }, ordinal: number) => pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
    VALUES ($1, $2, $3, $4, 'Цены', $5, 8, $6::vector)`, [s.bot, s.source, s.page, ordinal, PRICE, `[${vectorFor(PRICE).join(',')}]`]);
  const events = async (bot: string) => (await pool.query<{ kind: string; actor: string }>(
    'SELECT kind, actor FROM bot_verification_event WHERE bot_id = $1 ORDER BY created_at, id', [bot])).rows.map((r) => `${r.kind}/${r.actor}`);

  it('AC-7/8: владелец ставит и снимает — события set/owner и unset_owner/owner; повтор без перехода — не событие и не сдвигает «стоит с»', async () => {
    const s = await seed();
    expect(await setAnswersVerified(pool, s.bot, s.account, true)).toEqual({ answers_verified: true });
    const since = (await readBotCabinet(pool, s.bot, s.account))!.verified_at;
    expect(since).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(await setAnswersVerified(pool, s.bot, s.account, true)).toEqual({ answers_verified: true });   // двойное нажатие «Я проверил»
    expect((await readBotCabinet(pool, s.bot, s.account))!.verified_at).toBe(since);
    expect(await events(s.bot)).toEqual(['set/owner']);
    expect(await setAnswersVerified(pool, s.bot, s.account, false)).toEqual({ answers_verified: false });
    expect(await setAnswersVerified(pool, s.bot, s.account, false)).toEqual({ answers_verified: false });
    expect(await events(s.bot)).toEqual(['set/owner', 'unset_owner/owner']);
    const cab = (await readBotCabinet(pool, s.bot, s.account))!;
    expect(cab.verified_at).toBeNull();
    expect(cab.verification_events.map((e) => e.kind)).toEqual(['unset_owner', 'set']);   // новые первыми
  });

  it('AC-7/10: фрагмент снимает отметку — unset_new_material/system; дата события = дата пометки answers_verified_reset_at (баннер)', async () => {
    const s = await seed();
    await setAnswersVerified(pool, s.bot, s.account, true);
    await addChunk(s, 1);
    await addChunk(s, 2);   // уже снята — второй оператор события не пишет
    expect(await events(s.bot)).toEqual(['set/owner', 'unset_new_material/system']);
    const cab = (await readBotCabinet(pool, s.bot, s.account))!;
    expect(cab.verification_events[0]!.kind).toBe('unset_new_material');
    expect(cab.verification_events[0]!.at).toBe(cab.verified_reset!.at);
    // Пачка из нескольких фрагментов одним оператором — одно событие.
    await setAnswersVerified(pool, s.bot, s.account, true);
    await pool.query(`INSERT INTO chunk (bot_id, source_id, page_id, ordinal, context_path, text, token_count, embedding)
      SELECT $1, $2, $3, g, 'Цены', $4, 8, $5::vector FROM generate_series(10, 14) g`, [s.bot, s.source, s.page, PRICE, `[${vectorFor(PRICE).join(',')}]`]);
    expect(await events(s.bot)).toEqual(['set/owner', 'unset_new_material/system', 'set/owner', 'unset_new_material/system']);
  });

  it('AC-7: событие — в ТОЙ ЖЕ транзакции: откат снятия не оставляет события; SQL прежнего приложения тоже попадает в журнал', async () => {
    const s = await seed();
    await setAnswersVerified(pool, s.bot, s.account, true);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('UPDATE bot SET answers_verified_at = NULL WHERE id = $1', [s.bot]);
      expect(Number((await c.query('SELECT count(*)::int AS n FROM bot_verification_event WHERE bot_id = $1', [s.bot])).rows[0].n)).toBe(2);
      await c.query('ROLLBACK');
    } finally { c.release(); }
    expect(await events(s.bot)).toEqual(['set/owner']);
    // Ровно SQL setAnswersVerified из bf7ab6d0 (до gate-onboarding и этой фичи): переход всё равно журналируется.
    await pool.query(`UPDATE bot SET answers_verified_at = CASE WHEN $2::boolean THEN now() ELSE NULL END WHERE id = $1`, [s.bot, false]);
    expect(await events(s.bot)).toEqual(['set/owner', 'unset_owner/owner']);
  });

  // Ревью круга 1: now() — время НАЧАЛА транзакции. Транзакция, начавшаяся раньше, но снявшая отметку позже установки, обязана
  // оказаться в журнале ПОСЛЕДНЕЙ — порядок по id (переходы одного бота сериализованы его строкой), не по created_at.
  it('порядок переходов: раньше начатая транзакция, снявшая отметку позже, — последнее событие; строка «снята владельцем»', async () => {
    const s = await seed();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT now()');   // время транзакции зафиксировано здесь
      await new Promise((r) => setTimeout(r, 30));
      await setAnswersVerified(pool, s.bot, s.account, true);   // другая транзакция — позже началась, раньше закончилась
      await c.query('UPDATE bot SET answers_verified_at = NULL WHERE id = $1', [s.bot]);
      await c.query('COMMIT');
    } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    const created = (await pool.query<{ kind: string; created_at: Date }>('SELECT kind, created_at FROM bot_verification_event WHERE bot_id = $1 ORDER BY id', [s.bot])).rows;
    expect(created.map((r) => r.kind)).toEqual(['set', 'unset_owner']);
    expect(created[1]!.created_at.getTime()).toBeLessThan(created[0]!.created_at.getTime());   // по времени — «раньше», по факту — позже
    const cab = (await readBotCabinet(pool, s.bot, s.account))!;
    expect(cab.answers_verified).toBe(false);
    expect(cab.verification_events.map((e) => e.kind)).toEqual(['unset_owner', 'set']);
  });

  it('закрытые наборы и пары: неизвестный вид, неизвестный актёр и «система сняла вручную» отвергаются базой; последних событий — не больше 5', async () => {
    const s = await seed();
    await expect(pool.query(`INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES ($1, 'unset_source_added', 'owner')`, [s.bot])).rejects.toThrow(/kind_check/);   // пара kind↔actor проверяется раньше по имени — вид отдельно
    await expect(pool.query(`INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES ($1, 'set', 'operator')`, [s.bot])).rejects.toThrow(/actor_check/);
    await expect(pool.query(`INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES ($1, 'unset_owner', 'system')`, [s.bot])).rejects.toThrow(/actor_kind/);
    for (let i = 0; i < 4; i += 1) {
      await setAnswersVerified(pool, s.bot, s.account, true);
      await setAnswersVerified(pool, s.bot, s.account, false);
    }
    expect((await events(s.bot)).length).toBe(8);
    expect((await readBotCabinet(pool, s.bot, s.account))!.verification_events).toHaveLength(VERIFICATION_EVENTS_SHOWN);
  });

  it('AC-6: маршрут на настоящей БД — снятие без confirm: 400 confirm_required, отметка и журнал не меняются; с confirm — снята владельцем', async () => {
    const s = await seed();
    await setAnswersVerified(pool, s.bot, s.account, true);
    const h = answerHarness(fakeAnswerGateway(() => ({ status: 'answered', text: '—', citations: [] })));
    const token = randomBytes(32).toString('base64url');
    const cabinet = createCabinetDependencies({ pool, ceilings: loadCeilings(environment()), publicOrigin: PUBLIC, client: h.client, models: MODELS, spend: h.spend,
      allowMutation: async () => true, authenticate: async (t) => (t === token ? { account_id: s.account } : null), enqueue: async () => {}, log: () => {} });
    const handler = createBotVerifyHandler(cabinet);
    const post = async (body: unknown) => {
      const r = await handler(new Request(`${PUBLIC}/api/bots/${s.bot}/verify`, { method: 'POST', body: JSON.stringify(body),
        headers: { origin: PUBLIC, 'x-forwarded-for': '93.184.1.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${token}` } }), s.bot);
      return { status: r.status, body: await r.json() as { data?: unknown; error?: { code: string } } };
    };
    for (const body of [{ verified: false }, { verified: false, confirm: false }]) {
      const r = await post(body);
      expect([r.status, r.body.error?.code], JSON.stringify(body)).toEqual([400, 'confirm_required']);
    }
    expect((await readBotCabinet(pool, s.bot, s.account))!.answers_verified).toBe(true);
    expect(await events(s.bot)).toEqual(['set/owner']);
    expect(await post({ verified: true })).toEqual({ status: 200, body: { data: { answers_verified: true } } });
    expect(await events(s.bot)).toEqual(['set/owner']);
    expect(await post({ verified: false, confirm: true })).toEqual({ status: 200, body: { data: { answers_verified: false } } });
    expect(await events(s.bot)).toEqual(['set/owner', 'unset_owner/owner']);
  });
});
