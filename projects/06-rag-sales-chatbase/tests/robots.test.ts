// robots.txt (FR-SOURCE-002, SC-US-001-2, Refinement «robots.txt»): читается ДО первой страницы,
// запрещённый путь не загружается, Disallow: / → robots_disallowed; 4xx = всё разрешено, 5xx/таймаут = отказ.
import { afterEach, describe, expect, it } from 'vitest';
import { isAllowed, parseRobots } from '../apps/worker/src/crawl/robots';
import { CrawlFailure, crawlSite, type Visit } from '../apps/worker/src/crawl/crawl-site';
import { article, html, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
let site: FakeSite | null = null;
afterEach(async () => { await site?.close(); site = null; });
const crawl = (s: FakeSite, visits: Visit[] = [], timeoutMs = 2000) =>
  crawlSite({ rootUrl: 'http://site.example/', pageBudget: 10, userAgent: UA, net: s.net, pauseMs: 0, timeoutMs, onVisit: async (v) => { visits.push(v); } });
const reason = (promise: Promise<unknown>) => promise.then(() => 'ok', (e: unknown) => (e instanceof CrawlFailure ? e.reason : `иное: ${String(e)}`));

describe('Разбор robots.txt', () => {
  it('группа нашего токена важнее «*»; самое длинное правило; при равенстве — Allow', () => {
    const robots = parseRobots(['User-agent: *', 'Disallow: /', '', 'User-agent: SuflerBot', 'Disallow: /private', 'Allow: /private/open',
      'Disallow: /tie', 'Allow: /tie'].join('\n'));
    expect(isAllowed(robots, '/')).toBe(true);
    expect(isAllowed(robots, '/private/x')).toBe(false);
    expect(isAllowed(robots, '/private/open/page')).toBe(true);
    expect(isAllowed(robots, '/tie')).toBe(true);
    expect(isAllowed(robots, '/', 'OtherBot')).toBe(false);
  });
  it('подстановки «*» и «$», пустой Disallow, комментарии, CRLF, регистр ключей и токена', () => {
    const robots = parseRobots('# коммент\r\nUSER-AGENT: *\r\ndisallow: /*.php$\r\nDisallow: /search*q=\r\nDisallow:\r\n');
    expect(isAllowed(robots, '/index.php')).toBe(false);
    expect(isAllowed(robots, '/index.php?x=1')).toBe(true);
    expect(isAllowed(robots, '/search?page=2&q=1')).toBe(false);
    expect(isAllowed(parseRobots('User-agent: suflerbot\nDisallow: /'), '/a')).toBe(false);
    expect(isAllowed(parseRobots('Disallow: /'), '/a')).toBe(true); // правило вне группы не действует
  });
  it('несколько user-agent подряд — одна группа; robots.txt всегда разрешён', () => {
    const robots = parseRobots('User-agent: a\nUser-agent: SuflerBot\nDisallow: /\n');
    expect(isAllowed(robots, '/x')).toBe(false);
    expect(isAllowed(robots, '/robots.txt')).toBe(true);
  });
});

describe('robots.txt в обходе', () => {
  it('SC-US-001-2: Disallow: / → robots_disallowed, загружен только robots.txt', async () => {
    site = await startFakeSite({ '/robots.txt': text('User-agent: *\nDisallow: /\n'), '/': article('Главная') });
    const started = Date.now();
    expect(await reason(crawl(site))).toBe('robots_disallowed');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
  it('запрещённый путь не загружается и считается пропуском robots; остальное читается', async () => {
    const visits: Visit[] = [];
    site = await startFakeSite({
      '/robots.txt': text('User-agent: SuflerBot\nDisallow: /private\n'),
      '/': article('Главная', ['/private/prices', '/about', '/private']), '/about': article('О нас'),
      '/private/prices': article('Секрет'), '/private': article('Секрет 2'),
    });
    const result = await crawl(site, visits);
    expect(result.pagesRead).toBe(2);
    expect(result.skipped).toEqual({ robots: 2 });
    expect(site.requests.map((r) => r.path).filter((p) => p.startsWith('/private'))).toEqual([]);
  });
  it('robots.txt 404 → всё разрешено', async () => {
    site = await startFakeSite({ '/robots.txt': text('нет', 'text/plain', 404), '/': article('Главная') });
    expect((await crawl(site)).pagesRead).toBe(1);
  });
  it.each([500, 503])('robots.txt %i → unreachable, страницы не загружаются', async (status) => {
    site = await startFakeSite({ '/robots.txt': text('сбой', 'text/plain', status), '/': article('Главная') });
    expect(await reason(crawl(site))).toBe('unreachable');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
  });
  it('robots.txt не отвечает (таймаут) → unreachable', async () => {
    const hang: Handler = () => { /* ответа нет */ };
    site = await startFakeSite({ '/robots.txt': hang, '/': article('Главная') });
    expect(await reason(crawl(site, [], 300))).toBe('unreachable');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
  });
  it('введённая страница запрещена → robots_disallowed', async () => {
    site = await startFakeSite({ '/robots.txt': text('User-agent: *\nDisallow: /catalog\n'), '/catalog': html('x') });
    const result = await crawlSite({ rootUrl: 'http://site.example/catalog', pageBudget: 5, userAgent: UA, net: site.net, pauseMs: 0, onVisit: async () => {} })
      .then(() => 'ok', (e: unknown) => (e instanceof CrawlFailure ? e.reason : String(e)));
    expect(result).toBe('robots_disallowed');
  });
});
