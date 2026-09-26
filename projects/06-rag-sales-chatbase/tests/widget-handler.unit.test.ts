// Маршруты виджета без БД (фича widget-runtime-and-badge): CheckOrigin и CORS (FR-WIDGET-002, ADR-005 Confirmation
// «ровно ОДИН Access-Control-Allow-Origin»), ResolveWidgetConfig (404/403/200, бейдж — сервер), события бейджа,
// раздача бандла со старым хэшем (A-N6-034). Хранилище подменено словарём; SQL — tests/widget-config.integration.test.ts.
import { describe, expect, it } from 'vitest';
import type { WidgetBotRow } from '../packages/db/src/widget';
import { checkOrigin, requestOrigin } from '../apps/web/src/server/check-origin';
import { parseAllowedOrigin } from '../packages/rag/src/bot-settings';
import { createWidgetConfigHandler, createWidgetEventHandler, createWidgetPreflightHandler, type WidgetDependencies } from '../apps/web/src/server/widget-handler';
import { createWidgetBundleHandler } from '../apps/web/src/server/widget-bundle';
import { issueVisitorToken, readVisitorToken } from '../apps/web/src/server/visitor-token';

const PUBLIC = 'https://sufler.example';
const HOST = 'https://shop.example';
const KEY = 'AbCdEfGhIjKlMnOpQrStUv';
const SECRET = 'unit-secret-0123456789abcdef0123456789abcdef';
const BOT_ID = '11111111-1111-4111-8111-111111111111';
const PREFIX = '203.0.113.0/24';
// Токен сессии посетителя — только выданный сервером (visitor-token.ts): подпись по боту, origin и /24.
const VS = issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: PREFIX });
const VS_ID = VS.split('.')[0]!;
const row = (over: Partial<WidgetBotRow> = {}): WidgetBotRow => ({ botId: BOT_ID, status: 'active', companyName: 'Пекарня «Колос»',
  greeting: 'Здравствуйте!', contact: '+7 900 000-00-00', publicEnabled: false, plan: 'free', accountStatus: 'active', origins: [HOST], answersVerified: true, ...over });

function harness(bot: WidgetBotRow | null = row()) {
  const installs: Array<{ origin: string; event: string }> = [];
  const events: Array<{ type: string; origin: string; ipPrefix: string }> = [];
  const deps: WidgetDependencies = {
    publicOrigin: PUBLIC, secret: SECRET,
    loadBot: async (key) => (key === KEY ? bot : null),
    originAllowedAnywhere: async (origin) => origin === HOST,
    recordInstall: async (input) => { installs.push(input); return 'recorded'; },
    recordBadgeEvent: async (input) => { events.push(input); return input.visitorSession === VS_ID ? 'recorded' : 'foreign_session'; },
    allowMutation: async () => true, log: () => {},
  };
  const config = (origin: string | null, key = KEY, vs = '') => createWidgetConfigHandler(deps)(new Request(`${PUBLIC}/w/v1/config?bot=${key}${vs ? `&vs=${vs}` : ''}`,
    { headers: { 'x-forwarded-for': '203.0.113.9', ...(origin ? { origin } : {}) } }));
  const event = (origin: string | null, body: unknown) => createWidgetEventHandler(deps)(new Request(`${PUBLIC}/w/v1/event`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }));
  const preflight = (origin: string) => createWidgetPreflightHandler(deps)(new Request(`${PUBLIC}/w/v1/event`, { method: 'OPTIONS', headers: { origin } }));
  return { deps, installs, events, config, event, preflight };
}
const acao = (r: Response) => (r.headers.get('access-control-allow-origin')?.split(', ') ?? []);

describe('CheckOrigin: точный origin из списка бота', () => {
  const bot = { origins: [HOST], publicEnabled: false };
  it('Origin разбирается строго: null, пустой, с путём, не http(s), с учётными данными — отказ', () => {
    for (const bad of ['null', '', 'https://shop.example/path', 'https://shop.example/', 'file:///x', 'chrome-extension://abc', 'https://u:p@shop.example', 'shop.example']) {
      expect(requestOrigin(new Headers(bad ? { origin: bad } : {})), bad).toBeNull();
    }
    expect(requestOrigin(new Headers({ origin: 'https://SHOP.example:443' }))).toBe(HOST);
  });
  it('поддомен, другой порт, другая схема, похожий домен — не допускаются', () => {
    for (const other of ['https://www.shop.example', 'https://shop.example:8443', 'http://shop.example', 'https://shop.example.evil', 'https://evilshop.example']) {
      expect(checkOrigin(other, bot, PUBLIC), other).toBeNull();
    }
    expect(checkOrigin(HOST, bot, PUBLIC)).toBe(HOST);
  });
  it('ревью widget L-1: Origin с точкой в конце — отказ (не совпадает с хранимым без точки); punycode — совпадает с тем, что сохранил кабинет', () => {
    // Хозяин «shop.example.» (FQDN с точкой) — другой origin для браузера: CORS с ним не откроется, и это fail-closed.
    for (const dotted of ['https://shop.example.', 'https://SHOP.example.:443', 'https://shop.example..']) {
      const origin = requestOrigin(new Headers({ origin: dotted }));
      expect(origin, dotted).not.toBe(HOST);
      expect(checkOrigin(origin, bot, PUBLIC), dotted).toBeNull();
    }
    // Кириллический домен: кабинет хранит punycode (parseAllowedOrigin), браузер шлёт Origin в punycode.
    const stored = parseAllowedOrigin('пекарня.рф', PUBLIC);
    expect(stored).toEqual({ ok: true, origin: 'https://xn--80ajpngj0i.xn--p1ai' });
    const cyr = { origins: [stored.ok ? stored.origin : ''], publicEnabled: false };
    expect(checkOrigin(requestOrigin(new Headers({ origin: 'https://xn--80ajpngj0i.xn--p1ai' })), cyr, PUBLIC)).toBe('https://xn--80ajpngj0i.xn--p1ai');
    expect(checkOrigin(requestOrigin(new Headers({ origin: 'https://XN--80AJPNGJ0I.XN--P1AI' })), cyr, PUBLIC)).toBe('https://xn--80ajpngj0i.xn--p1ai');
    // Похожий punycode-домен (другая метка) и Unicode-форма, которую браузер не шлёт, — не совпадают.
    expect(checkOrigin(requestOrigin(new Headers({ origin: 'https://xn--80ajghhoc2aj1c.xn--p1ai' })), cyr, PUBLIC)).toBeNull();
    expect(checkOrigin('https://пекарня.рф', cyr, PUBLIC)).toBeNull();
  });
  it('свой origin (демо-страница) — только при public_enabled', () => {
    expect(checkOrigin(PUBLIC, bot, PUBLIC)).toBeNull();
    expect(checkOrigin(PUBLIC, { ...bot, publicEnabled: true }, PUBLIC)).toBe(PUBLIC);
  });
});

describe('GET /w/v1/config', () => {
  it('origin из списка — 200, РОВНО один ACAO = origin хозяина, Vary: Origin, без Allow-Credentials и без *', async () => {
    const h = harness();
    const r = await h.config(HOST);
    expect(r.status).toBe(200);
    expect(acao(r)).toEqual([HOST]);
    expect(r.headers.get('vary')).toBe('Origin');
    expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = await r.json() as { data: Record<string, unknown> };
    const { visitor_session: token, ...rest } = body.data;
    expect(rest).toEqual({ company_name: 'Пекарня «Колос»', greeting: 'Здравствуйте!', contact: '+7 900 000-00-00',
      badge_required: true, badge_href: 'https://sufler.example/?from=shop.example&utm_source=badge' });
    // Токен сессии посетителя выдан сервером и подписан для ЭТОГО бота, origin и /24.
    expect(readVisitorToken(SECRET, token, { botId: BOT_ID, origin: HOST, ipPrefix: PREFIX })).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.installs).toEqual([{ botId: row().botId, origin: HOST, event: 'first_config' }]);
  });
  it('origin вне списка — 403 origin_not_allowed БЕЗ ACAO и без записи установки', async () => {
    for (const origin of ['https://evil.example', null, 'null']) {
      const h = harness();
      const r = await h.config(origin);
      expect(r.status, String(origin)).toBe(403);
      expect(acao(r)).toEqual([]);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('origin_not_allowed');
      expect(h.installs).toEqual([]);
    }
  });
  it('404: нет бота, непригодный ключ, черновик, удалён, неизвестный статус, владелец не активен, нет годного контакта', async () => {
    const cases: Array<[string, WidgetBotRow | null, string?]> = [
      ['нет бота', null], ['ключ', row(), 'short'], ['draft', row({ status: 'draft' })], ['deleted', row({ status: 'deleted' })],
      ['ACTIVE', row({ status: 'ACTIVE' })], ['erasing', row({ accountStatus: 'erasing' })], ['null-владелец', row({ accountStatus: null })],
      ['без контакта', row({ contact: null })], ['контакт вне форм', row({ contact: 'позвоните нам' })], ['javascript:', row({ contact: 'javascript:alert(1)' })],
    ];
    for (const [name, bot, key] of cases) {
      const h = harness(bot);
      const r = await h.config(HOST, key ?? KEY);
      expect(r.status, name).toBe(404);
      expect(acao(r), name).toEqual([]);
      expect(h.installs, name).toEqual([]);
    }
  });
  it('SC-US-011-2: план nobadge/studio — badge_required = false и ссылки нет; опечатка плана — бейдж', async () => {
    for (const plan of ['nobadge', 'studio']) {
      const body = await (await harness(row({ plan })).config(HOST)).json() as { data: { badge_required: boolean; badge_href: string | null } };
      expect(body.data).toMatchObject({ badge_required: false, badge_href: null });
    }
    for (const plan of ['NOBADGE', ' nobadge', null, '']) {
      const body = await (await harness(row({ plan })).config(HOST)).json() as { data: { badge_required: boolean } };
      expect(body.data.badge_required, String(plan)).toBe(true);
    }
  });
  it('клиент не может снять бейдж параметром запроса', async () => {
    const h = harness();
    const r = await createWidgetConfigHandler(h.deps)(new Request(`${PUBLIC}/w/v1/config?bot=${KEY}&badge_required=false&plan=nobadge`,
      { headers: { origin: HOST, 'x-forwarded-for': '203.0.113.9' } }));
    expect(((await r.json()) as { data: { badge_required: boolean } }).data.badge_required).toBe(true);
  });
  it('токен сессии: годный прежний продолжается; чужой бот, другой origin, другой /24, подделанная подпись — новый', async () => {
    const h = harness();
    const token = async (vs: string, origin = HOST) => ((await (await h.config(origin, KEY, vs)).json()) as { data: { visitor_session: string } }).data.visitor_session;
    expect(await token(VS)).toBe(VS);
    const forged = `${VS_ID}.${'A'.repeat(43)}`;
    const otherBot = issueVisitorToken(SECRET, { botId: '22222222-2222-4222-8222-222222222222', origin: HOST, ipPrefix: PREFIX });
    const otherNet = issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: '198.51.100.0/24' });
    const otherSecret = issueVisitorToken('другой-секрет-0123456789abcdef0123456789', { botId: BOT_ID, origin: HOST, ipPrefix: PREFIX });
    for (const bad of [forged, otherBot, otherNet, otherSecret, 'мусор']) {
      const fresh = await token(encodeURIComponent(bad));
      expect(fresh, bad).not.toBe(bad);
      expect(readVisitorToken(SECRET, fresh, { botId: BOT_ID, origin: HOST, ipPrefix: PREFIX }), bad).not.toBeNull();
    }
  });
});

describe('OPTIONS /w/v1/* — предполётный запрос', () => {
  it('/w/v1/ask?bot= — разрешение по списку ЭТОГО бота: origin другого бота — 403', async () => {
    const h = harness();
    const pre = (origin: string, key = KEY) => createWidgetPreflightHandler(h.deps)(new Request(`${PUBLIC}/w/v1/ask?bot=${key}`, { method: 'OPTIONS', headers: { origin } }));
    const ok = await pre(HOST);
    expect(ok.status).toBe(204);
    expect(acao(ok)).toEqual([HOST]);
    for (const [origin, key] of [['https://evil.example', KEY], [HOST, 'NoSuchBotKey0123456789']] as const) {
      const r = await pre(origin, key);
      expect(r.status, `${origin} ${key}`).toBe(403);
      expect(acao(r)).toEqual([]);
    }
  });
  it('origin из списка какого-либо бота — 204 с методами и заголовками; чужой — 403 без ACAO', async () => {
    const h = harness();
    const ok = await h.preflight(HOST);
    expect(ok.status).toBe(204);
    expect(acao(ok)).toEqual([HOST]);
    expect(ok.headers.get('access-control-allow-methods')).toBe('GET, POST');
    expect(ok.headers.get('access-control-allow-headers')).toBe('Content-Type');
    const bad = await h.preflight('https://evil.example');
    expect(bad.status).toBe(403);
    expect(acao(bad)).toEqual([]);
  });
});

describe('POST /w/v1/event', () => {
  it('показ и клик бейджа — 204 с ACAO, префикс IP, а не полный адрес', async () => {
    const h = harness();
    for (const type of ['badge_impression', 'badge_click']) {
      const r = await h.event(HOST, { bot: KEY, visitor_session: VS, type });
      expect(r.status, type).toBe(204);
      expect(acao(r)).toEqual([HOST]);
    }
    expect(h.events.map((e) => [e.type, e.origin, e.ipPrefix])).toEqual([['badge_impression', HOST, '203.0.113.0/24'], ['badge_click', HOST, '203.0.113.0/24']]);
  });
  it('чужой origin — 403 без записи; неизвестный тип, лишнее поле, непригодная сессия — 400; чужая сессия — 400 invalid_session', async () => {
    const h = harness();
    expect((await h.event('https://evil.example', { bot: KEY, visitor_session: VS, type: 'badge_click' })).status).toBe(403);
    expect((await h.event(HOST, { bot: KEY, visitor_session: VS, type: 'widget_install' })).status).toBe(400);
    expect((await h.event(HOST, { bot: KEY, visitor_session: VS, type: 'badge_click', plan: 'nobadge' })).status).toBe(400);
    expect((await h.event(HOST, { bot: KEY, visitor_session: 'x', type: 'badge_click' })).status).toBe(400);
    // id, придуманный клиентом (голый UUID, как раньше генерировал виджет), и токен чужой привязки — не сессия.
    for (const bad of ['4f2c1a9e-5b7d-4c8e-9f10-2a3b4c5d6e7f', VS_ID, issueVisitorToken(SECRET, { botId: BOT_ID, origin: HOST, ipPrefix: '198.51.100.0/24' })]) {
      const foreign = await h.event(HOST, { bot: KEY, visitor_session: bad, type: 'badge_click' });
      expect(foreign.status, bad).toBe(400);
      expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe('invalid_session');
    }
    const other = await h.event(HOST, { bot: KEY, visitor_session: VS.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), type: 'badge_click' });
    expect(other.status).toBe(400);
    expect(h.events.filter((e) => e.origin !== HOST)).toEqual([]);
  });
  it('бот без бейджа (nobadge) — 204 без записи: показов не было', async () => {
    const h = harness(row({ plan: 'nobadge' }));
    expect((await h.event(HOST, { bot: KEY, visitor_session: VS, type: 'badge_impression' })).status).toBe(204);
    expect(h.events).toEqual([]);
  });
});

describe('GET /w/widget.<hash>.js — бандл и старые хэши (A-N6-034)', () => {
  const handler = createWidgetBundleHandler(async () => ({ file: 'widget.0123456789abcdef.js', code: Buffer.from('/*w*/') }));
  it('текущий хэш — immutable; СТАРЫЙ хэш — тот же текущий бандл с коротким кэшем; мусор — 404', async () => {
    const current = await handler(new Request(`${PUBLIC}/w/widget.0123456789abcdef.js`), 'widget.0123456789abcdef.js');
    expect(current.status).toBe(200);
    expect(current.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(current.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const old = await handler(new Request(`${PUBLIC}/w/widget.deadbeef.js`), 'widget.deadbeef.js');
    expect(old.status).toBe(200);
    expect(old.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await old.text()).toBe('/*w*/');
    for (const bad of ['widget.js', 'widget.XYZ.js', '..%2Fetc', 'manifest.json']) expect((await handler(new Request(`${PUBLIC}/w/${bad}`), bad)).status, bad).toBe(404);
  });
  it('бандл не собран — 404, а не пустой скрипт', async () => {
    const r = await createWidgetBundleHandler(async () => null)(new Request(`${PUBLIC}/w/widget.deadbeef.js`), 'widget.deadbeef.js');
    expect(r.status).toBe(404);
  });
});
