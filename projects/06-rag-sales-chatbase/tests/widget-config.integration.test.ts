// widget-runtime-and-badge на НАСТОЯЩЕМ Postgres 16 + pgvector 0.8.6: ResolveWidgetConfig по боевой связке
// createWidgetDependencies (подменён только ограничитель двери). SC-US-011-2 (оператор назначил nobadge → следующий
// config без бейджа), CheckOrigin против allowed_origin из БД, RecordWidgetInstall (first_config; first_answer — одна
// строка при одновременных ответах; свой origin не установка), метрика недели, события бейджа с дедупликацией
// на сессию и сутки, привязка сессии посетителя к боту.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createPool, externalInstallCount, recordWidgetInstall, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { createWidgetDependencies } from '../apps/web/src/server/widget-deps';
import { createWidgetConfigHandler, createWidgetEventHandler, createWidgetPreflightHandler } from '../apps/web/src/server/widget-handler';
import { ensureTestDatabase } from '../scripts/test-db.mjs';

const databaseUrl = process.env.DATABASE_URL;
const PUBLIC = 'https://sufler.test.invalid';
const HOST = 'https://shop.example';
const acao = (r: Response) => (r.headers.get('access-control-allow-origin')?.split(', ') ?? []);
type Json = { data?: { badge_required: boolean; badge_href: string | null; contact: string }; error?: { code: string } };

describe.skipIf(!databaseUrl)('виджет: конфигурация, установки, бейдж на настоящем Postgres', () => {
  let pool: Pool;
  const schema = `widget_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Интеграционные тесты разрешены только в отдельной БД *_test');
    await ensureTestDatabase(databaseUrl);
    pool = createPool(databaseUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
  }, 60_000);
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); } });

  async function seed(over: { plan?: string; contact?: string | null; origins?: string[]; publicEnabled?: boolean } = {}) {
    const account = (await pool.query<{ id: string }>(`INSERT INTO account (email, password_hash, plan) VALUES ($1, 'x', $2) RETURNING id`,
      [`w${randomBytes(6).toString('hex')}@example.ru`, over.plan ?? 'free'])).rows[0]!.id;
    const key = randomBytes(16).toString('base64url');
    const bot = (await pool.query<{ id: string }>(`INSERT INTO bot (account_id, status, public_key, company_name, contact, greeting, public_enabled)
      VALUES ($1, 'active', $2, 'Пекарня «Колос»', $3, 'Здравствуйте!', $4) RETURNING id`,
    [account, key, over.contact === undefined ? '+7 900 000-00-00' : over.contact, over.publicEnabled ?? false])).rows[0]!.id;
    for (const origin of over.origins ?? [HOST]) await pool.query('INSERT INTO allowed_origin (bot_id, origin) VALUES ($1, $2)', [bot, origin]);
    return { account, bot, key };
  }
  const deps = () => createWidgetDependencies({ pool, publicOrigin: PUBLIC, allowMutation: async () => true, log: () => {} });
  const config = (key: string, origin: string | null) => createWidgetConfigHandler(deps())(new Request(`${PUBLIC}/w/v1/config?bot=${key}`, { headers: origin ? { origin } : {} }));
  const event = (key: string, origin: string, vs: string, type: string) => createWidgetEventHandler(deps())(new Request(`${PUBLIC}/w/v1/event`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.23' }, body: JSON.stringify({ bot: key, visitor_session: vs, type }) }));
  const installs = async (bot: string) => (await pool.query<{ origin: string; first_answer_at: Date | null }>('SELECT origin, first_answer_at FROM widget_install WHERE bot_id = $1', [bot])).rows;

  it('origin из списка бота: 200, ровно один ACAO, бейдж на free, установка first_config записана один раз', async () => {
    const s = await seed();
    const r = await config(s.key, HOST);
    expect(r.status).toBe(200);
    expect(acao(r)).toEqual([HOST]);
    expect(r.headers.get('vary')).toBe('Origin');
    const body = await r.json() as Json;
    expect(body.data).toMatchObject({ badge_required: true, badge_href: `${PUBLIC}/?from=shop.example&utm_source=badge`, contact: '+7 900 000-00-00' });
    await config(s.key, HOST);
    expect(await installs(s.bot)).toEqual([{ origin: HOST, first_answer_at: null }]);
  });

  it('origin вне списка (другой бот, поддомен, другая схема) — 403 без ACAO и без строки установки', async () => {
    const s = await seed();
    const other = await seed({ origins: ['https://other.example'] });
    for (const origin of ['https://other.example', 'https://www.shop.example', 'http://shop.example', 'https://evil.example']) {
      const r = await config(s.key, origin);
      expect(r.status, origin).toBe(403);
      expect(acao(r), origin).toEqual([]);
    }
    expect(await installs(s.bot)).toEqual([]);
    expect((await config(other.key, HOST)).status).toBe(403);
  });

  it('SC-US-011-2: оператор назначил nobadge — СЛЕДУЮЩИЙ config отвечает badge_required = false; studio — тоже; назад free — бейдж', async () => {
    const s = await seed();
    expect(((await (await config(s.key, HOST)).json()) as Json).data!.badge_required).toBe(true);
    for (const [plan, expected] of [['nobadge', false], ['studio', false], ['free', true]] as const) {
      await pool.query('UPDATE account SET plan = $2 WHERE id = $1', [s.account, plan]);
      const body = await (await config(s.key, HOST)).json() as Json;
      expect(body.data!.badge_required, plan).toBe(expected);
      expect(body.data!.badge_href === null, plan).toBe(!expected);
    }
  });

  it('404: без контакта, контакт вне форм, бот удалён, аккаунт стирается, неизвестный ключ', async () => {
    expect((await config((await seed({ contact: null })).key, HOST)).status).toBe(404);
    expect((await config((await seed({ contact: 'позвоните нам' })).key, HOST)).status).toBe(404);
    const deleted = await seed();
    await pool.query(`UPDATE bot SET status = 'deleted' WHERE id = $1`, [deleted.bot]);
    expect((await config(deleted.key, HOST)).status).toBe(404);
    const erasing = await seed();
    await pool.query(`UPDATE account SET status = 'erasing', erase_deadline = now() + interval '72 hours' WHERE id = $1`, [erasing.account]);
    expect((await config(erasing.key, HOST)).status).toBe(404);
    expect((await config(randomBytes(16).toString('base64url'), HOST)).status).toBe(404);
  });

  it('свой origin (демо-страница): только при public_enabled и установкой НЕ считается', async () => {
    const closed = await seed();
    expect((await config(closed.key, PUBLIC)).status).toBe(403);
    const open = await seed({ publicEnabled: true });
    expect((await config(open.key, PUBLIC)).status).toBe(200);
    expect(await installs(open.bot)).toEqual([]);
  });

  it('first_answer: одновременные ответы дают РОВНО одно событие widget_install; метрика считает только установки с ответом', async () => {
    const since = new Date(Date.now() - 60_000);
    const before = await externalInstallCount(pool, since);
    const s = await seed({ origins: [HOST, 'https://second.example'] });
    await config(s.key, HOST);
    await config(s.key, 'https://second.example');
    expect(await externalInstallCount(pool, since)).toBe(before);   // конфигурация без ответа — «ждёт первого вопроса»
    const results = await Promise.all(Array.from({ length: 8 }, () => recordWidgetInstall(pool, { botId: s.bot, origin: HOST, publicOrigin: PUBLIC, event: 'first_answer' })));
    expect(results.filter((r) => r === 'installed')).toHaveLength(1);
    const growth = await pool.query(`SELECT from_domain FROM growth_event WHERE type = 'widget_install' AND bot_id = $1`, [s.bot]);
    expect(growth.rows).toEqual([{ from_domain: 'shop.example' }]);
    expect(await externalInstallCount(pool, since)).toBe(before + 1);
    expect(await recordWidgetInstall(pool, { botId: s.bot, origin: PUBLIC, publicOrigin: PUBLIC, event: 'first_answer' })).toBe('own_origin');
  });

  it('события бейджа: показ один раз на сессию в сутки, клик отдельно; сессия чужого бота — 400; неразрешённый origin — 403', async () => {
    const s = await seed();
    const other = await seed();
    const vs = crypto.randomUUID();
    expect((await event(s.key, HOST, vs, 'badge_impression')).status).toBe(204);
    expect((await event(s.key, HOST, vs, 'badge_impression')).status).toBe(204);
    expect((await event(s.key, HOST, vs, 'badge_click')).status).toBe(204);
    const rows = (await pool.query<{ type: string; n: number }>(`SELECT type, count(*)::int AS n FROM growth_event WHERE bot_id = $1 GROUP BY type ORDER BY type`, [s.bot])).rows;
    expect(rows).toEqual([{ type: 'badge_click', n: 1 }, { type: 'badge_impression', n: 1 }]);
    const session = (await pool.query<{ ip_prefix: string; origin: string }>('SELECT ip_prefix::text, origin FROM visitor_session WHERE id = $1', [vs])).rows[0];
    expect(session).toEqual({ ip_prefix: '198.51.100.0/24', origin: HOST });
    const foreign = await event(other.key, HOST, vs, 'badge_impression');
    expect(foreign.status).toBe(400);
    expect((await event(s.key, 'https://evil.example', crypto.randomUUID(), 'badge_click')).status).toBe(403);
  });

  it('предполётный запрос: origin из списка любого бота — 204; неизвестный — 403', async () => {
    await seed({ origins: ['https://preflight.example'] });
    const ok = await createWidgetPreflightHandler(deps())(new Request(`${PUBLIC}/w/v1/event`, { method: 'OPTIONS', headers: { origin: 'https://preflight.example' } }));
    expect(ok.status).toBe(204);
    expect(acao(ok)).toEqual(['https://preflight.example']);
    const bad = await createWidgetPreflightHandler(deps())(new Request(`${PUBLIC}/w/v1/event`, { method: 'OPTIONS', headers: { origin: 'https://nobody.example' } }));
    expect(bad.status).toBe(403);
  });
});
