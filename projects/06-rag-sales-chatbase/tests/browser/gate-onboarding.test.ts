// gate-onboarding (A-N6-066): баннер ворот A-N6-035 на экранах установки и бота и строка заглушек в сводке — НАСТОЯЩАЯ
// разметка InstallView/BotLayout/GateBanner/SummaryBlock с НАСТОЯЩИМ globals.css в обеих темах: правила прибора
// R1/R2/R5/R8, axe (контраст AA), цели ≥ 44, баннер ДО кода установки. Образец — tests/browser/bot-cabinet.test.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { BotForm, OwnerChat, SourceList, type SourceItemView } from '../../apps/web/src/app/dashboard/CabinetViews';
import { InstallView, type InstallViewProps } from '../../apps/web/src/app/dashboard/InstallViews';
import { GateBanner, type GateBannerView } from '../../apps/web/src/app/dashboard/GateBanner';
import { BotLayout } from '../../apps/web/src/app/dashboard/bots/[botId]/BotScreen';
import { SummaryBlock, VerifyBlock } from '../../apps/web/src/app/dashboard/bots/[botId]/BotExtrasViews';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/gate-onboarding/browser';
const BOT = '829606b3-5c0e-4f55-9f39-1d3f6a2b8c41';
const ORIGIN = 'https://sufler.example';
const noop = () => {};
const TAG = `<script src="${ORIGIN}/w/widget.0a1b2c3d.js" data-bot="AbCdEfGhIjKlMnOpQrStUv" async></script>`;
const DIRECTIVES = [`script-src ${ORIGIN}`, `connect-src ${ORIGIN}`, `img-src ${ORIGIN} data:`];
const gate = (over: Partial<GateBannerView> = {}): GateBannerView => ({ verified: false, ready: true, resetAt: null, stubVisitors: 0,
  chatHref: `/dashboard/bots/${BOT}#chat-title`, busy: false, error: '', onVerify: noop, ...over });
const install = (over: Partial<InstallViewProps>): ReactElement => createElement(InstallView, { botId: BOT, companyName: 'AI Coding Space',
  snippet: { kind: 'ready', directives: DIRECTIVES, tag: TAG }, origins: ['https://aicoding.space'], contact: '', domain: '', errors: {}, busy: false, copied: false,
  plan: 'free', onContact: noop, onSaveContact: noop, onDomain: noop, onAddDomain: noop, onCopy: noop, ...over });
const DONE: SourceItemView[] = [{ source_id: 's1', kind: 'site', title: 'https://aicoding.space/',
  job: { index_job_id: BOT, state: 'done', queued: false, pages_done: 50, pages_total: 50, chunks_done: 1482 } }];
const bot = (banner: GateBannerView, summary = { answered: 0, unknown: 0, refused_limit: 0, not_verified_visitors: 0, last_unknown: [] as { text: string; asked_at: string }[] }) =>
  createElement(BotLayout, { botId: BOT, companyName: 'AI Coding Space', contact: '+7 900 000-00-00', greeting: '', sources: DONE, ready: banner.ready,
    gate: createElement(GateBanner, banner),
    sourcesBlock: createElement(SourceList, { busy: null, confirming: null, errors: {}, onReindex: noop, onConfirm: noop, onDelete: noop, sources: DONE }),
    chat: createElement(OwnerChat, { companyName: 'AI Coding Space', messages: [], draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    summary: createElement(SummaryBlock, { summary }),
    verify: createElement(VerifyBlock, { verified: banner.verified, busy: false, error: '', verifiedAt: null, events: [], onSet: noop, onUnset: noop }),
    settings: createElement(BotForm, { idPrefix: 'bot', name: 'AI Coding Space', contact: '+7 900 000-00-00', greeting: '', errors: {}, busy: false,
      submitLabel: 'Сохранить настройки', contactRequired: true, onChange: noop, onSubmit: noop }) });
const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  // Инцидент 28.09 как он был: код выдан, отметки нет, посетители уже упёрлись в заглушку.
  'install-gate': main(install({ gate: gate({ stubVisitors: 7 }) })),
  'install-gate-waiting': main(install({ gate: gate({ ready: false }), snippet: { kind: 'contact_required' } })),
  'install-verified': main(install({ gate: gate({ verified: true }) })),
  'bot-gate-reset': main(bot(gate({ chatHref: '#chat-title', resetAt: '2026-09-28T09:00:00.000Z', stubVisitors: 21 }),
    { answered: 0, unknown: 0, refused_limit: 0, not_verified_visitors: 21, last_unknown: [] })),
  'bot-gate-error': main(bot(gate({ chatHref: '#chat-title', error: 'Дождитесь окончания загрузки материалов и проверьте ответы по ним' }),
    { answered: 12, unknown: 3, refused_limit: 0, not_verified_visitors: 2, last_unknown: [] })),
};
const NAMES = Object.keys(PAGES);
const html = (name: string, theme: Theme) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — кабинет</title>
<style>${CSS}</style></head><body>${renderToStaticMarkup(PAGES[name]!(theme))}</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/([a-z-]+)-(dark|light)\.html$/.exec(req.url ?? '');
    if (!match || !NAMES.includes(match[1]!)) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html(match[1]!, match[2] as Theme));
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
  async function open(name: string, theme: Theme, viewport: { width: number; height: number }, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage(); await page.goto(`${base}/${name}-${theme}.html`);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await run(page);
    } finally { await context.close(); }
  }
  for (const theme of ['dark', 'light'] as const) for (const name of NAMES) {
    it(`${name} ${theme} 390: R1/R2/R5, axe (R4, контраст AA) и R8 без отказов`, () => open(name, theme, { width: 390, height: 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(page))).toEqual([]);
      expect(errors(await textZoomRule(page))).toEqual([]);
    }));
  }
  for (const width of [320, 360, 414, 768, 1440]) for (const name of ['install-gate', 'bot-gate-reset']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: width === 1440 ? 900 : 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      const button = page.locator('.gate-banner button');
      const box = await button.boundingBox();
      expect(box && box.width >= 44 && box.height >= 44, JSON.stringify(box)).toBe(true);
      if (width === 360 || width === 1440) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-dark-${name}-width-${width}.png`, fullPage: true });
      }
    }));
  }
  it('AC-1/2: установка без отметки — баннер ДО кода, текст заглушки, кнопка и ссылка на тестовый чат, число посетителей за 7 дней', () => open('install-gate', 'light', { width: 360, height: 800 }, async page => {
    const banner = page.locator('section.gate-banner');
    expect(await banner.textContent()).toContain('Посетители вашего сайта сейчас видят заглушку «Бот ещё настраивается». Проверьте ответы в тестовом чате и нажмите «Я проверил ответы бота».');
    expect(await banner.textContent()).toContain('За 7 дней 7 посетителей получили заглушку «Бот ещё настраивается».');
    expect(await banner.getByRole('button', { name: 'Я проверил ответы бота' }).count()).toBe(1);
    expect(await banner.getByRole('link', { name: 'Открыть тестовый чат' }).getAttribute('href')).toBe(`/dashboard/bots/${BOT}#chat-title`);
    const before = await page.evaluate(() => {
      const b = document.querySelector('section.gate-banner')!, code = document.querySelector('pre.snippet')!;
      return Boolean(b.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
    expect(await page.locator('pre.snippet code').textContent()).toBe(TAG);
  }));
  it('AC-2: материалов ещё нет — баннер без кнопки, с «дождитесь»; баннер и в варианте «нужен контакт»', () => open('install-gate-waiting', 'dark', { width: 390, height: 844 }, async page => {
    const banner = page.locator('section.gate-banner');
    expect(await banner.count()).toBe(1);
    expect(await banner.locator('button').count()).toBe(0);
    expect(await banner.textContent()).toContain('Дождитесь, пока источник будет готов');
    expect(await banner.textContent()).not.toContain('За 7 дней');
  }));
  it('отметка стоит — баннера нет, код на месте', () => open('install-verified', 'dark', { width: 390, height: 844 }, async page => {
    expect(await page.locator('section.gate-banner').count()).toBe(0);
    expect(await page.locator('pre.snippet').count()).toBe(1);
  }));
  it('AC-3/8/6: экран бота — баннер первым после заголовка, «отметка снята … материалы обновились»; сводка — строка заглушек, не «вопросов ещё не было»', () => open('bot-gate-reset', 'dark', { width: 390, height: 844 }, async page => {
    const banner = page.locator('section.gate-banner');
    expect(await banner.textContent()).toContain('Отметка снята 28 сентября: материалы обновились — проверьте ответы заново.');
    expect(await banner.textContent()).toContain('За 7 дней 21 посетитель получил заглушку');
    expect(await page.evaluate(() => document.querySelector('.cabinet-head')!.nextElementSibling!.classList.contains('gate-banner'))).toBe(true);
    const summary = page.locator('section[aria-labelledby="summary-title"]');
    expect(await summary.textContent()).not.toContain('Вопросов ещё не было');
    expect(await summary.locator('.stub-count').textContent()).toContain('21 посетитель получил заглушку «Бот ещё настраивается»');
    expect(await summary.locator('.summary-counts li').allTextContents()).toEqual(['0 ответил', '0 не знал', '0 отказов по лимиту']);
  }));
  it('ошибка отметки из баннера — в баннере (role=alert), а не в блоке «Ответы на сайте»', () => open('bot-gate-error', 'light', { width: 390, height: 844 }, async page => {
    expect(await page.locator('section.gate-banner [role=alert]').textContent()).toContain('Дождитесь окончания загрузки материалов');
    expect(await page.locator('section[aria-labelledby="verify-title"] [role=alert]').count()).toBe(0);
    expect(await page.locator('section[aria-labelledby="summary-title"] .stub-count').textContent()).toContain('2 посетителя получили');
  }));
});
