// Экраны оплаты (фича tariffs-and-interest): НАСТОЯЩИЕ компоненты UpgradeScreen / ReturnView / Pricing с НАСТОЯЩИМ globals.css.
// 1) Статическая разметка всех состояний в обеих темах — правила прибора R1/R2/R5/R8 и axe (контраст AA): тарифы, экран
//    оплаты, экран интереса (SC-US-011-1: ни одного платёжного поля), текущий план, пять состояний возврата (AC-9).
// 2) Интерактив: те же компоненты собираются esbuild и ГИДРИРУЮТСЯ в браузере; API — маршруты тестового сервера.
//    «Оплатить» → POST /api/checkout → переход на confirmation_url (AC-2); ключ повтора один на экран; «Сообщите мне» →
//    POST /api/interest; payments_off → экран интереса; экран возврата опрашивает GET /api/checkout/{id} по идентификатору.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { UpgradeScreen, type UpgradeProps } from '../../apps/web/src/app/upgrade/UpgradeScreen';
import { ReturnScreen, ReturnView } from '../../apps/web/src/app/upgrade/return/ReturnScreen';
import { Pricing } from '../../apps/web/src/app/pricing/Pricing';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';
import type { ReturnState } from '../../apps/web/src/lib/payment-return';

type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/tariffs-and-interest/browser';
const INTENT = '3f2b1c7a-5c0e-4f55-9f39-1d3f6a2b8c41';
const FREE = { plan: 'free', plan_source: 'none', plan_paid_until: null };
const upgrade = (over: Partial<UpgradeProps>): UpgradeProps => ({ plan: 'nobadge', title: 'Без бейджа', price: '990 ₽', paymentsOn: true, current: FREE, ...over });
const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const ret = (state: ReturnState) => main(createElement('section', { className: 'card stack upgrade' }, createElement(ReturnView, { state })));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  pricing: (theme) => createElement(Pricing, { theme, answers: { free: { day: 50, month: 300 }, paid: { day: 300, month: 3000 } } }),
  pay: main(createElement(UpgradeScreen, upgrade({}))),
  'pay-current': main(createElement(UpgradeScreen, upgrade({ plan: 'studio', title: 'Студия', price: '4 900 ₽',
    current: { plan: 'nobadge', plan_source: 'payment', plan_paid_until: '2026-10-26T09:00:00.000Z' } }))),
  interest: main(createElement(UpgradeScreen, upgrade({ paymentsOn: false }))),
  'return-waiting': ret({ kind: 'waiting', attempts: 3 }),
  'return-succeeded': ret({ kind: 'succeeded', plan: 'nobadge', until: '2026-10-26T09:00:00.000Z' }),
  'return-failed': ret({ kind: 'failed' }),
  'return-unconfirmed': ret({ kind: 'unconfirmed' }),
  'return-not_found': ret({ kind: 'not_found' }),
  'return-paid_inactive': ret({ kind: 'paid_inactive' }),
};
const NAMES = Object.keys(PAGES);
const doc = (body: string, theme: Theme, script = '') => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — оплата</title>
<style>${CSS}</style></head><body>${body}${script}</body></html>`;

// Гидрация: тот же исходник компонента, что у Next, собранный esbuild в IIFE; пропсы — из window.__PROPS.
const ENTRY = `import { hydrateRoot } from 'react-dom/client'; import { createElement } from 'react';
import { UpgradeScreen } from './apps/web/src/app/upgrade/UpgradeScreen'; import { ReturnScreen } from './apps/web/src/app/upgrade/return/ReturnScreen';
const p = window.__PROPS; const root = document.getElementById('root');
hydrateRoot(root, p.kind === 'upgrade' ? createElement(UpgradeScreen, p.props) : createElement(ReturnScreen, p.props));`;
let bundle = '';
type Api = { checkout: Array<{ status: number; body: unknown }>; checkoutBodies: unknown[]; interestBodies: unknown[]; statuses: Array<{ status: number; body: unknown }>; polls: number };
let api: Api;
const reset = () => { api = { checkout: [], checkoutBodies: [], interestBodies: [], statuses: [], polls: 0 }; };

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  const built = buildSync({ stdin: { contents: ENTRY, resolveDir: path.resolve('.'), loader: 'tsx' }, bundle: true, format: 'iife', write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  bundle = built.outputFiles[0]!.text;
  reset();
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const read = async () => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); return JSON.parse(Buffer.concat(chunks).toString('utf8')); };
    void (async () => {
      const page = /^\/([a-z_-]+)-(dark|light)\.html$/.exec(url.pathname);
      if (page && NAMES.includes(page[1]!)) { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(doc(renderToStaticMarkup(PAGES[page[1]!]!(page[2] as Theme)), page[2] as Theme)); }
      if (url.pathname === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle); }
      const live = /^\/live-(upgrade|interest|return)\.html$/.exec(url.pathname);
      if (live) {
        const kind = live[1] === 'return' ? 'return' : 'upgrade';
        const props = kind === 'return' ? { intentId: INTENT } : upgrade({ paymentsOn: live[1] === 'upgrade' });
        // renderToString, а не renderToStaticMarkup: гидрации нужны разделители соседних текстовых узлов (иначе React #418).
        const markup = kind === 'upgrade' ? renderToString(createElement(UpgradeScreen, props as UpgradeProps)) : renderToString(createElement(ReturnScreen, props as { intentId: string }));
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end(doc(`<main class="center container"><div id="root">${markup}</div></main>`, 'dark',
          `<script>window.__PROPS=${JSON.stringify({ kind, props })}</script><script src="/bundle.js"></script>`));
      }
      if (url.pathname === '/yookassa-form') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(doc('<h1>Форма ЮKassa</h1>', 'dark')); }
      if (req.method === 'POST' && url.pathname === '/api/checkout') { api.checkoutBodies.push(await read()); const next = api.checkout.shift() ?? { status: 503, body: { error: { code: 'unavailable', message: 'нет' } } }; return json(next.status, next.body); }
      if (req.method === 'POST' && url.pathname === '/api/interest') { api.interestBodies.push(await read()); return json(200, { data: { status: api.interestBodies.length === 1 ? 'recorded' : 'already_recorded' } }); }
      if (req.method === 'GET' && url.pathname === `/api/checkout/${INTENT}`) { api.polls++; const next = api.statuses.shift() ?? { status: 200, body: { data: { status: 'pending' } } }; return json(next.status, next.body); }
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
  async function open(name: string, theme: Theme, viewport: { width: number; height: number }, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport });
    try { const page = await context.newPage(); await page.goto(`${base}/${name}-${theme}.html`); await run(page); } finally { await context.close(); }
  }
  async function live(name: string, run: (page: Page) => Promise<void>) {
    reset();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${base}/live-${name}.html`);
      await run(page);
      expect(pageErrors).toEqual([]);
    } finally { await context.close(); }
  }
  for (const theme of ['dark', 'light'] as const) for (const name of NAMES) {
    it(`${name} ${theme} 390: R1/R2/R5, axe (R4, контраст AA) и R8 без отказов`, () => open(name, theme, { width: 390, height: 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(page))).toEqual([]);
      expect(errors(await textZoomRule(page))).toEqual([]);
    }));
  }
  for (const width of [320, 768, 1440]) for (const name of ['pay', 'interest', 'return-succeeded']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: 900 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320) { mkdirSync(ARTIFACTS, { recursive: true }); await page.screenshot({ path: `${ARTIFACTS}/${engineName}-${name}-320.png`, fullPage: true }); }
    }));
  }
  it('SC-US-011-1: экран интереса — «Оплата скоро — сообщим», ни одного платёжного поля и кнопки оплаты', () => open('interest', 'light', { width: 390, height: 844 }, async page => {
    const text = (await page.textContent('main')) ?? '';
    expect(text).toContain('Оплата скоро — сообщим');
    expect(await page.locator('input').count()).toBe(0);
    expect(await page.getByRole('button', { name: /Оплатить/ }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Сообщите мне' }).count()).toBe(1);
    expect(text).toContain('Цена предварительная');
  }));
  it('тарифы: «цена предварительная» у каждой платной цены, кнопки ведут на /upgrade', () => open('pricing', 'dark', { width: 390, height: 844 }, async page => {
    expect(await page.locator('.plan .price-note').allTextContents()).toEqual(['Цена предварительная', 'Цена предварительная']);
    expect(await page.getByRole('link', { name: 'Убрать бейдж' }).getAttribute('href')).toBe('/upgrade?plan=nobadge');
    expect(await page.getByRole('link', { name: 'Подключить студию' }).getAttribute('href')).toBe('/upgrade?plan=studio');
  }));
  it('AC-9: шесть состояний возврата различимы (data-state и заголовок у каждого свой)', async () => {
    const seen = new Set<string>();
    for (const name of NAMES.filter((n) => n.startsWith('return-'))) await open(name, 'dark', { width: 390, height: 844 }, async page => {
      seen.add(`${await page.locator('[data-state]').getAttribute('data-state')}|${await page.locator('h1').textContent()}`);
    });
    expect(seen.size).toBe(6);
  });
  it('AC-2 интерактив: «Оплатить» → POST /api/checkout с планом и ключом → переход на confirmation_url; кнопка гаснет, ключ один на экран', () => live('upgrade', async page => {
    api.checkout.push({ status: 503, body: { error: { code: 'payment_provider_unavailable', message: 'Платёжный сервис временно недоступен. Повторите через минуту' } } });
    api.checkout.push({ status: 201, body: { data: { intent_id: INTENT, redirect_url: `${base}/yookassa-form` } } });
    await page.getByRole('button', { name: 'Оплатить 990 ₽' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Платёжный сервис временно недоступен');
    await page.getByRole('button', { name: 'Оплатить 990 ₽' }).click();
    await page.waitForURL(`${base}/yookassa-form`);
    expect(api.checkoutBodies).toHaveLength(2);
    const [first, second] = api.checkoutBodies as Array<{ plan: string; idempotency_key: string }>;
    expect(first!.plan).toBe('nobadge');
    expect(first!.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(second!.idempotency_key).toBe(first!.idempotency_key);
  }));
  it('payments_off от сервера → экран интереса без перезагрузки; «Сообщите мне» пишет заявку', () => live('upgrade', async page => {
    api.checkout.push({ status: 409, body: { error: { code: 'payments_off', message: 'Оплата скоро откроется' } } });
    await page.getByRole('button', { name: /Оплатить/ }).click();
    await expect.poll(() => page.locator('[data-state="interest"]').count()).toBe(1);
    await page.getByRole('button', { name: 'Сообщите мне' }).click();
    await expect.poll(() => page.textContent('main')).toContain('Записали');
    expect(api.interestBodies).toEqual([{ plan: 'nobadge', origin_screen: 'upgrade' }]);
  }));
  it('AC-9 интерактив: возврат опрашивает по идентификатору; pending → succeeded показывает «включён» и срок', () => live('return', async page => {
    api.statuses.push({ status: 200, body: { data: { status: 'pending' } } });
    api.statuses.push({ status: 200, body: { data: { status: 'succeeded', account_plan: 'nobadge', plan_paid_until: '2026-10-26T09:00:00.000Z' } } });
    await expect.poll(() => page.locator('[data-state]').getAttribute('data-state'), { timeout: 10_000 }).toBe('succeeded');
    expect(api.polls).toBeGreaterThanOrEqual(2);
    expect(await page.textContent('main')).toContain('Оплачено до');
  }));
  it('возврат: платёж отменён → «Оплата не прошла»; чужое намерение (404) → «Оплата не найдена»; сбой опроса — не отказ', () => live('return', async page => {
    api.statuses.push({ status: 500, body: {} });
    api.statuses.push({ status: 200, body: { data: { status: 'canceled' } } });
    await expect.poll(() => page.locator('[data-state]').getAttribute('data-state'), { timeout: 10_000 }).toBe('failed');
    reset();
    api.statuses.push({ status: 404, body: { error: { code: 'not_found', message: 'нет' } } });
    await page.reload();
    await expect.poll(() => page.locator('[data-state]').getAttribute('data-state'), { timeout: 10_000 }).toBe('not_found');
  }));
});
