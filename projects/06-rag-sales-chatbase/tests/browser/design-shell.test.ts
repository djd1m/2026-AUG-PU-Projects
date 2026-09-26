// Каркас design-shell (фича 8): НАСТОЯЩАЯ разметка страниц N6 (Landing, Pricing, AuthForm, CabinetEmpty) с НАСТОЯЩИМ
// globals.css в обеих темах — правила прибора R1/R2/R4/R5/R8/R9 и контраст AA. Образец —
// projects/05-podcast-clips-opus/tests/browser/responsive-check.test.ts (коммит 90fe80a), разделы «Фича 28 landing-demo»
// и «палитра globals.css»; маршруты и селекторы — N6. Идёт только в контейнере Playwright (check-responsive.sh --test).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule, firstScreenRule, firstScreenSelectors, FIRST_SCREEN_VIEWPORTS } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { Landing } from '../../apps/web/src/app/Landing';
import { Pricing } from '../../apps/web/src/app/pricing/Pricing';
import { AuthForm } from '../../apps/web/src/app/login/AuthForm';
import { CabinetEmpty } from '../../apps/web/src/app/dashboard/CabinetEmpty';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
import { LogoutButton } from '../../apps/web/src/app/dashboard/LogoutButton';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/design-shell/browser';
// Те же обёртки, что у page.tsx каждого маршрута (layout.tsx: <html lang data-theme>, viewport без запрета зума).
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  landing: theme => createElement(Landing, { theme }),
  pricing: theme => createElement(Pricing, { theme }),
  login: theme => createElement(Fragment, null, createElement(SiteHeader, { theme }),
    createElement('main', { className: 'center container' }, createElement(AuthForm, {}))),
  cabinet: theme => createElement(Fragment, null, createElement(SiteHeader, { theme, home: '/dashboard' }, createElement(LogoutButton)),
    createElement('main', { className: 'center container' }, createElement(CabinetEmpty))),
  // Состояния, которых нет на пустых страницах: отказ входа, уведомление, опасное действие, акцент на подложках.
  states: theme => createElement(Fragment, null, createElement(SiteHeader, { theme }), createElement('main', { className: 'center container stack' },
    createElement('form', { className: 'auth-card' }, createElement('label', null, 'Почта', createElement('input', { placeholder: 'name@example.ru' })),
      createElement('button', { type: 'button' }, 'Войти'), createElement('p', { role: 'alert' }, 'Неверная почта или пароль'),
      createElement('button', { type: 'button', className: 'danger' }, 'Удалить аккаунт')),
    createElement('p', { className: 'notice' }, 'Бот включён — ', createElement('strong', { className: 'accent-text' }, 'готово')),
    createElement('div', { className: 'card' }, createElement('p', { className: 'accent-text' }, '990 ₽/мес'), createElement('p', { className: 'muted' }, 'Вторичный')),
    createElement('select', { 'aria-label': 'План' }, createElement('option', null, 'Без бейджа')))),
};
const html = (name: string, theme: Theme) => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр</title>
<style>${CSS}</style></head><body>${renderToStaticMarkup(PAGES[name]!(theme))}</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  // Громкий отказ, а не пропуск: набор идёт только в контейнере Playwright.
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer((req, res) => {
    const match = /^\/(landing|pricing|login|cabinet|states)-(dark|light)\.html$/.exec(req.url ?? '');
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
    // R9: поле «адрес сайта» и «Создать бота» — в первом экране телефона, каждый селектор отдельно, до прокрутки.
    for (const { w, h } of FIRST_SCREEN_VIEWPORTS) it(`R9 / ${theme} ${w}x${h}: поле адреса и «Создать бота» в первом экране`,
      () => open('landing', theme, { width: w, height: h }, true, async page => {
        const selectors = firstScreenSelectors('/');
        expect(selectors).toEqual(['#site-url', '.url-form button[type=submit]']);
        const lost: string[] = [];
        for (const selector of selectors) lost.push(...(await firstScreenRule(page, selector)).map((f: { selector: string; message: string }) => `${f.selector}: ${f.message}`));
        expect(lost, `R9 за сгибом: ${JSON.stringify(lost)}`).toEqual([]);
        const geometry = await page.evaluate(() => {
          const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
          return { nav: box('.navigation'), h1: box('.hero h1'), input: box('#site-url'), button: box('.url-form button'), innerHeight };
        });
        // FR-LOOK-010: кнопка 48 px (3rem), поле — той же высоты.
        expect(geometry.button.height).toBeGreaterThanOrEqual(48); expect(geometry.input.height).toBeGreaterThanOrEqual(48);
        mkdirSync(ARTIFACTS, { recursive: true });
        const stem = `${ARTIFACTS}/${engineName}-${theme}-first-screen-${w}x${h}`;
        writeFileSync(`${stem}.json`, JSON.stringify(geometry, null, 2) + '\n');
        await page.screenshot({ path: `${stem}.png`, fullPage: false });
      }));

    for (const name of ['landing', 'pricing', 'login', 'cabinet', 'states']) {
      it(`${name} ${theme} 390: R1/R2/R5, axe (R4, контраст AA) и R8 без отказов`, () => open(name, theme, { width: 390, height: 844 }, false, async page => {
        expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
        expect(errors(await axeRule(page))).toEqual([]);
        expect(errors(await textZoomRule(page))).toEqual([]);
      }));
    }
  }
  // R1 на крайних ширинах и брейкпоинтах FR-LOOK-014 (≈400/736/1112 + 360); скриншоты — улики, не ассерт.
  for (const width of [320, 360, 414, 768, 1024, 1440]) for (const name of ['landing', 'pricing', 'login', 'cabinet']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: width === 1440 ? 900 : 844 }, false, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320 || width === 1440) {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/${engineName}-dark-${name}-width-${width}.png`, fullPage: false });
      }
    }));
  }
  it('таблица сравнения тарифов на 320 прокручивается в своём контейнере, а не страницей', () => open('pricing', 'light', { width: 320, height: 640 }, false, async page => {
    const sizes = await page.evaluate(() => { const wrap = document.querySelector('.table-wrap')!; return { wrap: wrap.scrollWidth > wrap.clientWidth, page: document.documentElement.scrollWidth > innerWidth }; });
    expect(sizes).toEqual({ wrap: true, page: false });
  }));
  it('обе палитры применяются к одной разметке по data-theme', () => open('landing', 'dark', { width: 390, height: 844 }, false, async page => {
    // Статичная разметка без гидратации: обработчик повторяет ThemeToggle.toggle (тот же themeCookie) — проверяем, что
    // обе палитры применяются к ОДНОЙ разметке и --paper меняется, без перезагрузки.
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect({ before, after }).toEqual({ before: 'rgb(13, 15, 18)', after: 'rgb(246, 247, 249)' });
  }));
});
