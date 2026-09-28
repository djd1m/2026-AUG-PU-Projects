// crawl-coverage (A-N6-070): пометка усечённого обхода в ленте источника — НАСТОЯЩАЯ разметка SourceList с НАСТОЯЩИМ
// globals.css в обеих темах, Chromium и WebKit. Дефект стенда 28.09: обход упёрся в предел free 50, а владелец видел
// «50 из 50» — как будто сайт прочитан целиком. Здесь: «Прочитано 50 страниц из ≥ 58 известных — предел тарифа…», примеры
// непрочитанных путей, лента в тоне успеха; правила прибора R1/R2/R5/R8 и axe на 320 и 390.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { SourceList, type SourceItemView } from '../../apps/web/src/app/dashboard/CabinetViews';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/crawl-coverage/browser';
const noop = () => {};
const job = (over: Partial<NonNullable<SourceItemView['job']>>) => ({ index_job_id: '7b1c7a52-5c0e-4f55-9f39-1d3f6a2b8c41', state: 'done' as const, queued: false,
  pages_done: 0, pages_total: null, chunks_done: 0, ...over });
const UNREAD = ['/courses/course-36/', '/courses/course-37/', '/courses/очень-длинный-адрес-курса-про-агентов-и-автоматизацию-разработки-с-нуля/', '/courses/course-39/', '/courses/'];
const SOURCES: SourceItemView[] = [
  { source_id: 'c1', kind: 'site', title: 'https://aicoding.space/', job: job({ pages_done: 50, pages_total: 58, chunks_done: 1482, truncated: 'page_budget', unread: UNREAD }) },
  { source_id: 'c2', kind: 'site', title: 'https://shop.example.ru/', job: job({ pages_done: 300, pages_total: 1204, chunks_done: 5000, truncated: 'page_budget', unread: ['/catalog/1/'] }) },
  { source_id: 'c3', kind: 'site', title: 'https://slow.example.ru/', job: job({ pages_done: 31, pages_total: 90, chunks_done: 400, truncated: 'crawl_limit', unread: ['/news/2026/'] }) },
  { source_id: 'c4', kind: 'site', title: 'https://stomatologia-ulybka.ru/', job: job({ pages_done: 48, pages_total: 48, chunks_done: 212 }) },
  { source_id: 'c5', kind: 'site', title: 'https://budget.example.ru/', job: job({ pages_done: 21, pages_total: 40, chunks_done: 300, truncated: 'series_embed_budget' }) },
];
const page = (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }), createElement('main', { className: 'center container' },
  createElement(SourceList, { sources: SOURCES, busy: null, confirming: null, errors: {}, onReindex: noop, onConfirm: noop, onDelete: noop })));
const html = (theme: Theme) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — источники</title>
<style>${CSS}</style></head><body>${renderToStaticMarkup(page(theme))}</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/coverage-(dark|light)\.html$/.exec(req.url ?? '');
    if (!match) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html(match[1] as Theme));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Нет loopback порта');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });

const errors = (found: { severity: string; rule: string; axeRule?: string; selector: string; message: string }[]) =>
  found.filter(f => f.severity === 'error').map(f => `${f.rule}${f.axeRule ? '/' + f.axeRule : ''} ${f.selector}: ${f.message}`);

for (const [engineName, engine] of Object.entries({ chromium, webkit })) describe(engineName, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function open(theme: Theme, width: number, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try { const p = await context.newPage(); await p.goto(`${base}/coverage-${theme}.html`); await run(p); } finally { await context.close(); }
  }
  it('A-N6-070: предел free — «Прочитано 50 страниц из ≥ 58 известных — предел тарифа…», примеры непрочитанного; не «50 из 50»', () => open('dark', 390, async p => {
    const items = p.locator('li.source-item');
    const first = items.nth(0).locator('.truncation-notice');
    expect(await first.getAttribute('role')).toBe('status');
    expect(await first.textContent()).toBe('Прочитано 50 страниц из ≥ 58 известных — предел тарифа «Бесплатный» — 50 страниц (платные тарифы — до 300). '
      + `Бот не знает того, что есть только на непрочитанных страницах. Не прочитаны, например: ${UNREAD.join(', ')} и другие.`);
    expect(await items.nth(0).locator('code.unread-path').count()).toBe(5);
    expect(await items.nth(0).locator('ol.ribbon').textContent()).toContain('50 из 58 страниц');
    expect(await items.nth(0).locator('ol.ribbon').getAttribute('class')).toContain('tone-success');
    expect(await items.nth(1).locator('.truncation-notice').textContent()).toBe('Прочитано 300 страниц из ≥ 1204 известных — предел тарифа — 300 страниц. '
      + 'Бот не знает того, что есть только на непрочитанных страницах. Не прочитаны, например: /catalog/1/ и другие.');
    expect(await items.nth(2).locator('.truncation-notice').textContent()).toContain('Прочитано 31 страница из ≥ 90 известных — обход остановлен потолком времени или запросов к сайту');
    expect(await items.nth(3).locator('.truncation-notice').count()).toBe(0);
    // Усечение бюджетом эмбеддингов — прежний текст (budget-truncation), не новый.
    expect(await items.nth(4).locator('.truncation-notice').textContent()).toContain('закончился бюджет обработки текста');
    expect(await p.locator('.source-list [role=alert]').count()).toBe(0);
  }));
  for (const theme of ['dark', 'light'] as const) for (const width of [320, 390]) {
    it(`${theme} ${width}: R1/R2/R5, axe (контраст AA) и R8 без отказов`, () => open(theme, width, async p => {
      expect(errors(await domRules(p, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(p))).toEqual([]);
      expect(errors(await textZoomRule(p))).toEqual([]);
      if (width === 320) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await p.screenshot({ path: `${ARTIFACTS}/${engineName}-${theme}-coverage-width-320.png`, fullPage: true });
      }
    }));
  }
});
