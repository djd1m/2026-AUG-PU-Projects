// Экраны кабинета (фича bot-cabinet): НАСТОЯЩАЯ разметка CabinetViews/InstallViews/BotLayout с НАСТОЯЩИМ globals.css в
// обеих темах — правила прибора R1/R2/R5/R8 и axe (контраст AA). Образец — tests/browser/preview-flow.test.ts.
// Состояния — все, что видит владелец: список ботов (с формой и на пределе плана), экран бота (источники: очередь,
// чтение «k из N», «нет ответа», отказ сайта с «Повторить», отказ PDF, готово; добавление источника; тестовый чат с
// цитатой, «не знаю» и отказом лимита; настройки с ошибкой поля), установка (нужен контакт / виджет не собран / код).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { AddSource, BotForm, BotListSection, OwnerChat, SourceList, type BotListView, type OwnerMessage, type SourceItemView } from '../../apps/web/src/app/dashboard/CabinetViews';
import { InstallView, type InstallViewProps } from '../../apps/web/src/app/dashboard/InstallViews';
import { BotLayout } from '../../apps/web/src/app/dashboard/bots/[botId]/BotScreen';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/bot-cabinet/browser';
const BOT = '7b1c7a52-5c0e-4f55-9f39-1d3f6a2b8c41';
const ORIGIN = 'https://sufler.example';
const noop = () => {};
const form = (errors = {}) => createElement(BotForm, { idPrefix: 'bot', name: 'Стоматология «Улыбка»', contact: '', greeting: '', errors, busy: false,
  submitLabel: 'Сохранить настройки', contactRequired: true, onChange: noop, onSubmit: noop });
const LIST: BotListView = { plan: 'studio', limit: 10, bots: [
  { bot_id: BOT, company_name: 'Стоматология «Улыбка»', contact_set: true, sources: 3, sources_ready: 2, sources_failed: 1, origins: 2 },
  { bot_id: '8b1c7a52-5c0e-4f55-9f39-1d3f6a2b8c42', company_name: 'Пекарня «Колос» — очень длинное название сети пекарен у дома', contact_set: false, sources: 0, sources_ready: 0, sources_failed: 0, origins: 0 },
] };
const job = (over: Partial<NonNullable<SourceItemView['job']>>) => ({ index_job_id: BOT, state: 'running' as const, queued: false, pages_done: 0, pages_total: null, chunks_done: 0, ...over });
const SOURCES: SourceItemView[] = [
  { source_id: 's1', kind: 'site', title: 'https://stomatologia-ulybka.ru/', job: job({ state: 'done', pages_done: 48, pages_total: 48, chunks_done: 212 }) },
  { source_id: 's2', kind: 'site', title: 'https://stomatologia-ulybka.ru/ceny-i-uslugi-dlya-detey-i-vzroslyh', job: job({ pages_done: 7, pages_total: 50, chunks_done: 31 }) },
  { source_id: 's3', kind: 'pdf', title: 'прайс-2026.pdf', job: job({ queued: true }) },
  { source_id: 's4', kind: 'site', title: 'https://old.stomatologia-ulybka.ru/', job: job({ state: 'no_response', pages_done: 2 }) },
  { source_id: 's5', kind: 'site', title: 'https://blog.stomatologia-ulybka.ru/', job: job({ state: 'failed', reason: 'robots_disallowed' }) },
  { source_id: 's6', kind: 'pdf', title: 'скан-договора.pdf', job: job({ state: 'failed', reason: 'no_text_layer' }) },
];
const MESSAGES: OwnerMessage[] = [
  { kind: 'question', text: 'Сколько стоит чистка зубов?' },
  { kind: 'answered', text: 'Профессиональная гигиена — 4 500 ₽.', source: { title: 'Цены на услуги', url: 'https://stomatologia-ulybka.ru/ceny',
    excerpt: 'Профессиональная гигиена полости рта (ультразвук, Air Flow, полировка) — 4 500 ₽.' } },
  { kind: 'question', text: 'Есть ли парковка?' },
  { kind: 'unknown', text: 'Не нашёл этого в материалах компании. Напишите: +7 900 000-00-00' },
  { kind: 'question', text: 'А в субботу работаете?' },
  { kind: 'refused', text: 'Исчерпан предел «ответов бота в сутки» — тестовые вопросы расходуют тот же лимит, что и вопросы посетителей' },
];
const install = (over: Partial<InstallViewProps>): ReactElement => createElement(InstallView, { botId: BOT, companyName: 'Стоматология «Улыбка»',
  snippet: { kind: 'contact_required' }, origins: [], contact: '', domain: '', errors: {}, busy: false, copied: false,
  onContact: noop, onSaveContact: noop, onDomain: noop, onAddDomain: noop, onCopy: noop, ...over });
const DIRECTIVES = [`script-src ${ORIGIN}`, `connect-src ${ORIGIN}`, `img-src ${ORIGIN} data:`];
const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  list: main(createElement(BotListSection, { list: LIST, create: createElement(BotForm, { idPrefix: 'new-bot', name: '', contact: '', greeting: '', errors: {},
    busy: false, submitLabel: 'Создать бота', contactRequired: false, onChange: noop, onSubmit: noop }) })),
  limit: main(createElement(BotListSection, { list: { plan: 'free', limit: 1, bots: [LIST.bots[0]!] }, create: null })),
  bot: main(createElement(BotLayout, { botId: BOT, companyName: 'Стоматология «Улыбка»', contact: '', greeting: '', sources: SOURCES, ready: true,
    sourcesBlock: createElement(Fragment, null, createElement(SourceList, { sources: SOURCES, retrying: null, errors: {}, onRetry: noop }),
      createElement(AddSource, { url: '', busy: false, errors: { url: 'Этот адрес ведёт во внутреннюю или служебную сеть — такие адреса мы не читаем' }, onUrl: noop, onSite: noop, onPdf: noop })),
    chat: createElement(OwnerChat, { companyName: 'Стоматология «Улыбка»', messages: MESSAGES, draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    settings: form({ contact: 'Укажите контакт: почта (info@example.ru), телефон (+7 900 000-00-00) или ссылка https://…' }) })),
  empty: main(createElement(BotLayout, { botId: BOT, companyName: 'Новый бот', contact: '+7 900 000-00-00', greeting: '', sources: [], ready: false,
    sourcesBlock: createElement(SourceList, { sources: [], retrying: null, errors: {}, onRetry: noop }),
    chat: createElement(OwnerChat, { companyName: 'Новый бот', messages: [], draft: '', busy: false, error: '', ready: false, onDraft: noop, onAsk: noop }),
    settings: form() })),
  'install-contact': main(install({ errors: { contact: 'Не похоже на контакт. Почта (info@example.ru), телефон (+7 900 000-00-00) или ссылка https://…' } })),
  'install-missing': main(install({ snippet: { kind: 'bundle_missing', directives: DIRECTIVES }, contact: '+7 900 000-00-00' })),
  'install-ready': main(install({ snippet: { kind: 'ready', directives: DIRECTIVES, tag: `<script src="${ORIGIN}/w/widget.0a1b2c3d.js" data-bot="AbCdEfGhIjKlMnOpQrStUv" async></script>` },
    origins: ['https://stomatologia-ulybka.ru', 'https://www.stomatologia-ulybka.ru', 'http://stand.example:8099'], copied: true })),
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
  for (const width of [320, 360, 414, 768, 1024, 1440]) for (const name of ['list', 'bot', 'install-ready']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: width === 1440 ? 900 : 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320 || width === 1440) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-dark-${name}-width-${width}.png`, fullPage: true });
      }
    }));
  }
  it('экран бота: три состояния задачи различимы текстом ленты; «Повторить» только у отказавшего сайта', () => open('bot', 'light', { width: 390, height: 844 }, async page => {
    const text = (await page.textContent('main')) ?? '';
    expect(text).toContain('Чтение идёт · 7 из 50 страниц');
    expect(text).toContain('Фрагменты идёт · 31 фрагм.');
    expect(text).toContain('Очередь идёт');
    expect(text).toContain('Чтение нет ответа');
    expect(text).toContain('Чтение отказ');
    expect(text).toContain('Фрагменты сделано · 212 фрагм.');
    expect(await page.getByRole('button', { name: 'Повторить' }).count()).toBe(1);
    expect(await page.locator('details.source-quote[open]').count()).toBe(1);
    expect(await page.locator('.source-quote a').getAttribute('rel')).toContain('noopener');
  }));
  it('SC-US-005-3: без контакта — формы контакта есть, кода установки и кнопки копирования нет', () => open('install-contact', 'dark', { width: 390, height: 844 }, async page => {
    expect(await page.locator('#install-contact').count()).toBe(1);
    expect(await page.locator('pre.snippet').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Скопировать код' }).count()).toBe(0);
    expect(await page.locator('#install-contact').getAttribute('aria-invalid')).toBe('true');
  }));
  it('SC-US-005-1/2: код с data-bot и async, кнопка «Скопировать», три директивы CSP, список доменов', () => open('install-ready', 'dark', { width: 390, height: 844 }, async page => {
    expect(await page.locator('pre.snippet code').textContent()).toBe(`<script src="${ORIGIN}/w/widget.0a1b2c3d.js" data-bot="AbCdEfGhIjKlMnOpQrStUv" async></script>`);
    expect(await page.getByRole('button', { name: 'Скопировать код' }).count()).toBe(1);
    expect(await page.locator('.csp-list li').allTextContents()).toEqual(DIRECTIVES);
    expect(await page.locator('.origin-list li').allTextContents()).toContain('https://stomatologia-ulybka.ru');
  }));
  it('виджет не собран — кода нет, честное уведомление', () => open('install-missing', 'light', { width: 390, height: 844 }, async page => {
    expect(await page.locator('pre.snippet').count()).toBe(0);
    expect(await page.textContent('main')).toContain('Виджет ещё не собран');
  }));
});
