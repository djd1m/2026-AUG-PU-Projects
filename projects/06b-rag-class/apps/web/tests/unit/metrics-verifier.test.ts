import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetricBatch, MetricInstall } from '@n6b/db';
import type { SiteFetch, SiteResponse } from '@n6b/rag';
import { hasMetricScript, METRIC_PAGE_BYTES, METRIC_PAGE_MS, metricSummary,
  SMALL_SAMPLE_WARNING, verifyMetricBatch } from '@/server/metrics-verifier';

const BASE = 'https://widget.example';
const PUBLIC = 'AbCdEf0123_-';
const SCRIPT = `<script src="${BASE}/w.js" data-bot="${PUBLIC}"></script>`;
const row = (overrides: Partial<MetricInstall> = {}): MetricInstall => ({ id: 'install', bot_id: 'bot',
  account_id: 'owner', public_id: PUBLIC, origin_host: 'shop.example', page_url: 'https://www.shop.example/page',
  config_seen_at: '2026-09-01', first_question_at: '2026-09-02', page_verified_at: null, ...overrides });
const response = (overrides: Partial<SiteResponse> = {}): SiteResponse => ({ status: 200,
  headers: { 'content-type': 'text/html; charset=UTF-8' }, body: SCRIPT, ...overrides });
function lease(rows = [row()], deadline = Date.now() + 60_000): MetricBatch {
  return { rows, deadline, nextId: null, authorized: vi.fn(async () => true),
    markVerified: vi.fn(async () => true), finish: vi.fn(async () => undefined) };
}
afterEach(() => vi.restoreAllMocks());

describe('MET-03 actual script predicate', () => {
  it('accepts actual exact src/data-bot, absolute and URL-resolved, including valid base', () => {
    expect(hasMetricScript(SCRIPT, 'https://shop.example/', BASE, PUBLIC)).toBe(true);
    expect(hasMetricScript(`<base href="${BASE}/"><script src="w.js" data-bot="${PUBLIC}"></script>`,
      'https://shop.example/', BASE, PUBLIC)).toBe(true);
    expect(hasMetricScript(`<script data-bot="${PUBLIC}" src="//widget.example/w.js"></script>`,
      'https://shop.example/', BASE, PUBLIC)).toBe(true);
  });
  it.each([
    `<!-- ${SCRIPT} -->`, `<script>const text = '${SCRIPT}';</script>`,
    SCRIPT.replace(PUBLIC, 'WrongBot1234'), SCRIPT.replace('widget.example', 'evil.example'),
    SCRIPT.replace('/w.js', '/other.js'), SCRIPT.replace('/w.js', '/w.js?x=1'),
    SCRIPT.replace('/w.js', '/w.js#x'), `<template>${SCRIPT}</template>`, `<noscript>${SCRIPT}</noscript>`,
    SCRIPT.replace('src=', 'data-src='), `&lt;script src="${BASE}/w.js" data-bot="${PUBLIC}"&gt;`,
  ])('rejects lookalike %s', (html) => {
    expect(hasMetricScript(html, 'https://shop.example/', BASE, PUBLIC)).toBe(false);
  });
  it('fixed guard assertion: a wrong bot script never verifies', () => {
    expect(hasMetricScript(SCRIPT.replace(PUBLIC, 'WrongBot1234'), 'https://shop.example/', BASE, PUBLIC)).toBe(false);
  });
});

describe('MET-02 canonical cumulative counts', () => {
  it('counts bot × normalized host independently, excludes private/preview/own hosts', () => {
    const installs = [row({ page_verified_at: '2026-09-03' }), row({ bot_id: 'second' }),
      ...['localhost', '127.0.0.1', 'example.local', 'x.vercel.app', 'widget.example'].map((host) =>
        row({ origin_host: host, page_url: `https://${host}/`, page_verified_at: '2026-09-03' })),
      row({ origin_host: 'mismatch.example' })];
    expect(metricSummary(installs, { impressions: 7, clicks: 4, signups: 1 }, BASE)).toEqual({
      impressions: 7, clicks: 4, signups: 1, raw: 2, verified: 1, goal: 15, conversion: 25,
      sampleWarning: SMALL_SAMPLE_WARNING });
  });
  it.each([0, 29, 30])('zero-click no data and exact registration threshold n=%i', (signups) => {
    const summary = metricSummary([], { impressions: 0, clicks: 0, signups }, BASE);
    expect(summary.conversion).toBeNull();
    expect(summary.raw).toBe(0);
    expect(summary.verified).toBe(0);
    expect(summary.sampleWarning).toBe(signups < 30 ? SMALL_SAMPLE_WARNING : null);
    expect(summary).not.toHaveProperty('K');
  });
});

describe('MET-03/04 bounded sequential verifier', () => {
  it('passes strict bounds, performs sequential requests and commits once', async () => {
    const batch = lease([row(), row({ id: 'second' })]);
    let inFlight = 0;
    const fetchPage: SiteFetch = vi.fn(async (_url, signal, bytes) => {
      expect(++inFlight).toBe(1);
      expect(bytes).toBe(METRIC_PAGE_BYTES);
      expect(signal.aborted).toBe(false);
      await Promise.resolve();
      inFlight--;
      return response();
    });
    await verifyMetricBatch(batch, BASE, async () => true, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(batch.markVerified).toHaveBeenCalledTimes(2);
    expect(batch.finish).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each([
    response({ status: 302 }), response({ status: 404 }), response({ headers: { 'content-type': 'text/plain' } }),
    response({ headers: {} }), response({ body: 'x'.repeat(METRIC_PAGE_BYTES + 1) }), response({ body: '<p>none</p>' }),
  ])('does not verify invalid response', async (invalid) => {
    const batch = lease();
    await verifyMetricBatch(batch, BASE, async () => true, async () => invalid);
    expect(batch.markVerified).not.toHaveBeenCalled();
    expect(batch.finish).toHaveBeenCalledWith(true);
  });
  it('network failure remains pending; expired batch and revoked actor do not fetch', async () => {
    const fetchPage = vi.fn(async () => { throw new Error('blocked/private/timeout'); });
    const batch = lease();
    await verifyMetricBatch(batch, BASE, async () => true, fetchPage);
    expect(batch.markVerified).not.toHaveBeenCalled();
    await verifyMetricBatch(lease([], Date.now() - 1), BASE, async () => true, fetchPage);
    const revoked = lease();
    vi.mocked(revoked.authorized).mockResolvedValue(false);
    await verifyMetricBatch(revoked, BASE, async () => true, fetchPage);
    await verifyMetricBatch(lease(), BASE, async () => false, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it('stops at the shared 60-second deadline, even with five selected rows', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const batch = lease(Array.from({ length: 5 }, () => row()), now + 60_000);
    const fetchPage = vi.fn(async () => { now += METRIC_PAGE_MS; return response(); });
    await verifyMetricBatch(batch, BASE, async () => true, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(batch.markVerified).toHaveBeenCalledTimes(3);
  });
  it('rechecks session before write and rolls back database failures', async () => {
    const batch = lease();
    const auth = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await verifyMetricBatch(batch, BASE, auth, async () => response());
    expect(batch.markVerified).not.toHaveBeenCalled();
    const failed = lease();
    vi.mocked(failed.markVerified).mockRejectedValue(new Error('db failed'));
    await expect(verifyMetricBatch(failed, BASE, async () => true, async () => response())).rejects.toThrow('db failed');
    expect(failed.finish).toHaveBeenCalledWith(false);
  });
  it('cannot write after the total deadline expires during session revalidation', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const batch = lease([row()], now + 60_000);
    const auth = vi.fn(async () => {
      if (auth.mock.calls.length === 2) now += 60_000;
      return true;
    });
    await verifyMetricBatch(batch, BASE, auth, async () => response());
    expect(batch.markVerified).not.toHaveBeenCalled();
    expect(batch.finish).toHaveBeenCalledWith(true);
  });
});
