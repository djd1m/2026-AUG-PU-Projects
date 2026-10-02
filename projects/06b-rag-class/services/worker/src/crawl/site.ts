import { setTimeout as pause } from 'node:timers/promises';
import { type Pool, withService } from '@n6b/db';
import { createSafeHttp, UnsafeSite, type SiteFetch, type SiteResponse } from '@n6b/rag';
import { type Extractor } from '../index-runner.js';
import { type JobContext, JobLeaseLost, JobCeilingExceeded } from '../runner.js';
import { extractHtml, sameHost, siteLink, sitemapUrls } from './html.js';
import { parseRobots } from './robots.js';
import { saveDocument } from './store.js';

const HTML_MAX = 2 * 1024 * 1024;
const ROBOTS_MAX = 500 * 1024;
export const NO_HTML = 'Не найдено ни одной страницы HTML';
export const ROBOTS_FAILED = 'robots.txt недоступен — по RFC 9309 это полный запрет';
export interface CrawlDeps {
  pool: Pool;
  fetch?: SiteFetch;
  sleep?: (signal: AbortSignal) => Promise<void>;
}
interface CrawlReport { loaded: number; html: number; note: string }
class CrawlStop extends Error {}
class CrawlFailure extends Error {}

export async function crawlSite(ctx: JobContext, deps: CrawlDeps, limit = 100): Promise<CrawlReport> {
  const root = new URL(ctx.job.url!);
  const fetch = deps.fetch ?? createSafeHttp();
  const sleep = deps.sleep ?? ((signal) => pause(1000, undefined, { signal }));
  const seen = new Set<string>();
  const requested = new Set<string>();
  let allows = (_url: string) => true;
  let loaded = 0;
  let html = 0;
  let truncated = false;
  let lastPage = false;
  const checkpoint = async () => { ctx.signal.throwIfAborted(); await ctx.checkpoint(); ctx.signal.throwIfAborted(); };
  async function get(raw: string, max: number, pages: boolean, robots = false): Promise<{ url: URL; response: SiteResponse } | null> {
    let url = new URL(raw);
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]);
    for (let redirects = 0; ; redirects++) {
      await checkpoint();
      signal.throwIfAborted();
      if (!sameHost(root, url) || (!robots && !allows(url.href))) throw new CrawlStop('Адрес запрещён правилами обхода');
      if (requested.has(url.href)) return null;
      if (pages) {
        if (seen.has(url.href)) return null;
        if (loaded >= limit) { truncated = true; return null; }
        seen.add(url.href);
        if (lastPage) { await checkpoint(); await sleep(signal); await checkpoint(); }
        lastPage = true;
        loaded++;
      }
      requested.add(url.href);
      const response = await fetch(url.href, signal, max);
      await checkpoint();
      if (response.status >= 300 && response.status < 400) {
        if (redirects >= 5) throw new CrawlStop('Превышен предел редиректов');
        const location = response.headers.location;
        const next = typeof location === 'string' ? siteLink(location, url) : null;
        if (!next) throw new CrawlStop('Редирект вне сайта или недопустимый URL');
        // robots самой цели применяется также к редиректам sitemap; robots.txt загружается до правил.
        url = new URL(next); continue;
      }
      return { url, response };
    }
  }
  let robots;
  try { robots = await get(new URL('/robots.txt', root).href, ROBOTS_MAX, false, true); }
  catch (error) { if (error instanceof JobLeaseLost || error instanceof JobCeilingExceeded) throw error; await checkpoint(); throw new CrawlFailure(ROBOTS_FAILED); }
  if (!robots || robots.response.status >= 500) throw new CrawlFailure(ROBOTS_FAILED);
  if (robots.response.status < 400) allows = parseRobots(robots.response.body);
  const queue: string[] = [];
  try {
    const sitemap = await get(new URL('/sitemap.xml', root).href, HTML_MAX, false);
    if (sitemap && sitemap.response.status === 200) queue.push(...sitemapUrls(sitemap.response.body, root));
  } catch (error) { if (error instanceof JobLeaseLost || error instanceof JobCeilingExceeded) throw error; await checkpoint(); if ((error as Error).name === 'UnsafeSite') throw error; }
  queue.push(root.href);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const raw = queue[cursor]!;
    if (seen.has(raw) || requested.has(raw) || !allows(raw)) continue;
    if (loaded >= limit) { truncated = true; break; }
    let result;
    try { result = await get(raw, HTML_MAX, true); }
    catch (error) {
      if (error instanceof JobLeaseLost || error instanceof JobCeilingExceeded) throw error;
      await checkpoint();
      // safe-http currently identifies its body limit with this fixed message.
      if (!(error instanceof CrawlStop) && !(error instanceof UnsafeSite)
        && !(error instanceof Error && error.message === 'Превышен предел тела страницы')) throw error;
      await ctx.progress(loaded, null);
      continue;
    }
    if (!result) continue;
    const { response, url } = result;
    if (response.status >= 200 && response.status < 300
      && String(response.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase() === 'text/html') {
      const extracted = extractHtml(response.body, url);
      html++;
      queue.push(...extracted.links.filter((u) => !seen.has(u)));
      await saveDocument(deps.pool, ctx, url.href, extracted.title, extracted.text);
    }
    await ctx.progress(loaded, null);
  }
  if (!html) throw new CrawlFailure(NO_HTML);
  return { loaded, html, note: truncated ? `обойдено ${limit} из ≥${limit + 1}` : `обойдено ${loaded} из ${loaded}` };
}

export function createSiteExtractor(deps: CrawlDeps): { extract: Extractor; note: (ctx: JobContext) => string | undefined } {
  const notes = new WeakMap<JobContext, string>();
  return { note: (ctx) => notes.get(ctx), extract: async (ctx) => {
    const limit = await withService(deps.pool, async (c) => {
      const row = (await c.query<{ plan: string }>('SELECT plan FROM account WHERE id = $1', [ctx.job.accountId])).rows[0];
      if (!row) throw new Error('Аккаунт задачи не найден');
      return row.plan === 'free' ? 100 : 1000;
    });
    try {
      const report = await crawlSite(ctx, deps, limit);
      notes.set(ctx, report.note);
      return null;
    } catch (error) {
      if (!(error instanceof CrawlFailure)) throw error;
      ctx.signal.throwIfAborted();
      await ctx.checkpoint();
      ctx.signal.throwIfAborted();
      return { state: 'failed', error: error.message };
    }
  } };
}
