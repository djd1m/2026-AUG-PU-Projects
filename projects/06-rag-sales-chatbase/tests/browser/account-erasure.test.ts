// Экраны удаления аккаунта (фича account-erasure; AC-13, AC-12): НАСТОЯЩИЕ компоненты AccountScreen / ErasureStatus /
// SummaryBlock со стиранием журнала и НАСТОЯЩИЙ globals.css. 1) Статическая разметка всех состояний в обеих темах — правила
// прибора R1/R2/R5/R8 и axe (контраст AA); цели ≥ 44 на 320/768/1440. 2) Интерактив: форма удаления гидрируется в браузере:
// неверный пароль → ошибка ПОД полем (aria-invalid), без перехода; 202 → переход на /account/erased; тело — { confirm, password }.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import type { ErasurePreview } from '../../packages/db/src/index';
import { AccountDeletionForm, AccountScreen } from '../../apps/web/src/app/dashboard/account/AccountScreen';
import { ErasureStatus } from '../../apps/web/src/app/account/erased/ErasureStatus';
import { SummaryBlock, type EraseLogView } from '../../apps/web/src/app/dashboard/bots/[botId]/BotExtrasViews';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));
type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/account-erasure/browser';
const FULL: ErasurePreview = { bots: 3, clientBots: 2, paidDaysLeft: 17, partner: { payoutMinor: 150_000, burnMinor: 30_000, hasDetails: true } };
const PLAIN: ErasurePreview = { bots: 0, clientBots: 0, paidDaysLeft: null, partner: null };
const SUMMARY = { answered: 12, unknown: 3, refused_limit: 0, last_unknown: [{ text: 'Есть ли доставка в область?', asked_at: '2026-09-26T09:00:00.000Z' }] };
const erase = (over: Partial<EraseLogView>): EraseLogView => ({ confirming: false, busy: false, error: '', done: false, onAsk: () => {}, onConfirm: () => {}, onCancel: () => {}, ...over });

const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  'account-full': main(createElement(AccountScreen, { preview: FULL })),
  'account-plain': main(createElement(AccountScreen, { preview: PLAIN })),
  'erased-erasing': main(createElement(ErasureStatus, { state: { status: 'erasing', deadline: '2026-09-30T09:00:00.000Z', overdue: false } })),
  'erased-overdue': main(createElement(ErasureStatus, { state: { status: 'erasing', deadline: '2026-09-20T09:00:00.000Z', overdue: true } })),
  'erased-deleted': main(createElement(ErasureStatus, { state: { status: 'deleted', deadline: '2026-09-30T09:00:00.000Z', overdue: false } })),
  'erased-none': main(createElement(ErasureStatus, { state: null })),
  'log-ask': main(createElement(SummaryBlock, { summary: SUMMARY, erase: erase({}) })),
  'log-confirm': main(createElement(SummaryBlock, { summary: SUMMARY, erase: erase({ confirming: true }) })),
  'log-done': main(createElement(SummaryBlock, { summary: { answered: 0, unknown: 0, refused_limit: 0, last_unknown: [] }, erase: erase({ done: true }) })),
};
const NAMES = Object.keys(PAGES);
const doc = (body: string, theme: Theme, script = '') => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — аккаунт</title>
<style>${CSS}</style></head><body>${body}${script}</body></html>`;
const ENTRY = `import { hydrateRoot } from 'react-dom/client'; import { createElement } from 'react';
import { AccountDeletionForm } from './apps/web/src/app/dashboard/account/AccountScreen';
hydrateRoot(document.getElementById('root'), createElement(AccountDeletionForm));`;

let bundle = '';
let replies: Array<{ status: number; body: unknown }> = [];
let bodies: unknown[] = [];
let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  bundle = buildSync({ stdin: { contents: ENTRY, resolveDir: path.resolve('.'), loader: 'tsx' }, bundle: true, format: 'iife', write: false, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    alias: { 'next/navigation': path.resolve('tests/browser/next-navigation-shim.ts'), '@n6/rag/commission': path.resolve('packages/rag/src/commission.ts') } }).outputFiles[0]!.text;
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void (async () => {
      const page = /^\/([a-z-]+)-(dark|light)\.html$/.exec(url.pathname);
      if (page && NAMES.includes(page[1]!)) { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(doc(renderToStaticMarkup(PAGES[page[1]!]!(page[2] as Theme)), page[2] as Theme)); }
      if (url.pathname === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle); }
      if (url.pathname === '/live-form.html') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end(doc(`<main class="center container"><div id="root">${renderToString(createElement(AccountDeletionForm))}</div></main>`, 'dark', '<script src="/bundle.js"></script>'));
      }
      if (url.pathname === '/account/erased') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(doc('<main><h1>Аккаунт удаляется</h1></main>', 'dark')); }
      if (req.method === 'DELETE' && url.pathname === '/api/account') {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
        bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
        const next = replies.shift() ?? { status: 503, body: { error: { code: 'unavailable', message: 'нет' } } };
        res.writeHead(next.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(next.body));
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
  async function open(name: string, theme: Theme, viewport: { width: number; height: number }, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport });
    try { const page = await context.newPage(); await page.goto(`${base}/${name}-${theme}.html`); await run(page); } finally { await context.close(); }
  }
  for (const theme of ['dark', 'light'] as const) for (const name of NAMES) {
    it(`${name} ${theme} 390: R1/R2/R5, axe (контраст AA) и R8 без отказов`, () => open(name, theme, { width: 390, height: 844 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
      expect(errors(await axeRule(page))).toEqual([]);
      expect(errors(await textZoomRule(page))).toEqual([]);
    }));
  }
  for (const width of [320, 768, 1440]) for (const name of ['account-full', 'erased-overdue', 'log-confirm']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: 900 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320) { mkdirSync(ARTIFACTS, { recursive: true }); await page.screenshot({ path: `${ARTIFACTS}/${engineName}-${name}-320.png`, fullPage: true }); }
    }));
  }
  it('AC-13: последствия перечислены ДО подтверждения — боты, боты у клиентов, сгорающие дни, к выплате и сгорит, хранение оплат', () => open('account-full', 'light', { width: 390, height: 844 }, async page => {
    const items = await page.locator('ul[aria-label="Что произойдёт"] li').allTextContents();
    expect(items.join('\n')).toMatch(/ботов \(3\)/);
    expect(items.join('\n')).toMatch(/клиентам \(2\)/);
    expect(items.join('\n')).toMatch(/дни плана \(17\) сгорят/);
    expect(items.join('\n')).toMatch(/К выплате 1\s500\s₽/);
    expect(items.join('\n')).toMatch(/Сгорит 300\s₽/);
    expect(items.join('\n')).toContain('хранятся 5 лет');
    expect(await page.getByRole('button', { name: 'Удалить аккаунт навсегда' }).count()).toBe(1);
    expect(await page.getByLabel('Пароль от аккаунта').getAttribute('type')).toBe('password');
  }));
  it('AC-13: четыре состояния квитанции различимы; просрочка — alert; нет квитанции — вход', async () => {
    const seen = new Map<string, string>();
    for (const name of ['erased-erasing', 'erased-overdue', 'erased-deleted', 'erased-none']) await open(name, 'dark', { width: 390, height: 844 }, async page => {
      seen.set(name, (await page.textContent('main'))?.trim() ?? '');
      if (name === 'erased-overdue') expect(await page.getByRole('alert').count()).toBe(1);
      if (name === 'erased-none') expect(await page.locator('main').getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login');
    });
    expect(new Set(seen.values()).size).toBe(4);
  });
  it('AC-12: журнал вопросов — кнопка, подтверждение в два шага, итог «стёрт»', async () => {
    await open('log-ask', 'dark', { width: 390, height: 844 }, async page => { expect(await page.getByRole('button', { name: 'Стереть журнал вопросов' }).count()).toBe(1); });
    await open('log-confirm', 'dark', { width: 390, height: 844 }, async page => {
      expect(await page.getByRole('button', { name: 'Стереть журнал' }).count()).toBe(1);
      expect(await page.getByRole('button', { name: 'Отмена' }).count()).toBe(1);
    });
    await open('log-done', 'dark', { width: 390, height: 844 }, async page => { expect(await page.textContent('main')).toContain('Журнал вопросов стёрт'); });
  });
  it('интерактив: неверный пароль — ошибка ПОД полем без перехода; 202 — переход на /account/erased; тело { confirm, password }', async () => {
    replies = [{ status: 401, body: { error: { code: 'invalid_password', message: 'Неверный пароль', field: 'password' } } }, { status: 202, body: { data: { accepted: true } } }];
    bodies = [];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${base}/live-form.html`);
      await page.waitForFunction(() => document.getElementById('root')?.hasChildNodes());
      await page.getByLabel('Пароль от аккаунта').fill('wrong-pass');
      await page.getByLabel('Понимаю: удаление необратимо, отменить его нельзя').check();
      await page.getByRole('button', { name: 'Удалить аккаунт навсегда' }).click();
      await expect.poll(() => page.locator('#erase-password-error').textContent()).toBe('Неверный пароль');
      expect(await page.getByLabel('Пароль от аккаунта').getAttribute('aria-invalid')).toBe('true');
      expect(new URL(page.url()).pathname).toBe('/live-form.html');
      await page.getByLabel('Пароль от аккаунта').fill('correct-pass');
      await page.getByRole('button', { name: 'Удалить аккаунт навсегда' }).click();
      await page.waitForURL('**/account/erased');
      expect(bodies).toEqual([{ confirm: true, password: 'wrong-pass' }, { confirm: true, password: 'correct-pass' }]);
      expect(pageErrors).toEqual([]);
    } finally { await context.close(); }
  });
});
