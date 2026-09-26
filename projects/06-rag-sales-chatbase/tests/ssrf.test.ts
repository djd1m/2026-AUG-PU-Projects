// CheckAddress и перенаправления краулера (FR-SOURCE-002, NFR-SEC-004, ADR-010, SC-US-001-4): адрес
// проверяется ПОСЛЕ DNS и на КАЖДОМ перенаправлении, соединение — только с проверенным IP.
// Сайт — локальный HTTP-сервер в этом процессе (fixtures/fake-site.ts), не интернет.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AddressRefused, checkAddress, checkUrlShape, isBlockedIp, systemResolver } from '../apps/worker/src/crawl/check-address';
import { CrawlFailure, crawlSite, type Visit } from '../apps/worker/src/crawl/crawl-site';
import { FetchFailed, Pacer, safeGet, type GetOptions } from '../apps/worker/src/crawl/safe-get';
import { CRAWL_MAX_REDIRECTS } from '../apps/worker/src/crawl/limits';
import { article, html, PUBLIC_IP, redirect, startFakeSite, text, type FakeSite } from './fixtures/fake-site';

const UA = 'SuflerBot/0.1 (+https://sufler.example/bot)';
let site: FakeSite | null = null;
afterEach(async () => { await site?.close(); site = null; });
const getOptions = (s: FakeSite, extra: Partial<GetOptions> = {}): GetOptions => ({
  userAgent: UA, accept: 'text/html', timeoutMs: 2000, maxBytes: 1_000_000, maxRedirects: CRAWL_MAX_REDIRECTS,
  pacer: new Pacer(0), net: s.net, wantBody: () => true, ...extra,
});
const crawl = (s: FakeSite, rootUrl = 'http://site.example/', visits: Visit[] = []) =>
  crawlSite({ rootUrl, pageBudget: 10, userAgent: UA, net: s.net, pauseMs: 0, timeoutMs: 2000, onVisit: async (v) => { visits.push(v); } });
const refusal = async (promise: Promise<unknown>) => promise.then(() => 'ok', (e: unknown) =>
  e instanceof AddressRefused || e instanceof CrawlFailure || e instanceof FetchFailed ? e.reason : `иное: ${String(e)}`);

describe('isBlockedIp: запрещающий список IPv4, разрешающий 2000::/3 для IPv6', () => {
  const blocked = ['127.0.0.1', '127.8.9.10', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.127.255.254', '0.0.0.0', '224.0.0.1', '239.255.255.250', '255.255.255.255', '198.18.0.1', '192.0.2.5',
    '203.0.113.9', '::1', '::', '[::1]', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:10.0.0.5', '::ffff:a9fe:a9fe', '64:ff9b::a00:5', '2002:a00:5::1', '2001::1', '2001:db8::1', 'not-an-ip', '', '1.2.3'];
  const allowed = ['93.184.215.14', '8.8.8.8', '77.88.8.8', '172.32.0.1', '100.128.0.1', '169.255.0.1', '2606:4700:4700::1111',
    '2a02:6b8::2:242', '::ffff:8.8.8.8'];
  it.each(blocked)('%s → запрещён', (ip) => { expect(isBlockedIp(ip)).toBe(true); });
  it.each(allowed)('%s → разрешён', (ip) => { expect(isBlockedIp(ip)).toBe(false); });
});

describe('Форма URL — до DNS', () => {
  it.each(['ftp://site.example/', 'file:///etc/passwd', 'http://user:pw@site.example/', 'http://site.example:8080/',
    'https://site.example:22/', 'javascript:alert(1)', 'gopher://site.example/', 'не url'])('%s → blocked_address', (url) => {
    expect(() => checkUrlShape(url)).toThrow(AddressRefused);
  });
  it('http и https на портах 80/443 — форма пригодна', () => {
    expect(checkUrlShape('https://site.example/a?b=1').hostname).toBe('site.example');
    expect(checkUrlShape('http://site.example:80/').port).toBe('');
  });
  it.each(['http://2130706433/', 'http://0x7f.1/', 'http://0/', 'http://[::ffff:7f00:1]/', 'http://[::1]/', 'http://169.254.169.254/'])(
    'литерал %s нормализуется и отвергается без DNS', async (url) => {
      const asked: string[] = [];
      expect(await refusal(checkAddress(url, async (h) => { asked.push(h); return ['93.184.215.14']; }))).toBe('blocked_address');
      expect(asked).toEqual([]);
    });
});

describe('DNS: проверяется КАЖДЫЙ адрес ответа', () => {
  it('имя с A-записью 10.0.0.5 → blocked_address', async () => {
    expect(await refusal(checkAddress('http://evil.example/', async () => ['10.0.0.5']))).toBe('blocked_address');
  });
  it('смешанный ответ [публичный, частный] → blocked_address (не «первый адрес»)', async () => {
    expect(await refusal(checkAddress('http://evil.example/', async () => [PUBLIC_IP, '192.168.0.10']))).toBe('blocked_address');
    expect(await refusal(checkAddress('http://evil.example/', async () => [PUBLIC_IP, 'fd00::5']))).toBe('blocked_address');
  });
  it('имя не разрешилось или без адресов → unreachable', async () => {
    expect(await refusal(checkAddress('http://nx.example/', async () => { throw new Error('NXDOMAIN'); }))).toBe('unreachable');
    expect(await refusal(checkAddress('http://nx.example/', async () => []))).toBe('unreachable');
  });
  it('публичный адрес — пропуск с тем адресом, с которым соединяться', async () => {
    expect((await checkAddress('https://ok.example/', async () => [PUBLIC_IP])).ip).toBe(PUBLIC_IP);
  });
  it('настоящий DNS: localhost → blocked_address', async () => {
    expect(await refusal(checkAddress('http://localhost/', systemResolver))).toBe('blocked_address');
  });
  // В стеке n6-test имя «db» разрешается настоящим DNS compose в адрес частной сети контейнеров.
  it.skipIf(!process.env.DATABASE_URL?.includes('@db:'))('настоящий DNS compose: http://db/ (частная сеть) → отказ задачи blocked_address', async () => {
    const addresses = await systemResolver('db');
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.every(isBlockedIp)).toBe(true);
    expect(await refusal(crawlSite({ rootUrl: 'http://db/', pageBudget: 5, userAgent: UA, pauseMs: 0, timeoutMs: 2000, onVisit: async () => {} })))
      .toBe('blocked_address');
  });
});

describe('Перенаправления: каждый Location — снова через проверку, соединение только с проверенным IP', () => {
  const targets = ['http://127.0.0.1/', 'http://10.0.0.5/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
    'http://internal.example/', 'http://0x7f000001/', 'http://[::ffff:169.254.169.254]/'];
  it.each(targets)('корень → %s: отказ задачи blocked_address, ни одного соединения к цели', async (target) => {
    site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': redirect(target) }, { 'internal.example': ['192.168.1.10'] });
    expect(await refusal(crawl(site))).toBe('blocked_address');
    expect(site.dials.every((ip) => ip === PUBLIC_IP)).toBe(true);
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt', '/sitemap.xml', '/']);
  });
  it('robots.txt перенаправляет во внутреннюю сеть → отказ ДО первой страницы', async () => {
    site = await startFakeSite({ '/robots.txt': redirect('http://169.254.169.254/latest/meta-data/'), '/': article('Главная') });
    expect(await refusal(crawl(site))).toBe('blocked_address');
    expect(site.requests.map((r) => r.path)).toEqual(['/robots.txt']);
    expect(site.dials).toEqual([PUBLIC_IP]);
  });
  it('внутренняя страница перенаправляет на 127.0.0.1 → она пропущена blocked_address, обход продолжается', async () => {
    const visits: Visit[] = [];
    site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/go', '/about']),
      '/go': redirect('http://127.0.0.1/admin'), '/about': article('О компании') });
    const result = await crawl(site, 'http://site.example/', visits);
    expect(result.pagesRead).toBe(2);
    expect(result.skipped).toEqual({ blocked_address: 1 });
    expect(site.dials.every((ip) => ip === PUBLIC_IP)).toBe(true);
  });
  it('DNS-rebinding: на запрос — один DNS-ответ, соединение с проверенным адресом; следующий ответ «127.0.0.1» отвергнут', async () => {
    site = await startFakeSite({ '/': html('ok') });
    let calls = 0;
    const rebinding = { ...site.net, resolve: async () => (calls++ === 0 ? [PUBLIC_IP] : ['127.0.0.1']) };
    const first = await safeGet('http://site.example/', getOptions(site, { net: rebinding }));
    expect(first.status).toBe(200);
    expect([calls, site.dials]).toEqual([1, [PUBLIC_IP]]);
    expect(await refusal(safeGet('http://site.example/', getOptions(site, { net: rebinding })))).toBe('blocked_address');
    expect(site.dials).toEqual([PUBLIC_IP]);
  });
  it(`не более ${CRAWL_MAX_REDIRECTS} перенаправлений`, async () => {
    const routes: Record<string, ReturnType<typeof redirect>> = {};
    for (let i = 1; i <= 6; i++) routes[`/r${i}`] = redirect(i === 6 ? '/final' : `/r${i + 1}`);
    site = await startFakeSite({ ...routes, '/final': html('конец') });
    expect(await refusal(safeGet('http://site.example/r1', getOptions(site)))).toBe('too_many_redirects');
    expect(site.requests).toHaveLength(6); // шестой Location не запрашивается
    expect((await safeGet('http://site.example/r2', getOptions(site))).redirects).toBe(5);
  });
  it('перенаправление на другой сайт — off_site без соединения', async () => {
    site = await startFakeSite({ '/': redirect('https://other.example/') }, { 'other.example': [PUBLIC_IP] });
    const inScope = (url: URL) => url.hostname === 'site.example';
    expect(await refusal(safeGet('http://site.example/', getOptions(site, { inScope })))).toBe('off_site');
    expect([site.dials.length, site.requests.length]).toEqual([1, 1]);
  });
  it('Host и User-Agent — имя сайта и токен продукта, хотя соединение идёт по IP', async () => {
    site = await startFakeSite({ '/': html('ok') });
    await safeGet('http://site.example/', getOptions(site));
    expect(site.requests[0]).toMatchObject({ host: 'site.example', userAgent: UA });
  });
});

describe('ADR-007: в воркере нет браузера (страж манифеста)', () => {
  it('apps/worker и корень не зависят от playwright/puppeteer/chromium/jsdom', () => {
    for (const file of ['apps/worker/package.json', 'package.json']) {
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
      const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies });
      expect(names.filter((n) => /playwright|puppeteer|chrom|jsdom|selenium/i.test(n)), file).toEqual([]);
    }
  });
});
