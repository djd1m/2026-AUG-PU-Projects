import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseRobots } from '../../src/crawl/robots';
import { extractHtml, sitemapUrls } from '../../src/crawl/html';

describe('RFC9309 robots', () => {
  it('R1: adversarial wildcard finishes under external deadline and leaves heartbeat/ceiling responsive', () => {
    const moduleUrl = new URL('../../src/crawl/robots.ts', import.meta.url).href;
    const code = `
      import { parseRobots } from ${JSON.stringify(moduleUrl)};
      import { setImmediate as yieldLoop } from 'node:timers/promises';
      const rule = '/' + '*a'.repeat(25) + 'b$';
      const allows = parseRobots('User-agent: *\\nDisallow: ' + rule);
      const started = performance.now();
      if (!allows('https://fixture.test/' + 'a'.repeat(100))) throw new Error('adversarial mismatch');
      if (allows('https://fixture.test/' + 'a'.repeat(100) + 'b')) throw new Error('benign mismatch');
      let heartbeats = 0, matches = 0;
      const beat = setInterval(() => heartbeats++, 2);
      const ceiling = AbortSignal.timeout(30);
      while (!ceiling.aborted) {
        allows('https://fixture.test/' + 'a'.repeat(100)); matches++;
        await yieldLoop();
      }
      clearInterval(beat);
      console.log(JSON.stringify({ heartbeats, matches, elapsedMs: performance.now() - started, ceiling: ceiling.aborted }));
    `;
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code],
      { timeout: 3000, encoding: 'utf8' });
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout);
    expect(result.heartbeats).toBeGreaterThan(0);
    expect(result.matches).toBeGreaterThan(0);
    expect(result.ceiling).toBe(true);
    expect(result.elapsedMs).toBeLessThan(1000);
    console.log('R1 bounded CPU/heartbeat:', result);
  });
  it('wildcard end anchoring accepts later terminal literals and empty trailing wildcard', () => {
    const allows = parseRobots('User-agent: *\nDisallow: /*a$\nDisallow: /tail*$');
    expect(allows('https://x.test/aaa')).toBe(false);
    expect(allows('https://x.test/aaab')).toBe(true);
    expect(allows('https://x.test/tail/anything')).toBe(false);
  });
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
  it('R3: nav/footer anchors are discovered while their text is excluded', () => {
    expect(extractHtml('<nav><a href="/pricing">Prices</a></nav><p>Home</p><footer><a href="/contact">Contact</a></footer>',
      new URL('https://fixture.test/'))).toEqual({ title: 'fixture.test', text: 'Home',
      links: ['https://fixture.test/pricing', 'https://fixture.test/contact'] });
  });
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
