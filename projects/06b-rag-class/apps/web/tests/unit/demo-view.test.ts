import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { demoView } from '@/server/demo-view';
import { PRIVACY_NOTICE } from '@/server/widget-policy';
import { citationHref, publicationDemoPath } from '@/lib/demo-presentation';
import { DemoAnswer, DemoChat } from '@/app/b/[slug]/demo-chat';
import { submitPublication } from '@/app/cabinet/publish-bot';

// Vitest's default JSX transform uses React.createElement; Next owns its production transform.
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const bot = { id: 'internal', accountId: 'secret-account', name: '<script>Бот</script>', contact: 'owner@example.test',
  public_id: 'abcdefghijkl', plan: 'free', badge_removal: 'active' };
const publication = { id: 'internal', public_id: bot.public_id, contact: bot.contact, allowed_origins: [],
  published: true, demo_enabled: true, demo_slug: 'server_owned_demo_slug', embed_code: '<script></script>' };

describe('DEM-02/05 SC-US-012-4 and SC-US-008-4 presentation boundary', () => {
  it('safe public DTO and server privacy precede active input; Free badge uses referral route', () => {
    const config = demoView(bot);
    expect(config).toEqual({ name: bot.name, contact: bot.contact, privacy_notice: PRIVACY_NOTICE,
      badge_required: true, badge_url: `/r/b/${bot.public_id}` });
    expect(config).not.toHaveProperty('accountId'); expect(config).not.toHaveProperty('id');
    const html = renderToStaticMarkup(React.createElement(DemoChat, { slug: publication.demo_slug, config }));
    expect(html.indexOf(PRIVACY_NOTICE)).toBeLessThan(html.indexOf('<textarea'));
    expect(html).toContain('href="/r/b/abcdefghijkl"'); expect(html).not.toContain('disabled=""');
    const noPrivacy = renderToStaticMarkup(React.createElement(DemoChat, { slug: publication.demo_slug,
      config: { ...config, privacy_notice: '' } }));
    expect(noPrivacy).toMatch(/<textarea[^>]*disabled=""/);
  });
  it('paid active removal hides badge; pending removal and Free retain it', () => {
    for (const plan of ['start', 'studio']) {
      const config = demoView({ ...bot, plan });
      expect(config.badge_required).toBe(false);
      expect(renderToStaticMarkup(React.createElement(DemoChat, { slug: publication.demo_slug, config }))).not.toContain('/r/b/');
      expect(demoView({ ...bot, plan, badge_removal: 'pending' }).badge_required).toBe(true);
    }
  });
  it('actual rendered answer/citations escape HTML and reject active schemes; no invented links', () => {
    const html = renderToStaticMarkup(React.createElement(DemoAnswer, { answer: {
      answer_text: '<script>alert(1)</script>', outcome: 'answered', show_cta: false,
      citations: [
        { chunk_id: 'a', title: 'a', label: '<img src=x onerror=alert(1)>', url: 'https://source.test/a' },
        { chunk_id: 'b', title: 'b', label: 'PDF, стр. 2', url: null },
        { chunk_id: 'c', title: 'c', label: 'evil', url: 'javascript:alert(1)' },
      ],
    } }));
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://source.test/a"'); expect(html.match(/<a /g)).toHaveLength(1);
    for (const url of [null, 'invalid', '//foreign.test', 'data:text/html,x', 'https://user:pass@source.test']) expect(citationHref(url)).toBeNull();
  });
  it('route config adds noindex/no-store/frame-ancestors/DENY, keeps existing global headers (HTTP verification pending)', async () => {
    const configPath = pathToFileURL(path.resolve('apps/web/next.config.mjs')).href;
    const nextConfig = await (await import(/* @vite-ignore */ configPath)).default('phase-development-server');
    const entries = await nextConfig.headers();
    const headers = entries.find((entry: { source: string }) => entry.source === '/b/:path*').headers;
    expect(headers).toEqual(expect.arrayContaining([
      { key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Cache-Control', value: 'no-store' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }, { key: 'X-Frame-Options', value: 'DENY' },
    ]));
    expect(entries.find((entry: { source: string }) => entry.source === '/:path*').headers).toContainEqual(
      { key: 'X-Content-Type-Options', value: 'nosniff' });
    expect(readFileSync('apps/web/src/middleware.ts', 'utf8')).toContain("'/b/:path*'");
  });
});

describe('DEM-06 owner checkbox/link and honest saved authority', () => {
  it('only enabled published valid stored slugs produce links', () => {
    expect(publicationDemoPath(publication)).toBe('/b/server_owned_demo_slug');
    for (const change of [{ published: false }, { demo_enabled: false }, { demo_slug: null },
      { demo_slug: '../evil' }, { demo_slug: 'x'.repeat(65) }]) expect(publicationDemoPath({ ...publication, ...change })).toBeNull();
  });
  it('submits explicit checkbox flag without slug; enabled link requires server success and usable slug', async () => {
    const request = vi.fn(async () => Response.json({ data: publication })) as unknown as typeof fetch;
    expect(await submitPublication('internal', bot.contact, '', request, true)).toEqual({ ok: true, data: publication });
    expect(request).toHaveBeenCalledWith('/api/bots/internal/publish', expect.objectContaining({
      body: JSON.stringify({ contact: bot.contact, allowed_origins: [], demo_enabled: true }) }));
    for (const data of [{ ...publication, demo_slug: null }, { ...publication, demo_enabled: false }]) {
      expect((await submitPublication('internal', bot.contact, '', async () => Response.json({ data }), true)).ok).toBe(false);
    }
    expect((await submitPublication('internal', bot.contact, '', async () => Response.json({ data: { ...publication, demo_enabled: false, demo_slug: null } }), false)).ok).toBe(true);
  });
});
