// Экраны партнёрки и студии (фича partner-and-studio): НАСТОЯЩИЕ компоненты PartnerScreen / StudioScreen / InviteView / AuthForm с
// НАСТОЯЩИМ globals.css. 1) Статическая разметка всех состояний в обеих темах — правила прибора R1/R2/R5/R8 и axe (контраст AA).
// 2) Интерактив: те же компоненты собираются esbuild и ГИДРИРУЮТСЯ в браузере; API — маршруты тестового сервера:
//    реквизиты (номер карты → ошибка под полем), «Передать клиенту» (ссылка), приём приглашения (предел плана → успех),
//    регистрация с неверным кодом партнёра (ошибка под полем, перехода нет) → с верным (переход по next).
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
import type { InvitePreview, PartnerCabinet, StudioCabinet } from '../../packages/db/src/index';
import { NotPartner, PartnerScreen } from '../../apps/web/src/app/dashboard/partner/PartnerScreen';
import { StudioScreen } from '../../apps/web/src/app/dashboard/studio/StudioScreen';
import { InviteView, type InviteOutcome } from '../../apps/web/src/app/invite/[token]/InviteScreen';
import { AuthForm } from '../../apps/web/src/app/login/AuthForm';
import { SiteHeader } from '../../apps/web/src/app/SiteHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));
type Theme = 'dark' | 'light';
const CSS = readFileSync('apps/web/src/app/globals.css', 'utf8');
const ARTIFACTS = 'tests/artifacts/partner-and-studio/browser';
const ORIGIN = 'https://sufler.test';
const TOKEN = 'T'.repeat(43);
const BOT = '22222222-2222-4222-8222-222222222222';
const old = '2026-08-01T09:00:00.000Z';
const CABINET: PartnerCabinet = {
  codes: [{ code: 'studio-kolos', group: 'studio', frozen: false, rate_bp: 2000 }, { code: 'seed-net', group: 'seed-net', frozen: true, rate_bp: 2000 }],
  cohort: { registrations: 12, rejected: 1, installs: 5, conversions: 2 },
  money: { total_minor: 145_000, due_minor: 120_000, deferred_minor: 25_000, debt_minor: 0, payout_date: '2026-10-04T21:00:00.000Z', minimum_minor: 100_000 },
  entries: [{ kind: 'accrual', amount_minor: 19_107, created_at: old, available_at: old }, { kind: 'clawback', amount_minor: -19_107, created_at: old, available_at: old },
    { kind: 'payout', amount_minor: -100_000, created_at: old, available_at: old }],
  payout_details: { phone_masked: '+7 *** ***-00-00', bank: 'Т-Банк' },
};
const EMPTY: PartnerCabinet = { ...CABINET, codes: [CABINET.codes[0]!], cohort: { registrations: 0, rejected: 0, installs: 0, conversions: 0 },
  money: { ...CABINET.money, total_minor: 0, due_minor: 0, deferred_minor: 0 }, entries: [], payout_details: null };
const DEBT: PartnerCabinet = { ...CABINET, money: { ...CABINET.money, total_minor: -19_107, due_minor: 0, deferred_minor: 0, debt_minor: 19_107 } };
const STUDIO: StudioCabinet = { plan: 'studio', code: 'studio-kolos',
  cohort: { invites_accepted: 3, installs_30d: 3, answers_30d: 41, conversions: 1 },
  bots: [{ bot_id: BOT, company_name: 'Пекарня «Колос» для клиента с очень длинным названием компании', transferred: false, answered_7d: 0, unknown_7d: 0, installs: 0 },
    { bot_id: '33333333-3333-4333-8333-333333333333', company_name: 'Стоматология «Улыбка»', transferred: true, answered_7d: 17, unknown_7d: 3, installs: 1 }] };
const STUDIO_EMPTY: StudioCabinet = { plan: 'free', code: null, cohort: null, bots: [] };
const PREVIEW: InvitePreview = { company_name: 'Пекарня «Колос»', expires_at: '2026-10-03T09:00:00.000Z', state: 'open' };
const inviteView = (props: { loggedIn: boolean; outcome?: InviteOutcome; message?: string; preview?: InvitePreview }) => createElement(InviteView, {
  token: TOKEN, preview: props.preview ?? PREVIEW, loggedIn: props.loggedIn, outcome: props.outcome ?? 'open', message: props.message ?? '', busy: false, onAccept: () => {} });

const main = (child: ReactElement) => (theme: Theme) => createElement(Fragment, null, createElement(SiteHeader, { theme }),
  createElement('main', { className: 'center container' }, child));
const PAGES: Record<string, (theme: Theme) => ReactElement> = {
  partner: main(createElement(PartnerScreen, { cabinet: CABINET, origin: ORIGIN })),
  'partner-empty': main(createElement(PartnerScreen, { cabinet: EMPTY, origin: ORIGIN })),
  'partner-debt': main(createElement(PartnerScreen, { cabinet: DEBT, origin: ORIGIN })),
  'not-partner': main(createElement(NotPartner)),
  studio: main(createElement(StudioScreen, { cabinet: STUDIO, origin: ORIGIN })),
  'studio-empty': main(createElement(StudioScreen, { cabinet: STUDIO_EMPTY, origin: ORIGIN })),
  'invite-anon': main(inviteView({ loggedIn: false })),
  'invite-user': main(inviteView({ loggedIn: true })),
  'invite-accepted': main(inviteView({ loggedIn: true, outcome: 'accepted' })),
  'invite-expired': main(inviteView({ loggedIn: true, preview: { ...PREVIEW, state: 'expired' } })),
  'invite-limit': main(inviteView({ loggedIn: true, outcome: 'plan_limit', message: 'Предел плана free: не больше 1 бота. Смените план на странице «Тарифы» и примите приглашение снова' })),
  register: main(createElement(AuthForm, { initialMode: 'register', next: `/invite/${TOKEN}` })),
};
const NAMES = Object.keys(PAGES);
const doc = (body: string, theme: Theme, script = '') => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Суфлёр — партнёрам</title>
<style>${CSS}</style></head><body>${body}${script}</body></html>`;

const ENTRY = `import { hydrateRoot } from 'react-dom/client'; import { createElement } from 'react';
import { PayoutDetailsForm } from './apps/web/src/app/dashboard/partner/PartnerScreen'; import { TransferForm } from './apps/web/src/app/dashboard/studio/StudioScreen';
import { InviteScreen } from './apps/web/src/app/invite/[token]/InviteScreen'; import { AuthForm } from './apps/web/src/app/login/AuthForm';
const C = { payout: PayoutDetailsForm, transfer: TransferForm, invite: InviteScreen, register: AuthForm };
const p = window.__PROPS; hydrateRoot(document.getElementById('root'), createElement(C[p.kind], p.props));`;
const LIVE: Record<string, { kind: string; props: object }> = {
  payout: { kind: 'payout', props: { current: null } },
  transfer: { kind: 'transfer', props: { bot: STUDIO.bots[0] } },
  invite: { kind: 'invite', props: { token: TOKEN, preview: PREVIEW, loggedIn: true } },
  register: { kind: 'register', props: { initialMode: 'register', next: `/invite/${TOKEN}` } },
};
let bundle = '';
type Api = { bodies: Record<string, unknown[]>; replies: Record<string, Array<{ status: number; body: unknown }>> };
let api: Api;
const reset = () => { api = { bodies: {}, replies: {} }; };
const reply = (route: string, status: number, body: unknown) => { (api.replies[route] ??= []).push({ status, body }); };

let server: Server;
let base: string;
beforeAll(async () => {
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  const built = buildSync({ stdin: { contents: ENTRY, resolveDir: path.resolve('.'), loader: 'tsx' }, bundle: true, format: 'iife', write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    alias: { 'next/navigation': path.resolve('tests/browser/next-navigation-shim.ts'), '@n6/rag/commission': path.resolve('packages/rag/src/commission.ts') } });
  bundle = built.outputFiles[0]!.text;
  reset();
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    void (async () => {
      const page = /^\/([a-z-]+)-(dark|light)\.html$/.exec(url.pathname);
      if (page && NAMES.includes(page[1]!)) { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(doc(renderToStaticMarkup(PAGES[page[1]!]!(page[2] as Theme)), page[2] as Theme)); }
      if (url.pathname === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle); }
      const live = /^\/live-([a-z]+)\.html$/.exec(url.pathname);
      if (live && LIVE[live[1]!]) {
        const spec = LIVE[live[1]!]!;
        const C = { payout: 'PayoutDetailsForm', transfer: 'TransferForm', invite: 'InviteScreen', register: 'AuthForm' }[spec.kind]!;
        const mod = C === 'PayoutDetailsForm' ? await import('../../apps/web/src/app/dashboard/partner/PartnerScreen') : C === 'TransferForm'
          ? await import('../../apps/web/src/app/dashboard/studio/StudioScreen') : C === 'InviteScreen' ? await import('../../apps/web/src/app/invite/[token]/InviteScreen')
          : await import('../../apps/web/src/app/login/AuthForm');
        const markup = renderToString(createElement((mod as unknown as Record<string, (p: object) => ReactElement>)[C]!, spec.props));
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.end(doc(`<main class="center container"><div id="root">${markup}</div></main>`, 'dark',
          `<script>window.__PROPS=${JSON.stringify({ kind: spec.kind, props: spec.props })}</script><script src="/bundle.js"></script>`));
      }
      if (req.method === 'POST') {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
        (api.bodies[url.pathname] ??= []).push(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
        const next = api.replies[url.pathname]?.shift() ?? { status: 503, body: { error: { code: 'unavailable', message: 'нет' } } };
        return json(next.status, next.body);
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
  async function live(name: string, run: (page: Page) => Promise<void>) {
    reset();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${base}/live-${name}.html`);
      await page.waitForFunction(() => document.getElementById('root')?.hasChildNodes());
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
  for (const width of [320, 768, 1440]) for (const name of ['partner', 'studio', 'invite-anon']) {
    it(`${name} ${width}: без горизонтального скролла, цели ≥ 44`, () => open(name, 'dark', { width, height: 900 }, async page => {
      expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
      if (width === 320) { mkdirSync(ARTIFACTS, { recursive: true }); await page.screenshot({ path: `${ARTIFACTS}/${engineName}-${name}-320.png`, fullPage: true }); }
    }));
  }
  it('AC-13: кабинет партнёра — код и ссылка, «к выплате» и «перенесено» с датой, замороженный код объяснён; плательщиков нет', () => open('partner', 'light', { width: 390, height: 844 }, async page => {
    const text = (await page.textContent('main')) ?? '';
    expect(text).toContain(`${ORIGIN}/r/studio-kolos`);
    expect(text).toMatch(/1\s200\s₽/);
    expect(text).toMatch(/к выплате 5\sоктября\s2026/);
    expect(text).toMatch(/250\s₽/);
    expect(text).toContain('Код приостановлен до проверки');
    expect(text).not.toContain(`${ORIGIN}/r/seed-net`);
    expect(text).toContain('+7 *** ***-00-00');
    expect(text).not.toMatch(/@example/);
  }));
  it('долг после возврата — долгом, а не нулём к выплате; пустой партнёр — «регистраций ещё не было», а не 0 %', async () => {
    await open('partner-debt', 'dark', { width: 390, height: 844 }, async page => {
      expect(await page.textContent('main')).toContain('зачтутся из будущих начислений');
      expect(await page.locator('ul[aria-label="Деньги"]').count()).toBe(0);
    });
    await open('partner-empty', 'dark', { width: 390, height: 844 }, async page => {
      const text = (await page.textContent('main')) ?? '';
      expect(text).toContain('Регистраций по вашим кодам ещё не было');
      expect(text).not.toContain('%)');
    });
  });
  it('AC-14: кабинет студии — переданный бот «только чтение» (числа, без текстов вопросов); без передач — «данных ещё нет»', async () => {
    await open('studio', 'dark', { width: 390, height: 844 }, async page => {
      const text = (await page.textContent('main')) ?? '';
      expect(text).toContain('Переданы клиентам · только чтение');
      expect(await page.getByRole('button', { name: 'Передать клиенту' }).count()).toBe(1);
      expect(text).toContain('17');
    });
    await open('studio-empty', 'dark', { width: 390, height: 844 }, async page => {
      const text = (await page.textContent('main')) ?? '';
      expect(text).toContain('Данных ещё нет');
      expect(text).toContain('на плане «Студия»');
      expect(await page.getByRole('button', { name: 'Передать клиенту' }).count()).toBe(0);
    });
  });
  it('SC-US-012-2: приглашение без входа — «Создать аккаунт и принять» и «войти» с next на это приглашение; состояния различимы', async () => {
    await open('invite-anon', 'dark', { width: 390, height: 844 }, async page => {
      expect(await page.getByRole('link', { name: 'Создать аккаунт и принять' }).getAttribute('href')).toBe(`/login?mode=register&next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
      expect(await page.getByRole('button', { name: 'Принять бота' }).count()).toBe(0);
    });
    const seen = new Set<string>();
    for (const name of ['invite-user', 'invite-accepted', 'invite-expired', 'invite-limit']) await open(name, 'dark', { width: 390, height: 844 }, async page => {
      seen.add(((await page.locator('section').last().textContent()) ?? '').slice(-60));
    });
    expect(seen.size).toBe(4);
  });
  it('AC-13 интерактив: номер карты — ошибка ПОД полем телефона (aria-invalid), телефон — «Реквизиты сохранены»', () => live('payout', async page => {
    reply('/api/partner/payout-details', 422, { error: { code: 'card_number_refused', message: 'Номер карты не принимаем: выплата идёт по СБП на телефон', field: 'phone' } });
    reply('/api/partner/payout-details', 200, { data: { saved: true } });
    await page.getByLabel('Телефон для СБП').fill('4111 1111 1111 1111');
    await page.getByRole('button', { name: 'Сохранить реквизиты' }).click();
    await expect.poll(() => page.locator('#payout-phone-error').textContent()).toContain('Номер карты не принимаем');
    expect(await page.getByLabel('Телефон для СБП').getAttribute('aria-invalid')).toBe('true');
    await page.getByLabel('Телефон для СБП').fill('+7 900 000-00-00');
    await page.getByRole('button', { name: 'Сохранить реквизиты' }).click();
    await expect.poll(() => page.textContent('main')).toContain('Реквизиты сохранены');
    expect(api.bodies['/api/partner/payout-details']).toEqual([{ method: 'sbp', phone: '4111 1111 1111 1111', bank: null }, { method: 'sbp', phone: '+7 900 000-00-00', bank: null }]);
  }));
  it('SC-US-012-1 интерактив: «Передать клиенту» → ссылка на 7 дней показана студии', () => live('transfer', async page => {
    reply(`/api/bots/${BOT}/invite`, 201, { data: { url: `${ORIGIN}/invite/${TOKEN}`, expires_at: '2026-10-03T09:00:00.000Z' } });
    await page.getByLabel('Почта клиента').fill('client@example.ru');
    await page.getByRole('button', { name: 'Передать клиенту' }).click();
    await expect.poll(() => page.textContent('main')).toContain(`${ORIGIN}/invite/${TOKEN}`);
    expect(api.bodies[`/api/bots/${BOT}/invite`]).toEqual([{ email: 'client@example.ru' }]);
  }));
  it('SC-US-012-2 интерактив: предел плана — отказ с «Тарифы»; повтор после смены плана — «Бот теперь ваш»', () => live('invite', async page => {
    reply(`/api/invites/${TOKEN}/accept`, 409, { error: { code: 'plan_limit', message: 'Предел плана free: не больше 1 бота.' } });
    await page.getByRole('button', { name: 'Принять бота' }).click();
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Предел плана free');
    expect(await page.getByRole('link', { name: 'Тарифы' }).count()).toBe(1);
  }));
  it('FR-PARTNER-001 интерактив: неверный код — ошибка ПОД полем, перехода нет; верный — переход на приглашение', () => live('register', async page => {
    reply('/api/auth/register', 422, { error: { code: 'invalid_partner_code', message: 'Код партнёра не найден или не действует. Проверьте код или оставьте поле пустым', field: 'partner_code' } });
    reply('/api/auth/register', 200, { data: { ok: true } });
    await page.getByLabel('Почта').fill('new@example.ru');
    await page.getByLabel('Пароль').fill('пароль-надёжный-1');
    await page.getByLabel('Код партнёра или студии (если есть)').fill('net-takogo');
    await page.getByRole('button', { name: 'Создать аккаунт' }).first().click();
    await expect.poll(() => page.locator('#auth-code-error').textContent()).toContain('Код партнёра не найден');
    expect(await page.evaluate(() => (window as Window & { __nav?: string[] }).__nav ?? [])).toEqual([]);
    await page.getByLabel('Код партнёра или студии (если есть)').fill('studio-kolos');
    await page.getByRole('button', { name: 'Создать аккаунт' }).first().click();
    await expect.poll(() => page.evaluate(() => (window as Window & { __nav?: string[] }).__nav ?? [])).toEqual([`/invite/${TOKEN}`]);
    expect(api.bodies['/api/auth/register']).toEqual([{ email: 'new@example.ru', password: 'пароль-надёжный-1', partner_code: 'net-takogo' },
      { email: 'new@example.ru', password: 'пароль-надёжный-1', partner_code: 'studio-kolos' }]);
  }));
});
