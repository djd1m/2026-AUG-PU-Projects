// bot-cabinet без БД: граница ввода (контакт, домен → origin, название, приветствие), InstallSnippet (без контакта кода
// нет; без бандла кода нет), лента стадий источника (адаптация N5 progress-ribbon: молчание — не «идёт»), манифест
// бандла виджета, порядок входа маршрутов кабинета (лимит → Origin → сессия ДО тела и ДО зависимостей).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installSnippet, parseAllowedOrigin, parseCompanyName, parseContact, parseGreeting, readContact } from '../packages/rag/src/bot-settings';
import { ribbonOf, type RibbonJob } from '../apps/web/src/lib/source-ribbon';
import { readWidgetBundleFile } from '../apps/web/src/server/widget-bundle';
import { createBotCreateHandler, createOwnerAskHandler, type CabinetDependencies } from '../apps/web/src/server/cabinet-handler';

const ORIGIN = 'https://sufler.test.invalid';
const KEY = 'AbCdEfGhIjKlMnOpQrStUv';

describe('контакт для «не знаю»', () => {
  it('принимает почту, телефон, https-ссылку; нормализует', () => {
    expect(parseContact(' Info@Kolos.RU ')).toEqual({ ok: true, value: 'info@kolos.ru', kind: 'email' });
    expect(parseContact('+7 900  000-00-00')).toEqual({ ok: true, value: '+7 900 000-00-00', kind: 'phone' });
    expect(parseContact('8 (495) 123-45-67')).toMatchObject({ ok: true, kind: 'phone' });
    expect(parseContact('https://t.me/kolos_bakery')).toEqual({ ok: true, value: 'https://t.me/kolos_bakery', kind: 'link' });
  });
  it('отвергает всё остальное: пусто, не строка, текст, http, javascript:, IP, короткий телефон, перевод строки, невидимые символы', () => {
    for (const bad of [undefined, null, 42, ['a@b.ru'], '', '   ', 'позвоните', 'http://kolos.ru', 'javascript:alert(1)', 'data:text/html,x',
      'https://1.2.3.4/', 'https://user:pw@kolos.ru', '12345', '+7 900', 'a@b.ru\nb', 'a\u202e@b.ru', 'x'.repeat(301) + '@b.ru', 'a..b@c.ru']) {
      expect(parseContact(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('readContact читает из БД fail-closed: старая строка без формы — как отсутствие', () => {
    expect(readContact('позвоните нам')).toBeNull();
    expect(readContact(null)).toBeNull();
    expect(readContact('info@kolos.ru')).toBe('info@kolos.ru');
  });
});

describe('название и приветствие', () => {
  it('название: пробелы схлопываются, 1…200 символов, без служебных', () => {
    expect(parseCompanyName('  Пекарня   «Колос» ')).toEqual({ ok: true, value: 'Пекарня «Колос»' });
    for (const bad of ['', '  ', 7, 'а'.repeat(201), 'x\u0000y']) expect(parseCompanyName(bad).ok, String(bad)).toBe(false);
    expect(parseCompanyName('я'.repeat(200)).ok).toBe(true);
  });
  it('приветствие: может быть пустым, одна строка ≤ 300', () => {
    expect(parseGreeting('')).toEqual({ ok: true, value: '' });
    expect(parseGreeting('a\nb').ok).toBe(false);
    expect(parseGreeting('я'.repeat(301)).ok).toBe(false);
  });
});

describe('AddAllowedOrigin: домен → origin', () => {
  it('https по умолчанию, http и нестандартный порт — явно', () => {
    expect(parseAllowedOrigin('Shop.Example', ORIGIN)).toEqual({ ok: true, origin: 'https://shop.example' });
    expect(parseAllowedOrigin('https://www.shop.example/', ORIGIN)).toEqual({ ok: true, origin: 'https://www.shop.example' });
    expect(parseAllowedOrigin('http://stand.example:8099', ORIGIN)).toEqual({ ok: true, origin: 'http://stand.example:8099' });
    expect(parseAllowedOrigin('https://shop.example:443', ORIGIN)).toEqual({ ok: true, origin: 'https://shop.example' });
    expect(parseAllowedOrigin('магазин.рф', ORIGIN)).toEqual({ ok: true, origin: 'https://xn--80aairftm.xn--p1ai' });
  });
  it('отказ: путь, запрос, IP (частный и публичный), localhost, без точки, чужая схема, учётные данные, наш origin', () => {
    for (const bad of ['shop.example/catalog', 'shop.example?a=1', 'shop.example#x', '10.0.0.5', '93.184.216.34', '[::1]', 'localhost', 'app.localhost',
      'intranet', 'ftp://shop.example', 'user:pw@shop.example', ORIGIN, 'sufler.test.invalid', 'shop .example', '', 7, '-bad-.example']) {
      expect(parseAllowedOrigin(bad, ORIGIN).ok, String(bad)).toBe(false);
    }
  });
});

describe('InstallSnippet', () => {
  const base = { publicKey: KEY, publicOrigin: ORIGIN, bundleFile: 'widget.deadbeef01.js' };
  it('SC-US-005-3: без контакта — contact_required и НИКАКОГО тега', () => {
    for (const contact of [null, undefined, '', '  ', 'позвоните нам']) {
      const result = installSnippet({ ...base, contact });
      expect(result).toEqual({ kind: 'contact_required' });
      expect(JSON.stringify(result)).not.toContain('<script');
    }
  });
  it('SC-US-005-1: с контактом — тег async data-bot + три директивы CSP без unsafe-inline', () => {
    const result = installSnippet({ ...base, contact: 'info@kolos.ru' });
    expect(result).toEqual({ kind: 'ready', tag: `<script src="${ORIGIN}/w/widget.deadbeef01.js" data-bot="${KEY}" async></script>`,
      directives: [`script-src ${ORIGIN}`, `connect-src ${ORIGIN}`, `img-src ${ORIGIN} data:`] });
    expect(JSON.stringify(result)).not.toContain('unsafe-inline');
  });
  it('без собранного бандла (или с непригодным именем) — bundle_missing, тега нет', () => {
    for (const bundleFile of [null, '', 'widget.js', '../widget.aaaaaaaa.js', 'widget.ZZZZZZZZ.js']) {
      expect(installSnippet({ ...base, bundleFile, contact: 'info@kolos.ru' }).kind, String(bundleFile)).toBe('bundle_missing');
    }
  });
  it('манифест сборки: { file } читается; нет файла, мусор, чужое имя — null', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'n6-manifest-'));
    expect(await readWidgetBundleFile(dir)).toBeNull();
    mkdirSync(path.join(dir, 'apps/web/widget-bundle'), { recursive: true });
    const manifest = path.join(dir, 'apps/web/widget-bundle/manifest.json');
    writeFileSync(manifest, '{ мусор');
    expect(await readWidgetBundleFile(dir)).toBeNull();
    writeFileSync(manifest, JSON.stringify({ file: '../../etc/passwd' }));
    expect(await readWidgetBundleFile(dir)).toBeNull();
    writeFileSync(manifest, JSON.stringify({ file: 'widget.0a1b2c3d.js' }));
    expect(await readWidgetBundleFile(dir)).toBe('widget.0a1b2c3d.js');
  });
});

describe('лента стадий источника (адаптация N5 progress-ribbon)', () => {
  const job = (over: Partial<RibbonJob>): RibbonJob => ({ state: 'running', queued: false, pages_done: 0, pages_total: null, chunks_done: 0, ...over });
  const views = (r: ReturnType<typeof ribbonOf>) => r.steps.map((s) => `${s.key}:${s.view}${s.detail ? `(${s.detail})` : ''}`);
  it('очередь → чтение «k из N» → фрагменты → успех', () => {
    expect(views(ribbonOf(job({ queued: true }), 'site'))).toEqual(['queue:running', 'read:pending', 'index:pending']);
    expect(views(ribbonOf(job({ pages_done: 3, pages_total: 50 }), 'site'))).toEqual(['queue:done', 'read:running(3 из 50 страниц)', 'index:pending']);
    expect(views(ribbonOf(job({ pages_done: 4, pages_total: 50, chunks_done: 17 }), 'site'))).toEqual(['queue:done', 'read:running(4 из 50 страниц)', 'index:running(17 фрагм.)']);
    expect(views(ribbonOf(job({ pages_done: 50, pages_total: 50, chunks_done: 90 }), 'site'))).toEqual(['queue:done', 'read:done(50 из 50 страниц)', 'index:running(90 фрагм.)']);
    const done = ribbonOf(job({ state: 'done', pages_done: 12, pages_total: 12, chunks_done: 40 }), 'pdf');
    expect(done.tone).toBe('success');
    expect(views(done)).toEqual(['queue:done', 'read:done(12 из 12 стр. PDF)', 'index:done(40 фрагм.)']);
  });
  it('молчание ≥ 5 мин — «нет ответа», не «идёт»; источник без задачи — тоже', () => {
    const silent = ribbonOf(job({ state: 'no_response', pages_done: 2 }), 'site');
    expect(silent.tone).toBe('silent');
    expect(views(silent)).toEqual(['queue:done', 'read:silent(2 страниц)', 'index:pending']);
    expect(ribbonOf(null, 'site').tone).toBe('silent');
  });
  it('стадия отказа — по причине: robots на чтении, эмбеддинги на фрагментах, неизвестная — по прогрессу', () => {
    expect(views(ribbonOf(job({ state: 'failed', reason: 'robots_disallowed' }), 'site'))).toEqual(['queue:done', 'read:failed', 'index:pending']);
    expect(views(ribbonOf(job({ state: 'failed', reason: 'embedding_unavailable', pages_done: 1 }), 'site'))).toEqual(['queue:done', 'read:done(1 страниц)', 'index:failed']);
    expect(ribbonOf(job({ state: 'failed', reason: 'stalled', chunks_done: 3 }), 'site').steps[2]!.view).toBe('failed');
    expect(ribbonOf(job({ state: 'failed', reason: 'что-то новое' }), 'site').tone).toBe('failure');
  });
});

describe('порядок входа маршрутов кабинета', () => {
  function deps(calls: string[], over: Partial<CabinetDependencies> = {}): CabinetDependencies {
    const touch = (name: string) => async () => { calls.push(name); throw new Error(`${name} не должен вызываться`); };
    return {
      publicOrigin: ORIGIN, authenticate: async () => { calls.push('auth'); return { account_id: '11111111-1111-4111-8111-111111111111' }; },
      allowMutation: async () => { calls.push('limit'); return true; },
      listBots: touch('list'), createBot: touch('create'), newPublicKey: () => KEY, updateSettings: touch('update'), addOrigin: touch('origin'),
      checkAddress: touch('check'), ownsBot: touch('owns'), createSite: touch('site'), findJob: touch('find'), retry: touch('retry'),
      enqueue: touch('enqueue'), answer: touch('answer'), setVerified: touch('verify'), log: () => {}, ...over,
    };
  }
  const request = (headers: Record<string, string>, body: unknown = {}) => new Request(`${ORIGIN}/api/bots`, { method: 'POST',
    headers: { 'x-forwarded-for': '93.184.1.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${'A'.repeat(43)}`, ...headers }, body: JSON.stringify(body) });
  it('лимит двери → Origin: чужой и пустой Origin — 403 до создания', async () => {
    for (const origin of [{ origin: 'https://evil.example' }, {}] as Record<string, string>[]) {
      const calls: string[] = [];
      const r = await createBotCreateHandler(deps(calls))(request(origin, { company_name: 'x' }));
      expect(r.status).toBe(403);
      expect(calls).toEqual(['auth', 'limit']);
    }
  });
  it('лимит исчерпан — 429 до всего остального', async () => {
    const calls: string[] = [];
    const r = await createBotCreateHandler(deps(calls, { allowMutation: async () => { calls.push('limit'); return false; } }))(request({ origin: ORIGIN }, { company_name: 'x' }));
    expect(r.status).toBe(429);
    expect(calls).toEqual(['auth', 'limit']);
  });
  it('вопрос владельца: bot_id и history в теле — 400, ядро не вызвано', async () => {
    for (const body of [{ question: 'x', bot_id: '22222222-2222-4222-8222-222222222222' }, { question: 'x', history: [] }]) {
      const calls: string[] = [];
      const r = await createOwnerAskHandler(deps(calls))(request({ origin: ORIGIN }, body), '33333333-3333-4333-8333-333333333333');
      expect(r.status).toBe(400);
      expect(calls).not.toContain('answer');
    }
  });
});
