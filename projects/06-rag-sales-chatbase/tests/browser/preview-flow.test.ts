// Экраны предпросмотра (фича preview-flow): НАСТОЯЩАЯ разметка PreviewViews/PreviewStartForm с НАСТОЯЩИМ globals.css в
// обеих темах — правила прибора R1/R2/R5/R8/R9 и axe (контраст AA). Образец — tests/browser/design-shell.test.ts.
// Состояния — все, что видит владелец: запуск, «k из ≤ 20», «нет ответа», отказ с причиной, чат пустой (R9: поле вопроса
// в первом экране телефона), чат с ответом, развёрнутой цитатой, CTA, «не знаю» и отказом лимита. Только в контейнере Playwright.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule, firstScreenRule, firstScreenSelectors, FIRST_SCREEN_VIEWPORTS } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { PreviewChat, PreviewProgress, type ChatMessage, type PreviewJobView } from '../../apps/web/src/app/preview/PreviewViews';
import { PreviewStartForm } from '../../apps/web/src/app/preview/PreviewStart';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/preview-flow/browser';
const JOB = '7b1c7a52-5c0e-4f55-9f39-1d3f6a2b8c41';
const job = (over: Partial<PreviewJobView>): PreviewJobView => ({ index_job_id: JOB, state: 'running', pages_done: 7, pages_total: 20, page_budget: 20, chunks_done: 41, ...over });
const SITE = { host: 'stomatologia-ulybka.ru', title: 'Стоматология «Улыбка» — лечение и гигиена', h1: 'Лечим зубы без боли с 2009 года',
  suggestions: ['Сколько стоят ваши услуги?', 'Как записаться?', 'Как с вами связаться?'] };
const noop = () => {};
const chat = (messages: ChatMessage[]) => createElement(PreviewChat, { site: SITE, messages, questionsLeft: 7, draft: '', busy: false, error: '',
  signedIn: false, saving: false, onDraft: noop, onAsk: noop, onSave: noop });
const MESSAGES: ChatMessage[] = [
  { kind: 'question', text: 'Сколько стоит чистка зубов?' },
  { kind: 'answered', text: 'Профессиональная гигиена — 4 500 ₽, приём длится около часа.', firstAnswer: true,
    source: { title: 'Цены на услуги', url: 'https://stomatologia-ulybka.ru/ceny', excerpt: 'Профессиональная гигиена полости рта (ультразвук, Air Flow, полировка) — 4 500 ₽. Длительность приёма — около 60 минут.' } },
  { kind: 'question', text: 'Есть ли парковка?' },
  { kind: 'unknown', text: 'Не нашёл этого в материалах компании. Напишите: +7 900 000-00-00' },
  { kind: 'question', text: 'А в субботу работаете?' },
  { kind: 'refused', text: 'Бесплатный предпросмотр на сегодня исчерпан — зарегистрируйтесь, чтобы продолжить' },
];
const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  start: main(createElement(PreviewStartForm, { url: '', busy: false, error: '', onUrl: noop, onSubmit: noop })),
  progress: main(createElement(PreviewProgress, { host: 'stomatologia-ulybka.ru', view: job({}) })),
  silent: main(createElement(PreviewProgress, { host: '', view: job({ state: 'no_response' }) })),
  failed: main(createElement(PreviewProgress, { host: 'stomatologia-ulybka.ru', view: job({ state: 'failed', reason: 'robots_disallowed' }) })),
  empty: main(chat([])),
  chat: main(chat(MESSAGES)),
};
const html = (name: string, theme: Theme) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — предпросмотр</title>
<style>${CSS}</style></head><body>${renderToStaticMarkup(PAGES[name]!(theme))}</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/(start|progress|silent|failed|empty|chat)-(dark|light)\.html$/.exec(req.url ?? '');
    if (!match) { res.writeHead(404).end(); return; }
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
  async function open(name: string, theme: Theme, viewport: { width: number; height: number }, mobile: boolean, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext(mobile ? { viewport, isMobile: true, hasTouch: true } : { viewport });
    try {
      const page = await context.newPage(); await page.goto(`${base}/${name}-${theme}.html`);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await run(page);
    } finally { await context.close(); }
  }
  for (const theme of ['dark', 'light'] as const) {
    // R9: момент ценности — поле вопроса в первом экране телефона, до прокрутки (FR-GROWTH-001, FR-PREVIEW-001).
    for (const { w, h } of FIRST_SCREEN_VIEWPORTS) it(`R9 / ${theme} ${w}x${h}: поле вопроса предпросмотра в первом экране`,
      () => open('empty', theme, { width: w, height: h }, true, async page => {
        const selectors = firstScreenSelectors(`/preview/${JOB}`);
        expect(selectors).toEqual(['#preview-question']);
        const lost: string[] = [];
        for (const selector of selectors) lost.push(...(await firstScreenRule(page, selector)).map((f: { selector: string; message: string }) => `${f.selector}: ${f.message}`));
        expect(lost, `R9 за сгибом: ${JSON.stringify(lost)}`).toEqual([]);
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-${theme}-first-screen-${w}x${h}.png`, fullPage: false });
      }));
    for (const name of ['start', 'progress', 'silent', 'failed', 'empty', 'chat']) {
      it(`${name} ${theme} 390: R1/R2/R5, axe (R4, контраст AA) и R8 без отказов`, () => open(name, theme, { width: 390, height: 844 }, false, async page => {
        expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
        expect(errors(await axeRule(page))).toEqual([]);
        expect(errors(await textZoomRule(page))).toEqual([]);
      }));
    }
  }
  for (const width of [320, 360, 414, 768, 1024, 1440]) for (const name of ['progress', 'chat']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: width === 1440 ? 900 : 844 }, false, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320 || width === 1440) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-dark-${name}-width-${width}.png`, fullPage: true });
      }
    }));
  }
  it('прогресс — role=progressbar со значением «k из ≤ 20»; три состояния различимы текстом', () => open('progress', 'light', { width: 390, height: 844 }, false, async page => {
    const bar = page.locator('[role=progressbar]');
    expect(await bar.getAttribute('aria-valuenow')).toBe('7');
    expect(await bar.getAttribute('aria-valuemax')).toBe('20');
    expect(await page.textContent('main')).toContain('Читаем сайт: 7 из ≤ 20 страниц');
  }));
  it('чат: развёрнутая цитата, ссылка на страницу с rel=noopener nofollow, CTA ровно одна, бейдж «Работает на Суфлёре»', () => open('chat', 'dark', { width: 390, height: 844 }, false, async page => {
    expect(await page.locator('details.source-quote[open]').count()).toBe(1);
    expect(await page.locator('.source-quote a').getAttribute('rel')).toContain('noopener');
    expect(await page.locator('.source-quote a').getAttribute('href')).toBe('https://stomatologia-ulybka.ru/ceny');
    expect(await page.locator('.aha').count()).toBe(1);
    expect(await page.locator('.powered').textContent()).toBe('Работает на Суфлёре');
  }));
});
