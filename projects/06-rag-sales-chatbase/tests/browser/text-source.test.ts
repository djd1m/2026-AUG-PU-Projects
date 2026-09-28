// text-source (FR-SOURCE-005, A-N6-080): третий вариант «Текстовый файл по адресу» в AddSource и лента источника вида text —
// НАСТОЯЩАЯ разметка CabinetViews с НАСТОЯЩИМ globals.css в обеих темах, Chromium и WebKit (AC-7): подсказка про
// llms-full.txt, цели ≥ 44×44, «Обновить»/«Удалить» как у сайта, тексты отказов not_text/too_large для файла, пометка
// предела тарифа по разделам; правила прибора R1/R2/R5/R8 и axe на 320 и 390.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { AddSource, SourceList, TextSourceForm, type SourceItemView } from '../../apps/web/src/app/dashboard/CabinetViews';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/text-source/browser';
const BOT = '7b1c7a52-5c0e-4f55-9f39-1d3f6a2b8c41';
const FILE = 'https://aicoding.space/llms-full.txt';
const noop = () => {};
const job = (over: Partial<NonNullable<SourceItemView['job']>>) => ({ index_job_id: BOT, state: 'done' as const, queued: false,
  pages_done: 0, pages_total: null, chunks_done: 0, ...over });
const UNREAD = ['/llms-full.txt#курс-агенты', '/llms-full.txt#курс-очень-длинное-название-про-автоматизацию-разработки-с-нуля', '/llms-full.txt#курс-mcp'];
const SOURCES: SourceItemView[] = [
  { source_id: 'x1', kind: 'text', title: FILE, job: job({ pages_done: 50, pages_total: 55, chunks_done: 1300, truncated: 'page_budget', unread: UNREAD }) },
  { source_id: 'x2', kind: 'text', title: 'https://shop.example.ru/llms.txt', job: job({ state: 'running', pages_done: 3, pages_total: 12, chunks_done: 20 }) },
  { source_id: 'x3', kind: 'text', title: 'https://spa.example.ru/llms-full.txt', job: job({ state: 'failed', reason: 'not_text' }) },
  { source_id: 'x4', kind: 'text', title: 'https://big.example.ru/llms-full.txt', job: job({ state: 'failed', reason: 'too_large' }) },
  { source_id: 'x5', kind: 'text', title: 'https://ok.example.ru/about.md', job: job({ pages_done: 7, pages_total: 7, chunks_done: 40 }) },
];
const page = (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }), createElement('main', { className: 'center container stack' },
  createElement(SourceList, { sources: SOURCES, busy: null, confirming: null, errors: {}, onReindex: noop, onConfirm: noop, onDelete: noop }),
  createElement(AddSource, { url: '', busy: false, errors: {}, onUrl: noop, onSite: noop, onPdf: noop, botId: BOT }),
  createElement('section', { id: 'with-error' }, createElement(TextSourceForm, { url: 'aicoding.space', busy: false,
    error: 'Укажите адрес файла, например example.ru/llms-full.txt', onUrl: noop, onSubmit: noop }))));
const html = (theme: Theme) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — текстовый файл</title>
<style>${CSS}</style></head><body>${renderToStaticMarkup(page(theme))}</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/text-(dark|light)\.html$/.exec(req.url ?? '');
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
    try { const p = await context.newPage(); await p.goto(`${base}/text-${theme}.html`); await run(p); } finally { await context.close(); }
  }
  it('AddSource: третий вариант «Текстовый файл по адресу» с подсказкой про llms-full.txt; поле и кнопка ≥ 44×44', () => open('dark', 390, async p => {
    const form = p.locator('.add-source form.text-source-form');
    expect(await form.count()).toBe(1);
    expect(await form.locator('label[for=source-text]').textContent()).toBe('Текстовый файл по адресу');
    const hint = await form.locator('#source-text-hint').textContent();
    expect(hint).toContain('llms-full.txt');
    expect(hint).toContain('2 МБ');
    expect(hint).toContain('считается страницей тарифа');
    expect(await form.locator('#source-text').getAttribute('aria-describedby')).toBe('source-text-hint');
    expect(await form.locator('button[type=submit]').textContent()).toBe('Добавить файл');
    for (const target of [form.locator('#source-text'), form.locator('button[type=submit]')]) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // Ошибка поля — role=alert и связь через aria-describedby.
    const bad = p.locator('#with-error');
    expect(await bad.locator('#source-text-error').getAttribute('role')).toBe('alert');
    expect(await bad.locator('#source-text').getAttribute('aria-invalid')).toBe('true');
  }));
  it('лента источника text: вид «Текстовый файл», «Обновить»/«Удалить» как у сайта, отказы про файл, пометка предела по разделам', () => open('dark', 390, async p => {
    const items = p.locator('li.source-item');
    expect(await items.nth(0).locator('.source-kind').textContent()).toBe('Текстовый файл');
    expect(await items.nth(0).locator('.truncation-notice').textContent()).toBe('Прочитано 50 разделов файла из 55 — предел тарифа «Бесплатный» — 50 страниц '
      + '(платные тарифы — до 300); раздел файла (заголовок # или ##) считается страницей. Бот не знает того, что есть только в непрочитанных разделах. '
      + `Не прочитаны, например: ${UNREAD.join(', ')} и другие.`);
    expect(await items.nth(0).locator('ol.ribbon').textContent()).toContain('50 из 55 разделов файла');
    expect(await items.nth(0).locator('button').allTextContents()).toEqual(['Обновить', 'Удалить']);
    expect(await items.nth(1).locator('ol.ribbon').textContent()).toContain('3 из 12 разделов файла');
    expect(await items.nth(1).locator('button').allTextContents()).toEqual(['Удалить']);   // идёт — «Обновить» нет (третьей копии нет)
    expect(await items.nth(2).locator('[role=alert]').textContent()).toBe('По адресу не текстовый файл, а страница сайта или двоичный файл. Нужен .txt или .md — например, /llms-full.txt.');
    expect(await items.nth(2).locator('button').allTextContents()).toEqual(['Повторить', 'Удалить']);
    expect(await items.nth(3).locator('[role=alert]').textContent()).toContain('Файл больше 2 МБ');
    expect(await items.nth(4).locator('.truncation-notice').count()).toBe(0);
    for (const button of await p.locator('.source-list button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }));
  for (const theme of ['dark', 'light'] as const) for (const width of [320, 390]) {
    it(`${theme} ${width}: R1/R2/R5, axe (контраст AA) и R8 без отказов`, () => open(theme, width, async p => {
      expect(errors(await domRules(p, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(p))).toEqual([]);
      expect(errors(await textZoomRule(p))).toEqual([]);
      if (width === 320) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await p.screenshot({ path: `${ARTIFACTS}/${engineName}-${theme}-text-source-width-320.png`, fullPage: true });
      }
    }));
  }
});
