// verify-audit (инцидент стенда 28.09, A-N6-077): отметка «Я проверил ответы бота» в НАСТОЯЩЕМ BotScreen, собранном esbuild и
// ГИДРИРОВАННОМ в браузере (образец — billing.test.ts); POST /api/bots/{id}/verify — маршрут тестового сервера, который
// записывает каждое тело. Доказывается: двойное нажатие НЕ снимает отметку; снятие — только кнопкой «Снять» подтверждения;
// Escape и «Отмена» ничего не отправляют и возвращают фокус; баннер после отметки сменяется строкой. Плюс прибор R1/R2/R5/R8
// и axe на блоке с раскрытым подтверждением в обеих темах.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { BotScreen, type BotScreenProps, type BotScreenState } from '../../apps/web/src/app/dashboard/bots/[botId]/BotScreen';
import { VERIFIED_DONE } from '../../apps/web/src/app/dashboard/GateBanner';
import { UNSET_WARNING } from '../../apps/web/src/app/dashboard/bots/[botId]/VerifyBlock';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/verify-audit/browser';
const BOT = '829606b3-5c0e-4f55-9f39-1d3f6a2b8c41';
const EVENTS = [{ kind: 'unset_owner' as const, at: '2026-09-28T10:46:00.000Z' }, { kind: 'set' as const, at: '2026-09-28T10:39:00.000Z' }];
const props = (verified: boolean): BotScreenProps & BotScreenState => ({
  botId: BOT, companyName: 'AI Coding Space', contact: '+7 900 000-00-00', greeting: '',
  sources: [{ source_id: 's1', kind: 'site', title: 'https://aicoding.space/', pages_truncated: 0,
    job: { index_job_id: BOT, state: 'done', queued: false, pages_done: 50, pages_total: 50, chunks_done: 1482 } } as never],
  answersVerified: verified, verification: { verifiedAt: verified ? '2026-09-28T10:39:00.000Z' : null, events: verified ? EVENTS.slice(1) : EVENTS },
  gate: { resetAt: null, stubVisitors: 0 }, monthAnswers: { used: 0, limit: 300 },
  summary: { answered: 3, unknown: 1, refused_limit: 0, not_verified_visitors: 0, last_unknown: [] },
  publicPage: { slug: null, enabled: false, indexable: false, url: null },
});
const doc = (body: string, theme: Theme, script: string) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — бот</title>
<style>${CSS}</style></head><body>${body}${script}</body></html>`;
const ENTRY = `import { hydrateRoot } from 'react-dom/client'; import { createElement } from 'react';
import { BotScreen } from './apps/web/src/app/dashboard/bots/[botId]/BotScreen';
hydrateRoot(document.getElementById('root'), createElement(BotScreen, window.__PROPS));`;

let bundle = '';
// Тела запросов отметки и управление ответом: задержка (мс) — чтобы проверить нажатие во время запроса.
let bodies: unknown[] = [];
let delayMs = 0;
let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  bundle = buildSync({ stdin: { contents: ENTRY, resolveDir: path.resolve('.'), loader: 'tsx' }, bundle: true, format: 'iife', write: false, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    alias: { 'next/navigation': path.resolve('tests/browser/next-navigation-shim.ts'), '@n6/rag/constants': path.resolve('packages/rag/src/constants.ts') } }).outputFiles[0]!.text;
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void (async () => {
      if (url.pathname === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle); }
      const live = /^\/live-(verified|unverified)-(dark|light)\.html$/.exec(url.pathname);
      if (live) {
        const p = props(live[1] === 'verified');
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end(doc(`<main class="center container"><div id="root">${renderToString(createElement(BotScreen, p))}</div></main>`, live[2] as Theme,
          `<script>window.__PROPS=${JSON.stringify(p)}</script><script src="/bundle.js"></script>`));
      }
      if (req.method === 'POST' && url.pathname === `/api/bots/${BOT}/verify`) {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { verified: boolean; confirm?: boolean };
        bodies.push(body);
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: { answers_verified: body.verified } }));
      }
      res.writeHead(404).end();
    })().catch(() => { res.writeHead(500).end(); });
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
  async function live(state: 'verified' | 'unverified', run: (page: Page) => Promise<void>, theme: Theme = 'dark', viewport = { width: 390, height: 844 }) {
    bodies = []; delayMs = 0;
    const context = await browser.newContext({ viewport });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${base}/live-${state}-${theme}.html`);
      // Гидрация завершена, когда у кнопки блока появились обработчики React (иначе клик ушёл бы в статическую разметку).
      await page.waitForFunction(() => {
        const button = document.querySelector('section[aria-labelledby="verify-title"] button');
        return !!button && Object.keys(button).some((k) => k.startsWith('__reactProps'));
      });
      await run(page);
      expect(pageErrors).toEqual([]);
    } finally { await context.close(); }
  }
  const block = (page: Page) => page.locator('section[aria-labelledby="verify-title"]');
  const status = (page: Page) => block(page).locator('[role="status"]');

  it('AC-3: двойное нажатие «Я проверил ответы бота» — отметка стоит, ни одного запроса снятия; подтверждение не раскрыто без второго явного шага', () => live('unverified', async (page) => {
    await block(page).getByRole('button', { name: 'Я проверил ответы бота' }).dblclick();
    await expect.poll(() => status(page).textContent()).toContain('Отмечено: посетители видят ответы бота');
    await page.waitForTimeout(300);
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    expect(bodies.every((b) => (b as { verified: boolean }).verified === true), JSON.stringify(bodies)).toBe(true);
    expect(await status(page).textContent()).toContain('Отмечено');
  }));
  it('AC-3: нажатие во время запроса — кнопка занята, второй запрос не уходит', () => live('unverified', async (page) => {
    delayMs = 400;
    const button = block(page).getByRole('button', { name: 'Я проверил ответы бота' });
    await button.click();
    await expect.poll(() => block(page).getByRole('button', { name: 'Сохраняем…' }).isDisabled()).toBe(true);
    await block(page).getByRole('button', { name: 'Сохраняем…' }).click({ force: true }).catch(() => {});
    await expect.poll(() => status(page).textContent()).toContain('Отмечено');
    expect(bodies).toEqual([{ verified: true }]);
  }));
  it('AC-2/4: «Снять отметку» ничего не отправляет — раскрывает подтверждение, фокус на «Отмена»; Escape закрывает, фокус возвращается', () => live('verified', async (page) => {
    const trigger = block(page).getByRole('button', { name: 'Снять отметку' });
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Снять отметку «Я проверил ответы бота»?' });
    await expect.poll(() => dialog.isVisible()).toBe(true);
    expect(await dialog.textContent()).toContain(UNSET_WARNING);
    expect(await trigger.getAttribute('aria-expanded')).toBe('true');
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('Отмена');
    await page.keyboard.press('Escape');
    await expect.poll(() => dialog.count()).toBe(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('Снять отметку');
    expect(bodies).toEqual([]);
    expect(await status(page).textContent()).toContain('Отмечено');
  }));
  it('AC-4: «Отмена» закрывает подтверждение без запроса; повторное нажатие «Снять отметку» при раскрытом — не запрос', () => live('verified', async (page) => {
    const trigger = block(page).getByRole('button', { name: 'Снять отметку' });
    await trigger.dblclick();
    const dialog = page.getByRole('alertdialog');
    await expect.poll(() => dialog.isVisible()).toBe(true);
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(bodies).toEqual([]);
    expect(await status(page).textContent()).toContain('Отмечено');
  }));
  it('AC-2: снятие — только «Снять» в подтверждении: один запрос { verified: false, confirm: true }, затем «Не отмечено»', () => live('verified', async (page) => {
    await block(page).getByRole('button', { name: 'Снять отметку' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Снять', exact: true }).click();
    await expect.poll(() => status(page).textContent()).toContain('Не отмечено');
    expect(bodies).toEqual([{ verified: false, confirm: true }]);
    expect(await page.getByRole('alertdialog').count()).toBe(0);
    expect(await block(page).getByRole('button', { name: 'Я проверил ответы бота' }).count()).toBe(1);
  }));
  it('AC-11: отметка из баннера — баннер сменяется строкой «Отметка поставлена», двойное нажатие не шлёт снятия', () => live('unverified', async (page) => {
    const banner = page.locator('section.gate-banner');
    await banner.getByRole('button', { name: 'Я проверил ответы бота' }).dblclick();
    await expect.poll(() => page.locator('.gate-done').textContent()).toBe(VERIFIED_DONE);
    await page.waitForTimeout(300);
    expect(await banner.count()).toBe(0);
    expect(bodies.every((b) => (b as { verified: boolean }).verified === true), JSON.stringify(bodies)).toBe(true);
  }));
  it('AC-9: строка «снята когда и кем» и история отметки раскрытием', () => live('unverified', async (page) => {
    expect(await status(page).textContent()).toMatch(/Снята 28 сентября.*13:46 владельцем\./);
    const history = block(page).locator('details.verify-history');
    expect(await history.getAttribute('open')).toBeNull();
    await history.locator('summary').click();
    const items = await history.locator('li').allTextContents();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/13:46 — снята владельцем$/);
    expect(items[1]).toMatch(/13:39 — поставлена владельцем$/);
  }));
  for (const theme of ['dark', 'light'] as const) {
    it(`AC-5 ${theme} 390: блок с раскрытым подтверждением — R1/R2/R5, axe (AA), R8`, () => live('verified', async (page) => {
      await block(page).getByRole('button', { name: 'Снять отметку' }).click();
      await block(page).locator('summary').click();
      expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(page))).toEqual([]);
      expect(errors(await textZoomRule(page))).toEqual([]);
    }, theme));
  }
  for (const width of [320, 768, 1440]) {
    it(`AC-5 ${width}: без горизонтального скролла, цели ≥ 44 (подтверждение раскрыто)`, () => live('verified', async (page) => {
      await block(page).getByRole('button', { name: 'Снять отметку' }).click();
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      for (const name of ['Снять', 'Отмена']) {
        const box = await page.getByRole('alertdialog').getByRole('button', { name, exact: true }).boundingBox();
        expect(box!.width, name).toBeGreaterThanOrEqual(44);
        expect(box!.height, name).toBeGreaterThanOrEqual(44);
      }
      if (width === 320) { mkdirSync(ARTIFACTS, { recursive: true }); await block(page).screenshot({ path: `${ARTIFACTS}/${engineName}-confirm-320.png` }); }
    }, 'dark', { width, height: 900 }));
  }
});
