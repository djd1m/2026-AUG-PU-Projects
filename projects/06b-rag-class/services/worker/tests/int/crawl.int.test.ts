import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type SiteFetch, type SiteResponse } from '@n6b/rag';
import { ownerPool, runDate, servicePool } from '../../../../packages/db/tests/int/helpers';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { FakeProvider } from '../../../../packages/rag/src/provider/fake';
import { acquireLease } from '../../src/lease';
import { createIndexRunner } from '../../src/index-runner';
import { type JobContext, JobCeilingExceeded, JobLeaseLost } from '../../src/runner';
import { crawlSite, createSiteExtractor, ROBOTS_FAILED } from '../../src/crawl/site';
import { saveDocument } from '../../src/crawl/store';
import { expireLease, isolateQueue, seedJobs } from './helpers';
const owner = ownerPool(); const app = servicePool(8);
afterAll(async () => { await Promise.all([owner.end(), app.end()]); });
beforeEach(async () => { await isolateQueue(owner); });
const response = (body: string, status = 200, type = 'text/html', location?: string): SiteResponse =>
  ({ status, headers: { 'content-type': type, ...(location ? { location } : {}) }, body });
async function context(): Promise<JobContext> {
  await seedJobs(owner, 1);
  const job = (await acquireLease(app))!;
  await owner.query("UPDATE source SET url='https://fixture.test/' WHERE id=$1", [job.sourceId]);
  return { job: { ...job, url: 'https://fixture.test/' }, signal: new AbortController().signal,
    checkpoint: async () => {}, progress: async () => {} };
}
const documents = async (ctx: JobContext) => (await owner.query('SELECT id, locator_url, text, content_sha256 FROM document WHERE source_id=$1 ORDER BY locator_url', [ctx.job.sourceId])).rows;
function fixture(pages: Record<string, SiteResponse>) {
  const requests: string[] = []; let sleeps = 0;
  const fetch: SiteFetch = async (raw, signal, max) => {
    signal.throwIfAborted(); requests.push(new URL(raw).pathname);
    const result = pages[new URL(raw).pathname] ?? response('', 404);
    if (Buffer.byteLength(result.body) > max) throw new Error('size');
    return result;
  };
  return { pool: app, fetch, sleep: async () => { sleeps++; }, requests, sleeps: () => sleeps };
}

describe('SC-US-002 обход сайта и существующая нарезка/эмбеддинги', () => {
  it('SC-US-002-1: sitemap первым, root затем ссылки, циклы/фрагменты не повторяются; неизменённые страницы ставят ссылки', async () => {
    const ctx = await context();
    const f = fixture({ '/sitemap.xml': response('<urlset><url><loc>https://fixture.test/a</loc></url></urlset>', 200, 'application/xml'),
      '/a': response('<title>A</title><p>Ответ</p><a href="/#x">root</a>'),
      '/': response('<p>Главная</p><a href="/a#y">A</a><a href="/b">B</a><a href="/robots.txt">robots</a><a href="/sitemap.xml">sitemap</a>'), '/b': response('<p>Конец</p><a href="/">root</a>') });
    const report = await crawlSite(ctx, f);
    expect(report).toMatchObject({ loaded: 3, html: 3 });
    expect(f.requests).toEqual(['/robots.txt', '/sitemap.xml', '/a', '/', '/b']); expect(f.sleeps()).toBe(2);
    const ids = (await documents(ctx)).map((r) => r.id);
    f.requests.length = 0;
    await crawlSite(ctx, f);
    expect((await documents(ctx)).map((r) => r.id)).toEqual(ids);
    expect(f.requests).toContain('/b');
    const provider = new FakeProvider();
    const gateway = constructGateway({ pool: app, provider, now: () => runDate(1), limits: {
      answerVisitorDay: 30, answerBotDay: 300, answerGlobalDay: 3000, sandboxAccountDay: 100,
      sandboxGlobalDay: 2000, embedTokensAccountDay: 2_000_000, embedTokensGlobalDay: 20_000_000 } });
    const crawl = createSiteExtractor(f);
    const indexing = createIndexRunner({ pool: app, gateway, extractors: { site: crawl.extract } });
    expect(await indexing.run(ctx)).toEqual({ state: 'succeeded' });
    expect(provider.calls.embed).toBeGreaterThan(0);
    const calls = provider.calls.embed;
    await indexing.run(ctx); expect(provider.calls.embed).toBe(calls);
    expect(crawl.note(ctx)).toBe('обойдено 3 из 3');
  });
  it('SC-US-002-2: 5xx, сеть и слишком большой robots запрещают всё; 4xx разрешает', async () => {
    for (const robots of [response('', 503), response('x'.repeat(500 * 1024 + 1))]) {
      const ctx = await context(); const f = fixture({ '/robots.txt': robots, '/': response('<p>Главная</p>') });
      await expect(crawlSite(ctx, f)).rejects.toThrow(ROBOTS_FAILED); expect(f.requests).toEqual(['/robots.txt']);
    }
    const ctx = await context();
    await expect(crawlSite(ctx, { pool: app, fetch: async () => { throw new Error('network'); } })).rejects.toThrow(ROBOTS_FAILED);
    expect((await documents(ctx))).toHaveLength(0);
    const f = fixture({ '/robots.txt': response('', 404), '/': response('<p>Главная</p>') });
    expect((await crawlSite(ctx, f)).html).toBe(1);
  });
  it('Free считает 100 URL включая redirect/nonHTML, seen до HTTP, точная заметка', async () => {
    const ctx = await context(); const pages: Record<string, SiteResponse> = {
      '/sitemap.xml': response('<urlset>' + Array.from({ length: 101 }, (_, i) => `<url><loc>https://fixture.test/p${i}</loc></url>`).join('') + '</urlset>', 200, 'application/xml') };
    for (let i = 0; i < 101; i++) pages[`/p${i}`] = response('<p>Текст</p>', 200, i === 2 ? 'application/pdf' : 'text/html');
    pages['/p0'] = response('', 302, 'text/html', '/p1');
    const f = fixture(pages); const report = await crawlSite(ctx, f);
    expect(report.loaded).toBe(100); expect(report.note).toBe('обойдено 100 из ≥101');
    const requests = f.requests.filter((p) => p.startsWith('/p'));
    expect(requests).toHaveLength(100); expect(new Set(requests).size).toBe(100);
    expect((await documents(ctx))).toHaveLength(98);
  });
  it('redirect: robots цели, другой host, credentials, циклы и предел 5', async () => {
    for (const location of ['https://evil.test/', 'http://u:p@fixture.test/', '/blocked']) {
      const ctx = await context(); const f = fixture({ '/robots.txt': response('User-agent: *\nDisallow: /blocked', 200, 'text/plain'),
        '/': response('', 302, 'text/html', location) });
      await expect(crawlSite(ctx, f)).rejects.toThrow(); expect(f.requests).not.toContain('/blocked');
    }
    const ctx = await context(); const f = fixture({ '/': response('', 302, 'text/html', '/a'), '/a': response('', 302, 'text/html', '/') });
    await expect(crawlSite(ctx, f)).rejects.toThrow('HTML'); expect(f.requests.filter((p) => p === '/')).toHaveLength(1);
    const chain: Record<string, SiteResponse> = {};
    for (let i = 0; i < 7; i++) chain[i ? `/r${i}` : '/'] = response('', 302, 'text/html', `/r${i + 1}`);
    await expect(crawlSite(await context(), fixture(chain))).rejects.toThrow('редиректов');
  });
  it('нет HTML → failed; checkpoint ceiling/lease и signal распространяются до запросов/записи', async () => {
    const ctx = await context();
    await expect(crawlSite(ctx, fixture({ '/': response('pdf', 200, 'application/pdf') }))).rejects.toThrow('HTML');
    for (const error of [new JobLeaseLost(), new JobCeilingExceeded()]) {
      const f = fixture({});
      await expect(crawlSite({ ...ctx, checkpoint: async () => { throw error; } }, f)).rejects.toBe(error);
      expect(f.requests).toHaveLength(0);
    }
    const abort = new AbortController(); abort.abort(new JobLeaseLost());
    const f = fixture({});
    await expect(crawlSite({ ...ctx, signal: abort.signal }, f)).rejects.toBeInstanceOf(JobLeaseLost); expect(f.requests).toHaveLength(0);
  });
});

describe('guard записи document под shared lease', () => {
  it.each(['stale fence', 'closed state'])('stale fence и closed state: %s не записывает документ', async (mode) => {
    const ctx = await context();
    if (mode === 'stale fence') await owner.query('UPDATE index_job SET lease_fence=lease_fence+1 WHERE id=$1', [ctx.job.id]);
    else await owner.query("UPDATE index_job SET state='failed' WHERE id=$1", [ctx.job.id]);
    await expect(saveDocument(app, ctx, 'https://fixture.test/', 't', 'text')).rejects.toBeInstanceOf(JobLeaseLost);
    expect((await documents(ctx))).toHaveLength(0);
  });
  it('два конкурентных воркера: перезахват → пишет только новый fence, id сохраняется', async () => {
    const ctx = await context(); await expireLease(owner, ctx.job.id);
    const second = (await acquireLease(app))!;
    const results = await Promise.allSettled([
      saveDocument(app, ctx, 'https://fixture.test/', 'old', 'old'),
      saveDocument(app, { ...ctx, job: second }, 'https://fixture.test/', 'new', 'new')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
    expect((await documents(ctx))[0].text).toBe('new');
  });
});
