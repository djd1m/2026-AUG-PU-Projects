import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Pool } from '@n6b/db';
import { type SiteFetch, type SiteResponse, UnsafeSite } from '@n6b/rag';
import { type JobContext, JobCeilingExceeded, JobLeaseLost } from '../../src/runner';
import { crawlSite, createSiteExtractor, NO_HTML, ROBOTS_FAILED } from '../../src/crawl/site';
import { saveDocument } from '../../src/crawl/store';

vi.mock('../../src/crawl/store', () => ({ saveDocument: vi.fn(async () => {}) }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(),
  withService: async (_pool: unknown, fn: (c: { query: () => Promise<{ rows: { plan: string }[] }> }) => unknown) =>
    fn({ query: async () => ({ rows: [{ plan: 'free' }] }) }),
}));
const pool = {} as Pool;
const response = (body = '', status = 200, type = 'text/html', location?: string): SiteResponse =>
  ({ status, body, headers: { 'content-type': type, ...(location ? { location } : {}) } });
const sitemap = (paths: string[]) => response('<urlset>' + paths.map((p) => `<url><loc>https://fixture.test${p}</loc></url>`).join('') + '</urlset>', 200, 'application/xml');
const context = (): JobContext => ({ job: { id: 'j', sourceId: 's', accountId: 'a', kind: 'site',
  url: 'https://fixture.test/', fileName: null, fence: 1, attempts: 1, progressDone: 0, progressTotal: null },
  signal: new AbortController().signal, checkpoint: vi.fn(async () => {}), progress: vi.fn(async () => {}) });
function fixture(pages: Record<string, SiteResponse | Error>, ctx = context()) {
  const requests: string[] = [];
  const fetch: SiteFetch = async (raw) => {
    const path = new URL(raw).pathname;
    requests.push(path);
    const page = pages[path] ?? response('', 404);
    if (page instanceof Error) throw page;
    return page;
  };
  return { ctx, deps: { pool, fetch, sleep: vi.fn(async () => {}) }, requests };
}
beforeEach(() => vi.clearAllMocks());

describe('bounded crawl correction', () => {
  it.each([new Error('Превышен предел тела страницы'), new UnsafeSite(),
    response('', 302, 'text/html', 'https://evil.test/'), response('', 302, 'text/html', 'http://u:p@fixture.test/'),
    response('', 302, 'text/html', '/blocked')])('R2: page-local failure %s skips to valid queue, counts and delays failed requests', async (bad) => {
    const f = fixture({ '/robots.txt': response('User-agent: *\nDisallow: /blocked'),
      '/sitemap.xml': sitemap(['/bad', '/good', '/bad']), '/bad': bad, '/good': response('<p>Good</p>'), '/': response('<p>Home</p>') });
    expect(await crawlSite(f.ctx, f.deps)).toMatchObject({ loaded: 3, html: 2 });
    expect(f.requests).toEqual(['/robots.txt', '/sitemap.xml', '/bad', '/good', '/']);
    expect(f.deps.sleep).toHaveBeenCalledTimes(2);
    expect(f.ctx.progress).toHaveBeenCalledWith(1, null);
    expect(saveDocument).toHaveBeenCalledTimes(2);
  });
  it('R2: rejected redirect chain skips page and retains redirect limit/accounting', async () => {
    const pages: Record<string, SiteResponse> = { '/sitemap.xml': sitemap(['/bad']), '/': response('<p>Home</p>') };
    for (let i = 0; i < 7; i++) pages[i ? `/r${i}` : '/bad'] = response('', 302, 'text/html', `/r${i + 1}`);
    const f = fixture(pages);
    expect(await crawlSite(f.ctx, f.deps)).toMatchObject({ loaded: 7, html: 1 });
    expect(f.requests).not.toContain('/r6');
    expect(f.deps.sleep).toHaveBeenCalledTimes(6);
  });
  it('R2: failed request consumes ceiling and is not retried', async () => {
    const f = fixture({ '/sitemap.xml': sitemap(['/bad', '/good', '/bad']),
      '/bad': new UnsafeSite(), '/good': response('<p>Good</p>') });
    await expect(crawlSite(f.ctx, f.deps, 1)).rejects.toThrow(NO_HTML);
    expect(f.requests).toEqual(['/robots.txt', '/sitemap.xml', '/bad']);
  });
  it.each([new JobLeaseLost(), new JobCeilingExceeded(), new Error('network')])('R2: hard failure %s propagates from page fetch', async (error) => {
    const f = fixture({ '/sitemap.xml': sitemap(['/bad', '/good']), '/bad': error, '/good': response('<p>Good</p>') });
    await expect(crawlSite(f.ctx, f.deps)).rejects.toBe(error);
    expect(f.requests).not.toContain('/good');
  });
  it.each([new JobLeaseLost(), new JobCeilingExceeded(), new Error('cancelled')])('R2: cancellation beats page-local recovery: %s', async (reason) => {
    const abort = new AbortController();
    const ctx = { ...context(), signal: abort.signal };
    const f = fixture({}, ctx);
    f.deps.fetch = async (raw) => {
      if (new URL(raw).pathname === '/') { abort.abort(reason); throw new UnsafeSite(); }
      return response('', 404);
    };
    await expect(crawlSite(ctx, f.deps)).rejects.toBe(reason);
    expect(saveDocument).not.toHaveBeenCalled();
  });
  it('R3: no-sitemap site crawls navigation/footer-only destinations without indexing boilerplate', async () => {
    const f = fixture({ '/': response('<nav><a href="/pricing">Prices</a></nav><p>Home</p><footer><a href="/contact">Contact</a></footer>'),
      '/pricing': response('<p>Pricing</p>'), '/contact': response('<p>Contact</p>') });
    expect(await crawlSite(f.ctx, f.deps)).toMatchObject({ loaded: 3, html: 3 });
    expect(f.requests).toEqual(['/robots.txt', '/sitemap.xml', '/', '/pricing', '/contact']);
    expect(saveDocument).toHaveBeenNthCalledWith(1, pool, f.ctx, 'https://fixture.test/', 'fixture.test', 'Home');
  });
  it.each([503, 404])('R4: extractor maps safe known failure for robots status %s', async (status) => {
    const f = fixture({ '/robots.txt': response('', status) });
    expect(await createSiteExtractor(f.deps).extract(f.ctx)).toEqual({ state: 'failed', error: status === 503 ? ROBOTS_FAILED : NO_HTML });
  });
  it('R4: arbitrary error even with known message is not exposed as safe failure', async () => {
    const error = new Error(NO_HTML);
    const f = fixture({ '/': error });
    await expect(createSiteExtractor(f.deps).extract(f.ctx)).rejects.toBe(error);
  });
  it.each([new JobLeaseLost(), new JobCeilingExceeded()])('R4: lease/ceiling still propagates: %s', async (error) => {
    const f = fixture({ '/robots.txt': response('', 503) });
    vi.mocked(f.ctx.checkpoint).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValue(error);
    await expect(createSiteExtractor(f.deps).extract(f.ctx)).rejects.toBe(error);
  });
});
