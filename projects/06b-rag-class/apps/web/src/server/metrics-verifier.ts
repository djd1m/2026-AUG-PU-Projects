import { load } from 'cheerio';
import type { MetricBatch, MetricInstall, MetricTotals } from '@n6b/db';
import { createSafeHttp, type SiteFetch } from '@n6b/rag';
import { excludedMetricHost, metricHost } from './metric-host';

export const METRIC_PAGE_MS = 15_000;
export const METRIC_PAGE_BYTES = 2 * 1024 * 1024;
export const METRIC_GOAL = 15;
export const SMALL_SAMPLE_WARNING = 'n < 30, K не считается';

export function metricInstallEligible(row: MetricInstall, base: string): boolean {
  const host = metricHost(row.page_url);
  return host !== null && host === row.origin_host && !excludedMetricHost(host, base);
}

/** HTML parsing prevents comment/text/inline-script lookalikes from satisfying the predicate. */
export function hasMetricScript(html: string, page: string, base: string, publicId: string): boolean {
  const $ = load(html);
  // parse5 represents template contents as a document fragment with no CSS parent chain.
  $('template,noscript').remove();
  let resolutionBase = page;
  const declaredBase = $('base[href]').first().attr('href');
  if (declaredBase) {
    try { resolutionBase = new URL(declaredBase, page).href; } catch { /* Invalid base is ignored by browsers. */ }
  }
  const expected = `${base.replace(/\/$/, '')}/w.js`;
  return $('script[src]').toArray().some((element) => {
    const script = $(element);
    if (script.parents('template,noscript').length || script.attr('data-bot') !== publicId) return false;
    try { return new URL(script.attr('src')!, resolutionBase).href === expected; } catch { return false; }
  });
}

export function metricSummary(installs: readonly MetricInstall[], totals: MetricTotals, base: string) {
  const eligible = installs.filter((row) => metricInstallEligible(row, base));
  return { ...totals, raw: eligible.length, verified: eligible.filter((row) => row.page_verified_at !== null).length,
    goal: METRIC_GOAL, conversion: totals.clicks === 0 ? null : totals.signups / totals.clicks * 100,
    sampleWarning: totals.signups < 30 ? SMALL_SAMPLE_WARNING : null };
}

const safeFetch = createSafeHttp({ timeoutMs: METRIC_PAGE_MS });

/** The only production transport is safeFetch; SiteFetch injection is for deterministic tests. */
export async function verifyMetricBatch(batch: MetricBatch, base: string,
  sessionAuthorized: () => Promise<boolean>, fetchPage: SiteFetch = safeFetch): Promise<void> {
  try {
    for (const row of batch.rows) {
      if (Date.now() >= batch.deadline || !await sessionAuthorized() || !await batch.authorized()) break;
      if (!metricInstallEligible(row, base)) continue;
      const remaining = Math.min(METRIC_PAGE_MS, batch.deadline - Date.now());
      if (remaining <= 0) break;
      const signal = AbortSignal.timeout(remaining);
      let response;
      try { response = await fetchPage(row.page_url, signal, METRIC_PAGE_BYTES); }
      catch { continue; } // Unreachable/unsafe pages remain pending for a later round.
      if (signal.aborted || Date.now() >= batch.deadline) continue;
      const contentType = response.headers['content-type'];
      if (response.status < 200 || response.status >= 300 || typeof contentType !== 'string'
        || !/^text\/html(?:\s*;|\s*$)/i.test(contentType) || Buffer.byteLength(response.body) > METRIC_PAGE_BYTES
        || !hasMetricScript(response.body, row.page_url, base, row.public_id)) continue;
      if (!await sessionAuthorized() || Date.now() >= batch.deadline) break;
      await batch.markVerified(row);
    }
    await batch.finish(true);
  } catch (error) {
    await batch.finish(false);
    throw error;
  }
}
