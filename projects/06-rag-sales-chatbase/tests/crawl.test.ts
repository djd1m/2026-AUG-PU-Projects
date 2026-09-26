// CrawlSite и извлечение текста (FR-SOURCE-001/002, SC-US-001-3, NFR-SEC-004): только хост и www.,
// sitemap.xml, бюджет страниц, потолок 2 МБ с обрывом чтения, таймаут, только text/html, пауза, no_text.
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash, decodeHtml, extractPage } from '../apps/worker/src/crawl/extract-text';
import { CrawlFailure, crawlSite, normalizeLink, siteHosts, type Visit } from '../apps/worker/src/crawl/crawl-site';
import {
  CRAWL_MAX_PAGE_BYTES, CRAWL_MAX_REDIRECTS, CRAWL_PAGE_TIMEOUT_MS, CRAWL_PAUSE_MS, PAGES_BY_PLAN, requestCap, userAgentFor,
} from '../apps/worker/src/crawl/limits';
import { article, html, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
let site: FakeSite | null = null;
afterEach(async () => { await site?.close(); site = null; });
type Extra = Partial<Parameters<typeof crawlSite>[0]>;
const crawl = (s: FakeSite, extra: Extra = {}, visits: Visit[] = []) =>
  crawlSite({ rootUrl: 'http://site.example/', pageBudget: 10, userAgent: UA, net: s.net, pauseMs: 0, timeoutMs: 2000,
    onVisit: async (v) => { visits.push(v); }, ...extra });
const noRobots = { '/robots.txt': text('', 'text/plain', 404) };
const paths = (s: FakeSite) => s.requests.map((r) => r.path);

describe('Числа канона §7', () => {
  it('пауза 1000 мс, таймаут 15 с, 2 МБ, ≤ 5 перенаправлений; бюджет 50 / 300 / 300', () => {
    expect([CRAWL_PAUSE_MS, CRAWL_PAGE_TIMEOUT_MS, CRAWL_MAX_PAGE_BYTES, CRAWL_MAX_REDIRECTS]).toEqual([1000, 15_000, 2 * 1024 * 1024, 5]);
    expect(PAGES_BY_PLAN).toEqual({ free: 50, nobadge: 300, studio: 300 });
    expect(userAgentFor('https://sufler.example')).toBe('SuflerBot/0.1 (+https://sufler.example/bot)');
  });
});

describe('Извлечение основного текста', () => {
  it('заголовок, h1–h3, основной текст; скрипты, стили, навигация, подвал, формы — выброшены', () => {
    const page = extractPage(`<html><head><title>Цены &amp; доставка</title><style>.x{}</style><script>var s = "<p>скрипт</p>";</script></head>
      <body><header><a href="/a">Меню</a></header><nav>Навигация</nav><main><h1>Прайс</h1><p>Стрижка — 900&nbsp;₽ &#171;эконом&#187;</p>
      <h2>Доставка</h2><div>По Москве <b>бесплатно</b></div><noscript>включите JS</noscript><form><input> Поиск</form></main>
      <footer>© 2026</footer><a href="/b" rel="nofollow">b</a><a href='/c'>c</a></body></html>`);
    expect(page.title).toBe('Цены & доставка');
    expect(page.headings).toEqual([{ level: 1, text: 'Прайс' }, { level: 2, text: 'Доставка' }]);
    expect(page.text).toContain('Стрижка — 900 ₽ «эконом»');
    expect(page.text).toContain('По Москве бесплатно');
    for (const noise of ['скрипт', 'Навигация', '©', 'включите JS', 'Поиск', 'Меню', '.x{}']) expect(page.text).not.toContain(noise);
    expect(page.links).toEqual(['/a', '/c']);
  });
  it('пустая оболочка SPA → текста нет', () => {
    const page = extractPage('<!doctype html><html><head><title>App</title><script src="/app.js"></script></head><body><div id="root"></div></body></html>');
    expect(page.text).toBe('');
  });
  it('meta robots noindex/nofollow и <base href> распознаются', () => {
    const page = extractPage('<head><meta name="robots" content="noindex, nofollow"><base href="/docs/"></head><body><a href="x">x</a></body>');
    expect([page.noindex, page.nofollow, page.base]).toEqual([true, true, '/docs/']);
  });
  it('кодировка windows-1251 из Content-Type; отпечаток зависит от текста', () => {
    const body = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // «Привет» в cp1251
    expect(decodeHtml(body, 'text/html; charset=windows-1251')).toBe('Привет');
    expect(contentHash({ title: 'a', text: 'b' })).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ title: 'a', text: 'b' })).not.toBe(contentHash({ title: 'a', text: 'c' }));
  });
  it('ссылки: только хост и www.-вариант, без фрагмента, без файлов и чужих схем', () => {
    const base = new URL('https://site.example/a/'), hosts = siteHosts(base);
    expect([...hosts]).toEqual(['site.example', 'www.site.example']);
    expect(normalizeLink('b#x', base, hosts)).toBe('https://site.example/a/b');
    expect(normalizeLink('https://www.site.example/', base, hosts)).toBe('https://www.site.example/');
    for (const bad of ['https://other.example/', 'mailto:a@b.c', 'javascript:alert(1)', '/price.pdf', 'https://site.example:8443/',
      'https://sub.site.example/']) expect(normalizeLink(bad, base, hosts), bad).toBeNull();
  });
});

describe('Обход', () => {
  it('ссылки и sitemap.xml того же хоста; чужой хост не запрашивается; прогресс «N из M»', async () => {
    const visits: Visit[] = [], progress: string[] = [];
    site = await startFakeSite({ ...noRobots,
      '/sitemap.xml': text('<urlset><url><loc>http://site.example/from-sitemap</loc></url><url><loc>http://evil.example/x</loc></url></urlset>', 'application/xml'),
      '/': article('Главная', ['/about', 'http://evil.example/steal', 'http://www.site.example/www']),
      '/about': article('О нас'), '/from-sitemap': article('Из карты'), '/www': article('WWW') }, { 'evil.example': ['93.184.215.15'] });
    const result = await crawl(site, { onVisit: async (v, p) => { visits.push(v); progress.push(`${p.pagesDone}/${p.pagesTotal}`); } });
    // www.site.example/ и www.site.example/about — то же содержимое, что у / и /about: дубли, не страницы.
    expect([result.pagesRead, result.skipped]).toEqual([4, { duplicate: 2 }]);
    expect(paths(site)).toEqual(['/robots.txt', '/sitemap.xml', '/', '/from-sitemap', '/about', '/robots.txt', '/www', '/', '/about']);
    expect(site.requests.slice(-3).map((r) => r.host)).toEqual(['www.site.example', 'www.site.example', 'www.site.example']);
    expect(site.resolved).not.toContain('evil.example');
    expect(site.dials.every((ip) => ip === '93.184.215.14')).toBe(true);
    expect(progress).toEqual(['1/4', '2/4', '3/4', '4/5', '4/5', '4/4']);
    expect(visits.filter((v) => v.kind === 'page')).toHaveLength(4);
  });
  it('бюджет страниц: 3 из 10 — ровно 3 страницы загружено', async () => {
    const links = Array.from({ length: 9 }, (_, i) => `/p${i}`);
    const routes: Record<string, Handler> = { ...noRobots, '/': article('Главная', links) };
    for (const l of links) routes[l] = article(`Стр ${l}`);
    site = await startFakeSite(routes);
    const result = await crawl(site, { pageBudget: 3 });
    expect([result.pagesRead, result.stoppedBy]).toEqual([3, 'page_budget']);
    expect(paths(site).filter((p) => /^\/p?\d?$/.test(p))).toHaveLength(3);
  });
  it('потолок запросов: пропуски тоже нагружают сайт — не больше 2 × бюджет + 10', async () => {
    const links = Array.from({ length: 40 }, (_, i) => `/e${i}`);
    const routes: Record<string, Handler> = { ...noRobots, '/': article('Главная', links), '*': html('<p>мало</p>') };
    site = await startFakeSite(routes);
    const result = await crawl(site, { pageBudget: 5 });
    expect(result.stoppedBy).toBe('request_cap');
    expect(site.requests.length).toBe(requestCap(5));
  });
  it('потолок размера: страница больше лимита пропущена too_large, чтение оборвано (Content-Length нет)', async () => {
    const huge: Handler = (_q, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      const chunk = `<p>${'я'.repeat(8000)}</p>`;
      let sent = 0;
      const pump = () => { while (sent < 400) { sent++; if (!response.write(chunk)) { response.once('drain', pump); return; } } response.end(); };
      response.on('close', () => { sent = 400; });
      pump();
    };
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/huge']), '/huge': huge });
    const result = await crawl(site, { maxBytes: 64 * 1024 });
    expect(result.skipped).toEqual({ too_large: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(site.aborted()).toBeGreaterThanOrEqual(1);
  });
  it('потолок размера по заявленному Content-Length — тело не читается', async () => {
    const declared: Handler = (_q, response) => { response.writeHead(200, { 'content-type': 'text/html', 'content-length': String(10_000_000) }); response.write('<p>'); };
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/big']), '/big': declared });
    expect((await crawl(site, { maxBytes: 64 * 1024 })).skipped).toEqual({ too_large: 1 });
  });
  it('не text/html пропускается без чтения тела; не-2xx — http_error; зависшая страница — timeout', async () => {
    const hang: Handler = () => {};
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/json', '/missing', '/slow']),
      '/json': text('{"a":1}', 'application/json'), '/slow': hang });
    const result = await crawl(site, { timeoutMs: 300 });
    expect(result.skipped).toEqual({ not_html: 1, http_error: 1, timeout: 1 });
  });
  it('SC-US-001-3: пустая оболочка SPA → no_text, а не «готово, 0 страниц»', async () => {
    site = await startFakeSite({ ...noRobots, '/': html('<html><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>') });
    await expect(crawl(site)).rejects.toMatchObject({ reason: 'no_text' });
  });
  it('корень не отвечает → unreachable', async () => {
    site = await startFakeSite({ ...noRobots, '/': () => {} });
    await expect(crawl(site, { timeoutMs: 300 })).rejects.toBeInstanceOf(CrawlFailure);
    await expect(crawl(site, { timeoutMs: 300 })).rejects.toMatchObject({ reason: 'unreachable' });
  });
  it('известный content_hash → «без изменений», дальше не отдаётся (продолжение, а не заново)', async () => {
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/about']), '/about': article('О нас') });
    const first: Visit[] = [];
    await crawl(site, {}, first);
    const hashes = new Set(first.flatMap((v) => (v.kind === 'page' ? [v.page.contentHash] : [])));
    const second: Visit[] = [];
    const result = await crawl(site, { knownHashes: hashes }, second);
    expect([result.pagesRead, result.pagesUnchanged]).toEqual([0, 2]);
    expect(second.map((v) => v.kind)).toEqual(['unchanged', 'unchanged']);
  });
  it('вежливость: между началами любых запросов — не меньше паузы (1 поток)', async () => {
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/a', '/b']), '/a': article('А'), '/b': article('Б') });
    await crawl(site, { pauseMs: 150 });
    const at = site.requests.map((r) => r.at);
    expect(at.length).toBe(5);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(140);
  });
  it('бюджет времени: обход останавливается с прочитанным, а не падает', async () => {
    let now = 0;
    site = await startFakeSite({ ...noRobots, '/': article('Главная', ['/a', '/b']), '/a': article('А'), '/b': article('Б') });
    const result = await crawl(site, { timeBudgetMs: 1000, clock: () => now, onVisit: async () => { now += 600; } });
    expect([result.pagesRead, result.stoppedBy]).toEqual([2, 'time_budget']);
  });
});
