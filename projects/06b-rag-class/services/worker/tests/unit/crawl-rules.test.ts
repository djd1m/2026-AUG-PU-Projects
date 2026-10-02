import { describe, expect, it } from 'vitest';
import { parseRobots } from '../../src/crawl/robots';
import { extractHtml, sitemapUrls } from '../../src/crawl/html';

describe('RFC9309 robots', () => {
  it('группы UA, объединение подходящих групп, самый длинный путь и Allow при равенстве', () => {
    const allows = parseRobots(`User-agent: *\nDisallow: /\nUser-agent: n6bbot\nDisallow: /private\nAllow: /private/public\nUser-agent: N6bBot\nAllow: /private/same\nDisallow: /private/same`);
    expect(allows('https://x.test/')).toBe(true);
    expect(allows('https://x.test/private')).toBe(false);
    expect(allows('https://x.test/private/public')).toBe(true);
    expect(allows('https://x.test/private/same')).toBe(true);
    expect(parseRobots('User-agent: OtherBot\nDisallow: /')('https://x.test/')).toBe(true);
  });
  it('звёздочка, $, регистр, проценты и UTF8', () => {
    const allows = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /Case\nDisallow: /a%2fb\nDisallow: /%7euser\nDisallow: /привет');
    expect(allows('https://x.test/a.pdf')).toBe(false);
    expect(allows('https://x.test/a.pdf?x')).toBe(true);
    expect(allows('https://x.test/case')).toBe(true);
    expect(allows('https://x.test/Case')).toBe(false);
    expect(allows('https://x.test/a%2Fb')).toBe(false);
    expect(allows('https://x.test/a/b')).toBe(true);
    expect(allows('https://x.test/~user')).toBe(false);
    expect(allows('https://x.test/привет')).toBe(false);
  });
});
describe('sitemap и текст', () => {
  const root = new URL('https://example.test/');
  it('только тот же host с www, XML entities запрещены', () => {
    expect(sitemapUrls('<urlset><url><loc>https://www.example.test/a#x</loc></url><url><loc>https://evil.test/</loc></url></urlset>', root))
      .toEqual(['https://www.example.test/a']);
    expect(() => sitemapUrls('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>', root)).toThrow();
  });
  it('абзацы разделены, title сохранён, nav/footer/script/style удалены, links есть и для прежнего текста', () => {
    expect(extractHtml('<title>Тест</title><nav>menu</nav><p>Один</p><p>Два</p><footer>foot</footer><script>x</script><style>x</style><a href="/a">Далее</a>', root))
      .toEqual({ title: 'Тест', text: 'Один\nДва\nДалее', links: ['https://example.test/a'] });
  });
});
