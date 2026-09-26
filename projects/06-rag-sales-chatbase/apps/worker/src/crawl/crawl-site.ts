// CrawlSite (Pseudocode, FR-SOURCE-001/002, NFR-SEC-004, ADR-010) — написано заново (ADR-016).
// Порядок — это защита: форма URL → robots.txt корня (через CheckAddress) → sitemap.xml → страницы FIFO.
// Только хост введённого URL и его www.-вариант; один поток; пауза между ЛЮБЫМИ запросами; бюджет страниц,
// потолок запросов и бюджет времени. Каждая посещённая единица сообщается вызывающему (onVisit) — он же
// пишет прогресс «N из M» с проверкой фенса; StaleAttemptError из onVisit останавливает обход немедленно.
// Тела страниц наружу (в журнал) не уходят: вызывающему отдаётся извлечённый текст, журналу — счётчики.
import { AddressRefused, checkUrlShape } from './check-address';
import { contentHash, decodeHtml, extractPage, type Block } from './extract-text';
import {
  CRAWL_MAX_PAGE_BYTES, CRAWL_MAX_REDIRECTS, CRAWL_MAX_URL_LENGTH, CRAWL_MIN_TEXT_CHARS, CRAWL_PAGE_TIMEOUT_MS, CRAWL_PAUSE_MS,
  CRAWL_QUEUE_MAX, CRAWL_TIME_BUDGET_MS, SITEMAP_MAX_BYTES, requestCap,
} from './limits';
import { fetchRobots, isAllowed, type Robots } from './robots';
import { FetchFailed, Pacer, safeGet, type GetOptions, type NetOptions } from './safe-get';

export type CrawlFailureReason = 'robots_disallowed' | 'unreachable' | 'blocked_address' | 'no_text';
export class CrawlFailure extends Error {
  constructor(readonly reason: CrawlFailureReason) { super(`Обход сайта отказал: ${reason}`); this.name = 'CrawlFailure'; }
}
export type SkipReason = 'robots' | 'robots_unreachable' | 'blocked_address' | 'unreachable' | 'timeout' | 'too_many_redirects'
  | 'off_site' | 'downgrade' | 'http_error' | 'not_html' | 'too_large' | 'encoding' | 'noindex' | 'empty' | 'duplicate';
export interface CrawledPage {
  url: string; title: string; headings: Array<{ level: number; text: string }>; blocks: Block[]; text: string; contentHash: string;
}
export type Visit = { kind: 'page'; page: CrawledPage } | { kind: 'unchanged'; url: string; contentHash: string } | { kind: 'skipped'; reason: SkipReason };
export interface CrawlProgress { pagesDone: number; pagesTotal: number }
export type StopReason = 'exhausted' | 'page_budget' | 'request_cap' | 'time_budget';
export interface CrawlResult {
  pagesRead: number; pagesUnchanged: number; skipped: Partial<Record<SkipReason, number>>; requests: number; stoppedBy: StopReason;
}
export interface CrawlOptions {
  rootUrl: string; pageBudget: number; userAgent: string;
  knownHashes?: ReadonlySet<string>;
  onVisit: (visit: Visit, progress: CrawlProgress) => Promise<void>;
  net?: NetOptions;
  // Числа канона по умолчанию; тесты сжимают время, не политику.
  pauseMs?: number; timeoutMs?: number; maxBytes?: number; timeBudgetMs?: number;
  clock?: () => number; sleep?: (ms: number) => Promise<void>;
}

const BINARY = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|zip|rar|7z|gz|tgz|bz2|mp[34]|avi|mov|mkv|webm|wav|ogg|docx?|xlsx?|pptx?|odt|rtf|css|js|mjs|json|xml|rss|atom|woff2?|ttf|otf|eot|exe|dmg|apk|iso)$/i;
const isHtml = (contentType: string) => /^text\/html(\s*;|$)/.test(contentType);

// Хосты сайта: введённый и его www.-вариант (в обе стороны).
export function siteHosts(root: URL): Set<string> {
  const host = root.hostname.toLowerCase();
  return new Set([host, host.startsWith('www.') ? host.slice(4) : `www.${host}`]);
}

export function normalizeLink(href: string, base: URL, hosts: ReadonlySet<string>): string | null {
  let url: URL;
  try { url = new URL(href.trim(), base); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!hosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
  url.hash = '';
  if (BINARY.test(url.pathname) || url.href.length > CRAWL_MAX_URL_LENGTH) return null;
  return url.href;
}

function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => m[1]!.replace(/&amp;/g, '&'));
}

export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const clock = options.clock ?? Date.now;
  const started = clock();
  const budget = options.pageBudget;
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error('Непригодный бюджет страниц');
  let root: URL;
  try { root = checkUrlShape(options.rootUrl); } catch (error) {
    if (error instanceof AddressRefused) throw new CrawlFailure('blocked_address');
    throw error;
  }
  root.hash = '';
  const hosts = siteHosts(root);
  const inScope = (url: URL) => (url.protocol === 'http:' || url.protocol === 'https:') && hosts.has(url.hostname.toLowerCase());
  let requests = 0;
  const pacerBase = new Pacer(options.pauseMs ?? CRAWL_PAUSE_MS, options.sleep, clock);
  const pacer = { wait: async () => { requests++; await pacerBase.wait(); } };
  const common = { userAgent: options.userAgent, timeoutMs: options.timeoutMs ?? CRAWL_PAGE_TIMEOUT_MS, pacer, net: options.net, inScope };
  const maxBytes = options.maxBytes ?? CRAWL_MAX_PAGE_BYTES;

  // 1. robots.txt ДО первой страницы. Отказ адреса или недоступность — отказ всей задачи.
  const robotsCache = new Map<string, Robots | 'unreachable'>();
  const rootRobots = await fetchRobots(root.origin, common);
  if (rootRobots.kind === 'refused') throw new CrawlFailure(rootRobots.reason);
  robotsCache.set(root.origin, rootRobots.robots);
  if (!isAllowed(rootRobots.robots, root.pathname + root.search)) throw new CrawlFailure('robots_disallowed');
  const robotsFor = async (origin: string): Promise<Robots | 'unreachable'> => {
    const cached = robotsCache.get(origin);
    if (cached) return cached;
    const outcome = await fetchRobots(origin, common);
    const value = outcome.kind === 'ok' ? outcome.robots : 'unreachable';
    robotsCache.set(origin, value);
    return value;
  };

  // 2. Очередь: корень + sitemap.xml того же хоста. Сбой sitemap не отказ: он необязателен.
  const queue: string[] = [root.href];
  const seen = new Set<string>(queue);
  const enqueue = (href: string, base: URL) => {
    const link = normalizeLink(href, base, hosts);
    if (link && !seen.has(link) && queue.length < CRAWL_QUEUE_MAX) { seen.add(link); queue.push(link); }
  };
  if (isAllowed(rootRobots.robots, '/sitemap.xml')) {
    try {
      const sitemap = await safeGet(new URL('/sitemap.xml', root.origin), {
        ...common, accept: 'application/xml,text/xml;q=0.9', maxBytes: SITEMAP_MAX_BYTES, maxRedirects: CRAWL_MAX_REDIRECTS,
        wantBody: (status, type) => status >= 200 && status < 300 && /xml/.test(type),
      });
      if (sitemap.body) for (const loc of sitemapLocations(sitemap.body.toString('utf8'))) if (!/\.xml(\.gz)?$/i.test(loc)) enqueue(loc, root);
    } catch (error) {
      if (!(error instanceof AddressRefused || error instanceof FetchFailed)) throw error;
    }
  }

  // 3. Страницы FIFO до бюджета.
  let pagesRead = 0, pagesUnchanged = 0, rootNetworkFailure = false;
  // Одинаковое содержимое под разными адресами (www., «/index.html», параметры) — одна страница.
  const hashesThisCrawl = new Set<string>();
  const skipped: Partial<Record<SkipReason, number>> = {};
  const cap = requestCap(budget);
  const timeBudget = options.timeBudgetMs ?? CRAWL_TIME_BUDGET_MS;
  let stoppedBy: StopReason = 'exhausted';
  const pageOptions: GetOptions = {
    ...common, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', maxBytes, maxRedirects: CRAWL_MAX_REDIRECTS,
    wantBody: (status, type) => status >= 200 && status < 300 && isHtml(type),
  };
  const report = async (visit: Visit) => {
    if (visit.kind === 'skipped') skipped[visit.reason] = (skipped[visit.reason] ?? 0) + 1;
    const pagesDone = pagesRead + pagesUnchanged;
    await options.onVisit(visit, { pagesDone, pagesTotal: Math.min(budget, pagesDone + queue.length) });
  };
  while (queue.length) {
    if (pagesRead + pagesUnchanged >= budget) { stoppedBy = 'page_budget'; break; }
    if (requests >= cap) { stoppedBy = 'request_cap'; break; }
    if (clock() - started >= timeBudget) { stoppedBy = 'time_budget'; break; }
    const href = queue.shift()!;
    const url = new URL(href);
    const isRoot = href === root.href;
    const robots = await robotsFor(url.origin);
    if (robots === 'unreachable') { await report({ kind: 'skipped', reason: 'robots_unreachable' }); continue; }
    if (!isAllowed(robots, url.pathname + url.search)) { await report({ kind: 'skipped', reason: 'robots' }); continue; }
    let result;
    try {
      result = await safeGet(url, pageOptions);
    } catch (error) {
      if (error instanceof AddressRefused) {
        // Корень (или его перенаправление) ведёт во внутреннюю сеть — отказ задачи, а не «пропуск».
        if (isRoot && error.reason === 'blocked_address') throw new CrawlFailure('blocked_address');
        if (isRoot) rootNetworkFailure = true;
        await report({ kind: 'skipped', reason: error.reason });
        continue;
      }
      if (error instanceof FetchFailed) {
        if (isRoot && (error.reason === 'unreachable' || error.reason === 'timeout' || error.reason === 'downgrade')) rootNetworkFailure = true;
        await report({ kind: 'skipped', reason: error.reason });
        continue;
      }
      throw error;
    }
    const final = result.url;
    seen.add(final.href);
    // Перенаправление привело на путь, запрещённый robots: содержимое не используется.
    const finalRobots = robotsCache.get(final.origin);
    const reason: SkipReason | null =
      finalRobots && finalRobots !== 'unreachable' && !isAllowed(finalRobots, final.pathname + final.search) ? 'robots'
        : result.status < 200 || result.status >= 300 ? 'http_error'
          : !isHtml(result.contentType) ? 'not_html'
            : result.tooLarge ? 'too_large'
              : result.encoded || !result.body ? 'encoding' : null;
    if (reason) { await report({ kind: 'skipped', reason }); continue; }
    const page = extractPage(decodeHtml(result.body!, result.contentType));
    let base = final;
    if (page.base) { try { base = new URL(page.base, final); } catch { /* непригодный base — адрес страницы */ } }
    if (!page.nofollow) for (const link of page.links) enqueue(link, base);
    if (page.noindex) { await report({ kind: 'skipped', reason: 'noindex' }); continue; }
    if (page.text.length < CRAWL_MIN_TEXT_CHARS) { await report({ kind: 'skipped', reason: 'empty' }); continue; }
    const hash = contentHash(page);
    if (hashesThisCrawl.has(hash)) { await report({ kind: 'skipped', reason: 'duplicate' }); continue; }
    hashesThisCrawl.add(hash);
    if (options.knownHashes?.has(hash)) {
      pagesUnchanged++;
      await report({ kind: 'unchanged', url: final.href, contentHash: hash });
      continue;
    }
    pagesRead++;
    await report({ kind: 'page', page: { url: final.href, title: page.title, headings: page.headings, blocks: page.blocks, text: page.text, contentHash: hash } });
  }
  // 5. Ни одной страницы с текстом — отказ, а не «готово, 0 страниц» (SC-US-001-3).
  if (pagesRead + pagesUnchanged === 0) throw new CrawlFailure(rootNetworkFailure ? 'unreachable' : 'no_text');
  return { pagesRead, pagesUnchanged, skipped, requests, stoppedBy };
}
