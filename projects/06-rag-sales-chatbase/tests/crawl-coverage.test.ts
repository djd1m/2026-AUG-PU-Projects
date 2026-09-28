// crawl-coverage (A-N6-070), дефект стенда 28.09: обход aicoding.space на плане free прочитал 42 страницы курсов и ленту
// блога, но ни одной записи блога, и закрылся «50 из 50». Здесь — порядок обхода при пределе (по кругу между разделами,
// sitemap с lastmod — свежие раньше) и честный итог обхода: сколько адресов известно и какие не прочитаны.
import { afterEach, describe, expect, it } from 'vitest';
import { crawlSite, sitemapEntries, type Visit } from '../apps/worker/src/crawl/crawl-site';
import { displayPath, Frontier, sectionOf } from '../apps/worker/src/crawl/frontier';
import { PAGES_BY_PLAN } from '../apps/worker/src/crawl/limits';
import { article, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';
import { BLOG_PATHS, COURSE_PATHS, OTHER_PATHS, sectionedSite } from './fixtures/sectioned-site';

const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
let site: FakeSite | null = null;
afterEach(async () => { await site?.close(); site = null; });
const readPaths = (visits: Visit[]) => visits.flatMap((v) => v.kind === 'page' ? [new URL(v.page.url).pathname] : []);
const crawl = (s: FakeSite, pageBudget: number, visits: Visit[] = []) => crawlSite({ rootUrl: 'http://site.example/', pageBudget, userAgent: UA,
  net: s.net, pauseMs: 0, timeoutMs: 2000, onVisit: async (v) => { visits.push(v); } });

describe('Порядок обхода при пределе страниц', () => {
  it('сайт «42 курса + 10 записей блога + 5 прочих», предел free 50 → прочитаны страницы ВСЕХ разделов, все 10 записей блога', async () => {
    expect(PAGES_BY_PLAN.free).toBe(50);
    site = await startFakeSite(sectionedSite());
    const visits: Visit[] = [];
    const result = await crawl(site, PAGES_BY_PLAN.free, visits);
    const read = readPaths(visits);
    expect(read).toHaveLength(50);
    expect(read[0]).toBe('/');                                                       // корень — первым, как раньше
    expect(OTHER_PATHS.filter((p) => read.includes(p))).toEqual(OTHER_PATHS);
    expect(BLOG_PATHS.filter((p) => read.includes(p))).toEqual(BLOG_PATHS);          // FIFO давал 0 из 10
    expect(read.filter((p) => COURSE_PATHS.includes(p))).toHaveLength(35);
    // Честный итог: остановка пределом; известно 58 адресов (57 из sitemap + /courses/ со ссылки главной); не прочитаны
    // 7 курсов и лента курсов — примеры только из раздела курсов.
    expect(result.stoppedBy).toBe('page_budget');
    expect(result.pagesKnown).toBe(58);
    expect(result.unreadSample).toHaveLength(5);
    expect(result.unreadSample.every((p) => p.startsWith('/courses/'))).toBe(true);
  });
  it('внутри раздела — свежие по lastmod раньше; без даты — после датированных; разделы по кругу', async () => {
    const routes: Record<string, Handler> = { '/robots.txt': text('', 'text/plain', 404),
      '/sitemap.xml': text(`<urlset><url><loc>http://site.example/blog/old</loc><lastmod>2026-01-05</lastmod></url>
        <url><loc>http://site.example/blog/nodate</loc></url><url><loc>http://site.example/blog/new</loc><lastmod>2026-09-27T10:00:00+03:00</lastmod></url>
        <url><loc>http://site.example/price</loc><lastmod>bad</lastmod></url></urlset>`, 'application/xml'),
      '/': article('Главная') };
    for (const p of ['/blog/old', '/blog/nodate', '/blog/new', '/price']) routes[p] = article(`Стр ${p}`);
    site = await startFakeSite(routes);
    const visits: Visit[] = [];
    const result = await crawl(site, 10, visits);
    expect(readPaths(visits)).toEqual(['/', '/blog/new', '/price', '/blog/old', '/blog/nodate']);
    expect(result).toMatchObject({ stoppedBy: 'exhausted', pagesKnown: 5, unreadSample: [] });
  });
  it('усечённый обход: непрочитанные — путь без параметров запроса, по одному из разных разделов', async () => {
    const links = ['/a/1', '/a/2?utm=x&email=a@b.c', '/b/1', '/b/2', '/c/1'];
    const routes: Record<string, Handler> = { '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', links) };
    for (const l of links) routes[l] = article(`Стр ${l}`);
    site = await startFakeSite(routes);
    const result = await crawl(site, 2);
    expect(result.stoppedBy).toBe('page_budget');
    expect(result.pagesKnown).toBe(6);
    expect(result.unreadSample).toEqual(['/a/2', '/b/1', '/c/1', '/b/2']);
    expect(result.unreadSample.join(' ')).not.toMatch(/utm|email|@/);
  });
});

describe('Разделы, sitemap и адреса для показа', () => {
  it('раздел — первый сегмент пути; корень и файлы верхнего уровня — вместе с главной', () => {
    expect(['/', '/index.html', '/price.php', '/About', '/about/', '/about/team', '/blog/x/y'].map((p) => sectionOf(`https://s.ru${p}`)))
      .toEqual(['', '', '', 'about', 'about', 'about', 'blog']);
  });
  it('очередь: по кругу между разделами в порядке появления; sample не снимает с очереди', () => {
    const q = new Frontier();
    for (const p of ['/', '/c/1', '/c/2', '/c/3', '/b/1', '/b/2']) q.push(`https://s.ru${p}`);
    expect(q.sample(3).map((u) => new URL(u).pathname)).toEqual(['/', '/c/1', '/b/1']);
    expect(q.length).toBe(6);
    const order: string[] = [];
    while (q.length) order.push(new URL(q.shift()!).pathname);
    expect(order).toEqual(['/', '/c/1', '/b/1', '/c/2', '/b/2', '/c/3']);
    expect(q.shift()).toBeUndefined();
  });
  it('sitemapEntries: loc с CDATA и &amp;, lastmod W3C; мусорная дата — null', () => {
    expect(sitemapEntries(`<urlset><url><loc><![CDATA[https://s.ru/a?x=1&amp;y=2]]></loc><lastmod>2026-09-01</lastmod></url>
      <url><loc>https://s.ru/b</loc><lastmod>вчера</lastmod></url><url><loc>https://s.ru/c</loc></url></urlset>`))
      .toEqual([{ loc: 'https://s.ru/a?x=1&y=2', lastmod: Date.parse('2026-09-01') }, { loc: 'https://s.ru/b', lastmod: null }, { loc: 'https://s.ru/c', lastmod: null }]);
    expect(sitemapEntries('<loc>https://s.ru/only</loc>')).toEqual([{ loc: 'https://s.ru/only', lastmod: null }]);
  });
  it('displayPath: кириллица декодирована, параметры отброшены, длина ≤ 200', () => {
    expect(displayPath('https://s.ru/%D0%BA%D1%83%D1%80%D1%81%D1%8B/?utm_source=x')).toBe('/курсы/');
    expect(displayPath(`https://s.ru/${'a'.repeat(400)}`)).toHaveLength(200);
  });
});
