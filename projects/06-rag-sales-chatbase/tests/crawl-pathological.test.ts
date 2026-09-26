// Враждебный контент чужого сайта не вешает воркер (ревью crawler, BLOCKER-1/2, MEDIUM-1/2).
// Верхняя граница времени проверяется через vm с timeout: он ПРЕРЫВАЕТ синхронную работу (в т.ч.
// бэктрекинг регэкспа), поэтому возвращённая мутацией квадратичная/экспоненциальная реализация даёт
// красный тест за секунду, а не зависший прогон.
import { afterEach, describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { isAllowed, matchRule, parseRobots } from '../apps/worker/src/crawl/robots';
import { extractPage } from '../apps/worker/src/crawl/extract-text';
import { crawlSite } from '../apps/worker/src/crawl/crawl-site';
import { FetchFailed, nextHop } from '../apps/worker/src/crawl/safe-get';
import { article, startFakeSite, text, type FakeSite, type Handler } from './fixtures/fake-site';

const M = 2 * 1024 * 1024;
// Выполнить синхронно не дольше limitMs; дольше — исключение ERR_SCRIPT_EXECUTION_TIMEOUT.
function within<T>(limitMs: number, work: () => T): T {
  return vm.runInNewContext('work()', { work }, { timeout: limitMs }) as T;
}

describe('BLOCKER-1: robots.txt без экспоненциального сопоставления', () => {
  it('правило с 1000 «*» против несовпадающего пути в 2000 символов — < 1 с', () => {
    const robots = parseRobots(`User-agent: *\nDisallow: /${'a*'.repeat(1000)}END\n`);
    expect(within(1000, () => isAllowed(robots, `/${'a'.repeat(2000)}X`))).toBe(true);
  });
  it('случай из ревью: 30 «*», строка 42 символа — < 100 мс', () => {
    const robots = parseRobots(`User-agent: *\nDisallow: /${'a*'.repeat(30)}END\n`);
    expect(within(100, () => isAllowed(robots, `/${'a'.repeat(40)}X`))).toBe(true);
  });
  it('файл ~500 КиБ из правил со звёздами × 20 адресов — < 1 с', () => {
    const lines = Array.from({ length: 8000 }, (_, i) => `Disallow: /${'x*'.repeat(20)}q${i}`);
    const robots = parseRobots(`User-agent: *\n${lines.join('\n')}\n`);
    expect(within(1000, () => Array.from({ length: 20 }, (_, i) => isAllowed(robots, `/${'x'.repeat(1500)}/p${i}`)))).toEqual(Array(20).fill(true));
  });
  it('семантика прежняя: «*» жадно, «$» — конец, подряд идущие «*»', () => {
    const rule = (path: string) => ({ ...parseRobots(`User-agent: *\nDisallow: ${path}`).groups[0]!.rules[0]! });
    expect(matchRule(rule('/a*b*c'), '/a--b--c--')).toBe(true);
    expect(matchRule(rule('/a*b*c$'), '/a-c-b-c')).toBe(true);
    expect(matchRule(rule('/a*b*c$'), '/a-c-b-c-')).toBe(false);
    expect(matchRule(rule('/a**b'), '/axxb')).toBe(true);
    expect(matchRule(rule('/*.php$'), '/x.php')).toBe(true);
    expect(matchRule(rule('/p$'), '/p')).toBe(true);
    expect(matchRule(rule('/p$'), '/pp')).toBe(false);
    expect(matchRule(rule('/ab*ba$'), '/aba')).toBe(false); // хвост не может перекрывать начало
  });
});

describe('BLOCKER-2: извлечение текста линейно на 2 МБ враждебной разметки', () => {
  const cases: Array<[string, string]> = [
    ['100 000 пар <script></script> (1,7 МБ)', '<script></script>'.repeat(100_000)],
    ['100 000 пар <title></title>', '<title></title>'.repeat(100_000)],
    ['незакрытые теги без «>»', '<a '.repeat(Math.floor(M / 3))],
    ["незакрытые значения «<a x='»", "<a x='".repeat(Math.floor(M / 6))],
    ['незакрытые комментарии', '<!--'.repeat(M / 4)],
    ['незакрытые <!', '<!'.repeat(M / 2)],
    ['незакрытые CDATA', '<![CDATA['.repeat(Math.floor(M / 9))],
    ['meta robots с незакрытой кавычкой', '<meta name=robots content="'.repeat(Math.floor(M / 28))],
  ];
  it.each(cases)('%s — < 1 с', (_title, html) => {
    expect(within(1000, () => extractPage(html).text.length)).toBeGreaterThanOrEqual(0);
  });
  it('разбор после правки: кавычка вне значения не глотает документ, незакрытый тег у конца отброшен', () => {
    const page = extractPage(`<p class=it's>Раз</p><p>Два</p><a href="/x">x</a><img alt='a>b' src=y><p>Три</p><div`);
    expect(page.text).toBe('Раз\nДва\nx\nТри');
    expect(page.links).toEqual(['/x']);
  });
});

describe('MEDIUM-1: перенаправление не понижает https → http', () => {
  it('https → http — отказ downgrade; https → https и http → https — пропуск', () => {
    expect(() => nextHop(new URL('https://site.example/a'), 'http://site.example/b')).toThrow(FetchFailed);
    try { nextHop(new URL('https://site.example/a'), 'http://site.example/b'); } catch (e) { expect((e as FetchFailed).reason).toBe('downgrade'); }
    expect(nextHop(new URL('https://site.example/a'), '/b#frag').href).toBe('https://site.example/b');
    expect(nextHop(new URL('http://site.example/a'), 'https://site.example/b').href).toBe('https://site.example/b');
  });
});

describe('MEDIUM-2: сжатый ответ вопреки Accept-Encoding: identity', () => {
  let site: FakeSite | null = null;
  afterEach(async () => { await site?.close(); site = null; });
  it('Content-Encoding: gzip → пропуск encoding, тело не читается и не распаковывается', async () => {
    let asked = '';
    const gzip: Handler = (request, response) => {
      asked = String(request.headers['accept-encoding']);
      response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      response.write(Buffer.alloc(64 * 1024, 1));
      setTimeout(() => response.end(), 200);
    };
    site = await startFakeSite({ '/robots.txt': text('', 'text/plain', 404), '/': article('Главная', ['/z']), '/z': gzip });
    const result = await crawlSite({ rootUrl: 'http://site.example/', pageBudget: 5, userAgent: 'SuflerBot/0.1', net: site.net, pauseMs: 0,
      timeoutMs: 2000, onVisit: async () => {} });
    expect([asked, result.skipped]).toEqual(['identity', { encoding: 1 }]);
    await new Promise((r) => setTimeout(r, 300));
    expect(site.aborted()).toBeGreaterThanOrEqual(1);
  });
});
