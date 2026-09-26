// public-page-and-summary на НАСТОЯЩЕМ Postgres 16 + pgvector: публикация и снятие демо-страницы (SC-US-013-1/3),
// загрузка страницы по слагу во всех состояниях, public_page_view и share_cta_click с дедупликацией (в том числе
// конкурентно), сводка «ответил / не знал» (SC-US-010-1/2) и что в неё НЕ попадает, приход по бейджу в аккаунт,
// метрики i и conv% (null при нулевом знаменателе), уборка пустых сессий посетителей (carry_over фичи 12).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, growthMetrics, loadPublicPage, publishPublicPage, readBotCabinet, readBotSummary, recordArrival, recordPublicPageView,
  recordShareCtaClick, sweepIdleVisitorSessions, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

const databaseUrl = process.env.DATABASE_URL;
const CONTACT = '+7 900 000-00-00';

describe.skipIf(!databaseUrl)('демо-страница, сводка и события роста на настоящем Postgres', () => {
  let pool: Pool;
  const schema = `public_page_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  async function seed(over: { contact?: string | null; name?: string; plan?: string } = {}) {
    const account = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
      [`p${randomBytes(6).toString('hex')}@example.ru`, over.plan ?? 'free'])).rows[0]!.id;
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact) VALUES ($1, 'active', $2, $3, $4) RETURNING id`,
      [account, randomBytes(16).toString('base64url'), over.name ?? 'Пекарня «Колос»', over.contact === undefined ? CONTACT : over.contact])).rows[0]!.id;
    return { account, bot };
  }
  const session = async (bot: string, prefix = '198.51.100.0/24', origin = 'https://shop.example') => (await pool.query<{ id: string }>(
    'INSERT INTO visitor_session (bot_id, ip_prefix, origin) VALUES ($1, $2::cidr, $3) RETURNING id', [bot, prefix, origin])).rows[0]!.id;
  const log = (bot: string, vs: string | null, outcome: string, text: string | null = null, ageDays = 0) => pool.query(
    `INSERT INTO question_log (bot_id, visitor_session_id, outcome, text, text_expires_at, created_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE now() + interval '14 days' END, now() - make_interval(days => $5))`,
    [bot, vs, outcome, text, ageDays]);

  it('SC-US-013-1/3: публикация выдаёт слаг, страница открывается; снятие — null (404); повторная публикация — ТОТ ЖЕ слаг', async () => {
    const s = await seed({ name: 'Стоматология «Улыбка»' });
    const saved = await publishPublicPage(pool, s.bot, s.account, { enabled: true, indexable: false });
    expect(saved).toMatchObject({ kind: 'saved', enabled: true, indexable: false });
    const slug = (saved as { slug: string }).slug;
    expect(slug).toMatch(/^stomatologiya-ulybka-[a-z0-9]{4}$/);
    expect(await loadPublicPage(pool, slug)).toMatchObject({ botId: s.bot, companyName: 'Стоматология «Улыбка»', indexable: false });
    expect((await readBotCabinet(pool, s.bot, s.account))!.public_page).toEqual({ slug, enabled: true, indexable: false });
    expect(await publishPublicPage(pool, s.bot, s.account, { enabled: false, indexable: false })).toMatchObject({ slug, enabled: false });
    expect(await loadPublicPage(pool, slug)).toBeNull();
    expect(await publishPublicPage(pool, s.bot, s.account, { enabled: true, indexable: true })).toMatchObject({ slug, indexable: true });
    expect((await loadPublicPage(pool, slug))!.indexable).toBe(true);
  });

  it('публикация: чужой бот — null; без контакта — contact_required; коллизия слага — новая попытка', async () => {
    const s = await seed(), other = await seed();
    expect(await publishPublicPage(pool, s.bot, other.account, { enabled: true, indexable: false })).toBeNull();
    const bare = await seed({ contact: null });
    expect(await publishPublicPage(pool, bare.bot, bare.account, { enabled: true, indexable: false })).toEqual({ kind: 'contact_required' });
    // Снять публикацию без контакта можно — это не делает страницу видимой.
    expect(await publishPublicPage(pool, bare.bot, bare.account, { enabled: false, indexable: false })).toMatchObject({ kind: 'saved', enabled: false });
    const taken = (await publishPublicPage(pool, s.bot, s.account, { enabled: true, indexable: false }) as { slug: string }).slug;
    const third = await seed();
    const slugs = [taken, taken, 'kolos-free'];
    expect(await publishPublicPage(pool, third.bot, third.account, { enabled: true, indexable: false }, () => slugs.shift()!)).toMatchObject({ slug: 'kolos-free' });
  });

  it('SC-US-013-3: страница — только при публикации, активных боте и владельце и годном контакте; мусорный слаг — без запроса', async () => {
    const s = await seed();
    const slug = (await publishPublicPage(pool, s.bot, s.account, { enabled: true, indexable: false }) as { slug: string }).slug;
    expect(await loadPublicPage(pool, slug)).not.toBeNull();
    await pool.query(`UPDATE bot SET contact = 'позвоните нам' WHERE id = $1`, [s.bot]);
    expect(await loadPublicPage(pool, slug)).toBeNull();
    await pool.query('UPDATE bot SET contact = $2 WHERE id = $1', [s.bot, CONTACT]);
    await pool.query(`UPDATE account SET status = 'erasing', erase_deadline = now() + interval '3 days' WHERE id = $1`, [s.account]);
    expect(await loadPublicPage(pool, slug)).toBeNull();
    await pool.query(`UPDATE account SET status = 'active', erase_deadline = NULL WHERE id = $1`, [s.account]);
    await pool.query(`UPDATE bot SET status = 'deleted' WHERE id = $1`, [s.bot]);
    expect(await loadPublicPage(pool, slug)).toBeNull();
    for (const bad of ['', 'AB', "x' OR 1=1 --", 'a'.repeat(61), '../etc']) expect(await loadPublicPage(pool, bad), bad).toBeNull();
  });

  it('AC-7: public_page_view — одна строка на (бот, /24, сутки), 20 одновременных просмотров — одна; другой /24 — вторая', async () => {
    const s = await seed();
    const results = await Promise.all(Array.from({ length: 20 }, () => recordPublicPageView(pool, s.bot, '203.0.113.0/24')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await recordPublicPageView(pool, s.bot, '198.51.100.0/24')).toBe(true);
    expect((await pool.query(`SELECT count(*)::int AS n FROM growth_event WHERE type = 'public_page_view' AND bot_id = $1`, [s.bot])).rows[0].n).toBe(2);
  });

  it('FR-GROWTH-001 @security: share_cta_click — без показа CTA не пишется; 100 одновременных нажатий — одна строка', async () => {
    const s = await seed();
    expect(await recordShareCtaClick(pool, s.bot)).toBe(false);
    await pool.query(`INSERT INTO growth_event (type, bot_id, dedup_key) VALUES ('share_cta_shown', $1, $2)`, [s.bot, `share_cta_shown:${s.bot}`]);
    const results = await Promise.all(Array.from({ length: 100 }, () => recordShareCtaClick(pool, s.bot)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM growth_event WHERE type = 'share_cta_click' AND bot_id = $1`, [s.bot])).rows[0].n).toBe(1);
    expect(await recordShareCtaClick(pool, 'not-a-uuid')).toBe(false);
  });

  it('SC-US-010-1, AC-6: сводка — только вопросы посетителей за 7 дней; без предпросмотра, refused_origin, старых и чужого бота; ≤ 20 последних «не знаю»', async () => {
    const s = await seed(), other = await seed();
    const vs = await session(s.bot);
    for (let i = 0; i < 40; i++) await log(s.bot, vs, 'answered');
    for (let i = 0; i < 24; i++) await log(s.bot, vs, 'unknown', `Вопрос ${i}`);
    for (let i = 0; i < 3; i++) await log(s.bot, vs, 'refused_limit');
    await log(s.bot, vs, 'refused_origin');                        // отказ по домену — не вопрос к боту
    await log(s.bot, null, 'answered');                             // предпросмотр: сессии нет
    await log(s.bot, null, 'unknown', 'из предпросмотра');
    await log(s.bot, vs, 'answered', null, 8);                      // старше 7 дней
    await log(s.bot, vs, 'unknown', 'старый вопрос', 8);
    await log(other.bot, await session(other.bot), 'unknown', 'чужой бот');
    await log(s.bot, vs, 'unknown');                                 // текст уже стёрт сторожем — в счёт, не в список
    const summary = (await readBotSummary(pool, s.bot, s.account))!;
    expect([summary.answered, summary.unknown, summary.refused_limit]).toEqual([40, 25, 3]);
    expect(summary.last_unknown).toHaveLength(20);
    const texts = summary.last_unknown.map((q) => q.text);
    for (const leaked of ['из предпросмотра', 'старый вопрос', 'чужой бот']) expect(texts).not.toContain(leaked);
    expect(await readBotSummary(pool, s.bot, other.account)).toBeNull();
  });

  it('SC-US-010-2: вопросов не было — нули и пустой список (экран пишет «вопросов ещё не было», процентов нет)', async () => {
    const s = await seed();
    expect(await readBotSummary(pool, s.bot, s.account)).toEqual({ answered: 0, unknown: 0, refused_limit: 0, last_unknown: [] });
  });

  it('AC-8: приход по бейджу пишется в аккаунт один раз; мусорная форма не пишется', async () => {
    const s = await seed();
    for (const bad of ['Shop.Example', 'shop', 'http://shop.example', 'b/AB', 'b/x', '-bad.example', 'a'.repeat(254)]) {
      expect(await recordArrival(pool, s.account, bad), bad).toBe(false);
    }
    expect(await recordArrival(pool, s.account, 'shop.example')).toBe(true);
    expect(await recordArrival(pool, s.account, 'b/kolos-ab12')).toBe(false);
    expect((await pool.query('SELECT came_from FROM account WHERE id = $1', [s.account])).rows[0].came_from).toBe('shop.example');
    // CHECK миграции 005 держит форму и без кода.
    await expect(pool.query(`UPDATE account SET came_from = 'Not A Domain' WHERE id = $1`, [s.account])).rejects.toThrow();
  });

  it('AC-9: i и conv% — null при нулевом знаменателе; при данных — числа', async () => {
    // Изолированная схема: считаются только строки этого набора; предыдущие тесты событий бейджа не писали.
    const empty = await growthMetrics(pool, 7);
    expect(empty.badge_impressions).toBe(0);
    expect([empty.i_per_1000, empty.conv_percent]).toEqual([null, null]);
    const s = await seed();
    const vs = await session(s.bot);
    for (let i = 0; i < 2000; i += 500) {
      await pool.query(`INSERT INTO growth_event (type, bot_id, dedup_key) SELECT 'badge_impression', $1, 'imp:' || g FROM generate_series($2::int, $3::int) g`, [s.bot, i, i + 499]);
    }
    for (let i = 0; i < 6; i++) await pool.query(`INSERT INTO growth_event (type, bot_id, visitor_session_id, dedup_key) VALUES ('badge_click', $1, $2, $3)`, [s.bot, vs, `clk:${i}`]);
    const arrived = await seed();
    await recordArrival(pool, arrived.account, 'shop.example');
    await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, dedup_key) VALUES ('first_answer', $1, $2, $3)`, [arrived.bot, arrived.account, `first_answer:${arrived.bot}`]);
    const m = await growthMetrics(pool, 7);
    expect([m.badge_impressions, m.badge_clicks, m.i_per_1000]).toEqual([2000, 6, 3]);
    // Аккаунт из теста AC-8 тоже пришёл по бейджу, но без first_answer: считаем прирост от исходного снимка.
    expect([m.arrivals - empty.arrivals, m.arrivals_activated - empty.arrivals_activated, m.conv_percent]).toEqual([1, 1, 16.7]);
    await expect(growthMetrics(pool, 0)).rejects.toThrow();
  });

  it('AC-12: сторож удаляет пустые сессии старше суток; с журналом, событием, историей или свежие — остаются', async () => {
    const s = await seed();
    const old = async () => { const id = await session(s.bot); await pool.query(`UPDATE visitor_session SET created_at = now() - interval '25 hours' WHERE id = $1`, [id]); return id; };
    const idle = await old(), withLog = await old(), withEvent = await old(), withHistory = await old(), fresh = await session(s.bot);
    await log(s.bot, withLog, 'answered');
    await pool.query(`INSERT INTO growth_event (type, bot_id, visitor_session_id, dedup_key) VALUES ('badge_impression', $1, $2, $3)`, [s.bot, withEvent, `imp:${randomUUID()}`]);
    await pool.query(`UPDATE visitor_session SET history = jsonb_build_array(jsonb_build_object('question', 'q', 'answer', 'a', 'at', now())), history_at = now() WHERE id = $1`, [withHistory]);
    expect(await sweepIdleVisitorSessions(pool, 1000)).toBeGreaterThanOrEqual(1);
    const left = (await pool.query<{ id: string }>('SELECT id FROM visitor_session WHERE bot_id = $1', [s.bot])).rows.map((r) => r.id).sort();
    expect(left).toEqual([withLog, withEvent, withHistory, fresh].sort());
    expect(left).not.toContain(idle);
    // Вопрос с сессией остался в сводке.
    expect((await readBotSummary(pool, s.bot, s.account))!.answered).toBe(1);
  });
});
