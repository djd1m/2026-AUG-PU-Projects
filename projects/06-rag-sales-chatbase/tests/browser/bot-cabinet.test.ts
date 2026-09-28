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
import { MonthBanner, PublishBlock, SummaryBlock, VerifyBlock } from '../../apps/web/src/app/dashboard/bots/[botId]/BotExtrasViews';
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
  { source_id: 's1', kind: 'site', title: 'https://stomatologia-ulybka.ru/', job: job({ state: 'done', pages_done: 48, pages_total: 48, chunks_done: 212 }), pages_truncated: 3 },
  { source_id: 's2', kind: 'site', title: 'https://stomatologia-ulybka.ru/ceny-i-uslugi-dlya-detey-i-vzroslyh', job: job({ pages_done: 7, pages_total: 50, chunks_done: 31 }) },
  { source_id: 's3', kind: 'pdf', title: 'прайс-2026.pdf', job: job({ queued: true }) },
  { source_id: 's4', kind: 'site', title: 'https://old.stomatologia-ulybka.ru/', job: job({ state: 'no_response', pages_done: 2 }) },
  { source_id: 's5', kind: 'site', title: 'https://blog.stomatologia-ulybka.ru/', job: job({ state: 'failed', reason: 'robots_disallowed' }) },
  { source_id: 's6', kind: 'pdf', title: 'скан-договора.pdf', job: job({ state: 'failed', reason: 'no_text_layer' }) },
];
// budget-truncation (A-N6-052): готовые источники, усечённые бюджетом серии, и обычный готовый — для сравнения.
const TRUNCATED: SourceItemView[] = [
  { source_id: 't1', kind: 'site', title: 'https://aicoding.space/', job: job({ state: 'done', pages_done: 21, pages_total: 21, chunks_done: 300, truncated: 'series_embed_budget' }) },
  { source_id: 't2', kind: 'pdf', title: 'каталог-2026.pdf', job: job({ state: 'done', pages_done: 12, pages_total: 80, chunks_done: 96, truncated: 'series_embed_budget' }) },
  { source_id: 't3', kind: 'site', title: 'https://stomatologia-ulybka.ru/', job: job({ state: 'done', pages_done: 48, pages_total: 48, chunks_done: 212 }) },
];
const MESSAGES: OwnerMessage[] = [
  { kind: 'question', text: 'Сколько стоит чистка зубов?' },
  { kind: 'answered', text: 'Профессиональная гигиена — 4 500 ₽.', source: { title: 'Цены на услуги', url: 'https://stomatologia-ulybka.ru/ceny',
    excerpt: 'Профессиональная гигиена полости рта (ультразвук, Air Flow, полировка) — 4 500 ₽.' } },
  { kind: 'question', text: 'Есть ли парковка?' },
  { kind: 'unknown', text: 'Я отвечаю только по материалам сайта компании «Стоматология Улыбка» и не нашёл там ответа на этот вопрос. Напишите: +7 900 000-00-00' },
  { kind: 'question', text: 'А в субботу работаете?' },
  { kind: 'refused', text: 'Исчерпан предел «ответов бота в сутки» — тестовые вопросы расходуют тот же лимит, что и вопросы посетителей' },
];
// source-lifecycle: список источников — «Обновить»/«Повторить»/«Удалить» и подтверждение удаления в два шага.
const LIST_HANDLERS = { busy: null, confirming: null, errors: {}, onReindex: noop, onConfirm: noop, onDelete: noop };
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
    sourcesBlock: createElement(Fragment, null, createElement(SourceList, { ...LIST_HANDLERS, sources: SOURCES }),
      createElement(AddSource, { url: '', busy: false, errors: { url: 'Этот адрес ведёт во внутреннюю или служебную сеть — такие адреса мы не читаем' }, onUrl: noop, onSite: noop, onPdf: noop })),
    chat: createElement(OwnerChat, { companyName: 'Стоматология «Улыбка»', messages: MESSAGES, draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    settings: form({ contact: 'Укажите контакт: почта (info@example.ru), телефон (+7 900 000-00-00) или ссылка https://…' }) })),
  'bot-truncated': main(createElement(BotLayout, { botId: BOT, companyName: 'Стоматология «Улыбка»', contact: '+7 900 000-00-00', greeting: '', sources: TRUNCATED, ready: true,
    sourcesBlock: createElement(SourceList, { ...LIST_HANDLERS, sources: TRUNCATED }),
    chat: createElement(OwnerChat, { companyName: 'Стоматология «Улыбка»', messages: [], draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    settings: form() })),
  empty: main(createElement(BotLayout, { botId: BOT, companyName: 'Новый бот', contact: '+7 900 000-00-00', greeting: '', sources: [], ready: false,
    sourcesBlock: createElement(SourceList, { ...LIST_HANDLERS, sources: [] }),
    chat: createElement(OwnerChat, { companyName: 'Новый бот', messages: [], draft: '', busy: false, error: '', ready: false, onDraft: noop, onAsk: noop }),
    settings: form() })),
  'bot-confirm': main(createElement(BotLayout, { botId: BOT, companyName: 'Стоматология «Улыбка»', contact: '+7 900 000-00-00', greeting: '', sources: SOURCES, ready: true,
    sourcesBlock: createElement(SourceList, { ...LIST_HANDLERS, sources: SOURCES, confirming: 's1',
      errors: { s5: 'Сегодня у этого бота уже 20 запусков индексации — это предел на сутки. Новые источники и обновления — завтра' } }),
    chat: createElement(OwnerChat, { companyName: 'Стоматология «Улыбка»', messages: [], draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    settings: form() })),
  // Фича public-page-and-summary (+ carry_over фичи 12): сводка, отметка «проверено», демо-страница, баннер месяца.
  extras: main(createElement(BotLayout, { botId: BOT, companyName: 'Стоматология «Улыбка»', contact: '+7 900 000-00-00', greeting: '', sources: [], ready: true,
    sourcesBlock: createElement(SourceList, { ...LIST_HANDLERS, sources: [] }),
    chat: createElement(OwnerChat, { companyName: 'Стоматология «Улыбка»', messages: [], draft: '', busy: false, error: '', ready: true, onDraft: noop, onAsk: noop }),
    settings: form(), banner: createElement(MonthBanner, { used: 300, limit: 300 }),
    summary: createElement(SummaryBlock, { summary: { answered: 40, unknown: 6, refused_limit: 2, last_unknown: [
      { text: 'Есть ли парковка у клиники на Арбате и сколько она стоит для пациентов в выходные дни?', asked_at: '2026-09-25T09:15:00.000Z' },
      { text: 'Делаете ли вы имплантацию под общим наркозом?', asked_at: '2026-09-24T18:02:00.000Z' }] } }),
    verify: createElement(VerifyBlock, { verified: false, busy: false, error: '', onToggle: noop }),
    publish: createElement(PublishBlock, { page: { slug: 'stomatologiya-ulybka-ab12', enabled: true, indexable: false,
      url: `${ORIGIN}/b/stomatologiya-ulybka-ab12` }, busy: false, error: '', onPublish: noop, onIndexable: noop }) })),
  'extras-empty': main(createElement(BotLayout, { botId: BOT, companyName: 'Новый бот', contact: '', greeting: '', sources: [], ready: false,
    sourcesBlock: createElement(SourceList, { ...LIST_HANDLERS, sources: [] }),
    chat: createElement(OwnerChat, { companyName: 'Новый бот', messages: [], draft: '', busy: false, error: '', ready: false, onDraft: noop, onAsk: noop }),
    settings: form(), banner: createElement(MonthBanner, { used: 3, limit: 300 }),
    summary: createElement(SummaryBlock, { summary: { answered: 0, unknown: 0, refused_limit: 0, last_unknown: [] } }),
    verify: createElement(VerifyBlock, { verified: true, busy: false, error: 'Дождитесь окончания загрузки материалов и проверьте ответы по ним', onToggle: noop }),
    publish: createElement(PublishBlock, { page: { slug: null, enabled: false, indexable: false, url: null }, busy: false,
      error: 'Укажите контакт для «не знаю» в настройках — без него бот не отвечает и страницу публиковать нечем', onPublish: noop, onIndexable: noop }) })),
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
  for (const width of [320, 360, 414, 768, 1024, 1440]) for (const name of ['list', 'bot', 'install-ready', 'extras']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: width === 1440 ? 900 : 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320 || width === 1440) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-dark-${name}-width-${width}.png`, fullPage: true });
      }
    }));
  }
  it('source-lifecycle: «Обновить» только у готового сайта, «Повторить» — у отказавшего, «Удалить» — у каждого источника; обрезанные страницы названы', () => open('bot', 'dark', { width: 390, height: 844 }, async page => {
    expect(await page.getByRole('button', { name: 'Обновить' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Повторить' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Удалить' }).count()).toBe(6);
    expect(await page.locator('li.source-item').first().textContent()).toContain('3 страниц прочитаны не целиком');
    expect(await page.locator('.source-list').getByRole('group').count()).toBe(0);
  }));
  it('A-N6-052: усечённый бюджетом источник — «сделано» с пометкой «Прочитано N…», у сайта подсказка «Обновить дочитает», у PDF нет; у обычного готового пометки нет', () => open('bot-truncated', 'dark', { width: 390, height: 844 }, async page => {
    const items = page.locator('li.source-item');
    expect(await items.nth(0).locator('.truncation-notice').textContent()).toBe('Прочитано 21 страница: закончился бюджет обработки текста для этого источника. Бот отвечает по прочитанному. «Обновить» продолжит чтение в пределах страниц тарифа — прочитанные страницы заново не оплачиваются.');
    expect(await items.nth(1).locator('.truncation-notice').textContent()).toBe('Прочитано 12 стр. PDF: закончился бюджет обработки текста для этого источника. Бот отвечает по прочитанному.');
    expect(await items.nth(2).locator('.truncation-notice').count()).toBe(0);
    expect(await items.nth(0).locator('.truncation-notice').getAttribute('role')).toBe('status');
    // Готово, а не отказ и не «идёт»: лента в тоне успеха, «Обновить» у сайта доступна.
    expect(await items.nth(0).locator('ol.ribbon').getAttribute('class')).toContain('tone-success');
    expect(await items.nth(0).getByRole('button', { name: 'Обновить' }).count()).toBe(1);
    expect(await page.locator('.source-list [role=alert]').count()).toBe(0);
  }));
  it('source-lifecycle: подтверждение удаления — вопрос с последствием, «Удалить» и «Отмена» только у выбранного; ошибка предела запусков — у своего источника', () => open('bot-confirm', 'light', { width: 390, height: 844 }, async page => {
    const group = page.getByRole('group', { name: 'Удаление источника https://stomatologia-ulybka.ru/' });
    expect(await group.count()).toBe(1);
    expect(await group.textContent()).toContain('Бот сразу перестанет отвечать по его страницам');
    expect(await group.getByRole('button', { name: 'Удалить' }).count()).toBe(1);
    expect(await group.getByRole('button', { name: 'Отмена' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Обновить' }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Удалить' }).count()).toBe(6);
    const s5 = page.locator('li.source-item').nth(4);
    expect(await s5.getByRole('alert').last().textContent()).toContain('20 запусков индексации');
  }));
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
  it('SC-US-010-1, SC-US-013, carry_over 12: сводка числами без процентов, вопросы «не знаю» и «Добавить материалы» к источникам; ссылка на страницу; баннер называет тестовый чат', () => open('extras', 'dark', { width: 390, height: 844 }, async page => {
    const summary = page.locator('section[aria-labelledby="summary-title"]');
    expect(await summary.locator('.summary-counts li').allTextContents()).toEqual(['40 ответил', '6 не знал', '2 отказов по лимиту']);
    expect(await summary.textContent()).not.toContain('%');
    expect(await summary.locator('.question-list li').count()).toBe(2);
    expect(await summary.getByRole('link', { name: 'Добавить материалы' }).getAttribute('href')).toBe('#sources-title');
    expect(await page.locator('#sources-title').count()).toBe(1);
    expect(await page.getByRole('link', { name: `${ORIGIN}/b/stomatologiya-ulybka-ab12` }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Снять публикацию' }).count()).toBe(1);
    expect(await page.getByRole('checkbox', { name: 'Разрешить поисковикам показывать страницу' }).isChecked()).toBe(false);
    expect(await page.getByRole('button', { name: 'Я проверил ответы бота' }).count()).toBe(1);
    expect(await page.getByRole('alert').first().textContent()).toContain('Тестовые вопросы в кабинете расходуют тот же лимит');
  }));
  it('SC-US-010-2: пусто — «Вопросов ещё не было», без нулей и процентов; не опубликовано — «Опубликовать страницу»; баннера нет до предела', () => open('extras-empty', 'light', { width: 390, height: 844 }, async page => {
    const summary = page.locator('section[aria-labelledby="summary-title"]');
    expect(await summary.textContent()).toContain('Вопросов ещё не было');
    expect(await summary.locator('.summary-counts').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Опубликовать страницу' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Снять отметку' }).count()).toBe(1);
    expect(await page.textContent('main')).not.toContain('Месячный лимит ответов исчерпан');
  }));
  it('виджет не собран — кода нет, честное уведомление', () => open('install-missing', 'light', { width: 390, height: 844 }, async page => {
    expect(await page.locator('pre.snippet').count()).toBe(0);
    expect(await page.textContent('main')).toContain('Виджет ещё не собран');
  }));
});
