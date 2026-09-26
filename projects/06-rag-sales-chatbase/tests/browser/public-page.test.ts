// Демо-страница /b/{slug} (фича public-page-and-summary; FR-GROWTH-005, SC-US-013-1/2/3) в НАСТОЯЩИХ Chromium, Firefox и
// WebKit: разметка PublicPageView с globals.css и НАСТОЯЩИЙ бандл виджета с data-open на «нашем» origin оснастки
// (tests/browser/widget-harness.ts), настоящие обработчики /w/v1/* и ядро ответа с фейковой моделью.
// Проверяется: окно чата открыто сразу и фокус не украден; вопрос → ответ с источником; бейдж и «Сделать такого же»
// ведут на /?from=b/{slug}; без публикации виджет на своём origin не появляется; noindex; раскладка 320–1440 без
// горизонтального скролла (R1/R2/R5), axe (контраст AA) в обеих темах. Запуск: scripts/check-responsive.sh --test tests/browser/public-page.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import { domRules, axeRule } from '../../scripts/responsive/rules.mjs';
import { ANSWER, PUBLIC_SLUG, WIDGET, startHarness, type Harness } from './widget-harness';

const ARTIFACTS = 'tests/artifacts/public-page-and-summary/browser';
mkdirSync(ARTIFACTS, { recursive: true });
let harness: Harness;
beforeAll(async () => { harness = await startHarness(); });
afterAll(async () => { await harness?.close(); });

const errors = (found: { severity: string; rule: string; axeRule?: string; selector: string; message: string }[]) =>
  found.filter((f) => f.severity === 'error').map((f) => `${f.rule}${f.axeRule ? '/' + f.axeRule : ''} ${f.selector}: ${f.message}`);
const panelOpen = (page: Page) => page.waitForFunction(() => document.querySelector('n6-sufler')?.shadowRoot?.querySelector('.panel:not([hidden])') !== null
  && document.querySelector('n6-sufler')?.shadowRoot?.querySelector('.panel:not([hidden])') !== undefined, null, { timeout: 10000 });

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) describe(engineName, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function open(path: string, viewport: { width: number; height: number }, run: (page: Page, problems: string[]) => Promise<void>) {
    const context = await browser.newContext({ viewport });
    const problems: string[] = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      harness.log.length = 0;
      harness.resetQuota();
      await page.goto(`${WIDGET}${path}`);
      await run(page, problems);
    } finally { await context.close(); }
  }

  it('SC-US-013-1: без входа — имя компании, окно чата открыто сразу без кражи фокуса; вопрос → ответ с источником; ссылки ведут на /?from=b/{slug}', () =>
    open(`/b/${PUBLIC_SLUG}`, { width: 390, height: 844 }, async (page, problems) => {
      expect(await page.locator('h1').textContent()).toBe('Пекарня «Колос»');
      await panelOpen(page);
      expect(await page.evaluate(() => document.querySelector('n6-sufler')!.shadowRoot!.activeElement)).toBeNull();
      expect(harness.log.filter((l) => l.path === '/w/v1/config').map((l) => [l.origin === null ? 'same-origin' : l.origin, l.status])).toEqual([['same-origin', 200]]);
      await page.locator('n6-sufler .input').fill('Сколько стоит доставка?');
      await page.locator('n6-sufler .send').click();
      await expect.poll(() => page.locator('n6-sufler .msg.bot').count(), { timeout: 10000 }).toBe(2);
      const last = page.locator('n6-sufler .msg.bot >> nth=1');
      expect(await last.textContent()).toContain(ANSWER);
      expect(await last.locator('a').getAttribute('href')).toBe('https://kolos.example/ceny');
      expect(await page.locator('n6-sufler .n6-badge').getAttribute('href')).toBe(`${WIDGET}/?from=b%2F${PUBLIC_SLUG}&utm_source=badge`);
      expect(await page.getByRole('link', { name: 'Сделать такого же' }).getAttribute('href')).toBe(`/?from=b/${PUBLIC_SLUG}`);
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');
      expect(problems).toEqual([]);
    }));

  it('SC-US-013-3 (второй рубеж): бот без публикации — config 403, на своём origin виджет не появляется', () =>
    open('/b/unpublished-kolos', { width: 390, height: 844 }, async (page) => {
      await expect.poll(() => harness.log.filter((l) => l.path === '/w/v1/config').length, { timeout: 10000 }).toBe(1);
      expect(harness.log.find((l) => l.path === '/w/v1/config')).toMatchObject({ status: 403, acao: [] });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.querySelectorAll('n6-sufler').length)).toBe(0);
      expect(await page.locator('h1').textContent()).toBe('Пекарня «Колос»');   // текст страницы читается и без чата
    }));

  if (engineName !== 'firefox') {
    for (const theme of ['dark', 'light'] as const) {
      it(`${theme} 390: R1/R2/R5 и axe (контраст AA) страницы с открытым чатом`, () =>
        open(`/b/${PUBLIC_SLUG}?theme=${theme}`, { width: 390, height: 844 }, async (page) => {
          await panelOpen(page);
          expect(errors(await domRules(page, ['R1', 'R2', 'R5']))).toEqual([]);
          expect(errors(await axeRule(page))).toEqual([]);
        }));
    }
    for (const width of [320, 360, 768, 1024, 1440]) {
      it(`${width}: без горизонтального скролла, цели ≥ 44; окно чата в первом экране`, () =>
        open(`/b/${PUBLIC_SLUG}`, { width, height: width === 1440 ? 900 : 844 }, async (page) => {
          await panelOpen(page);
          expect(errors(await domRules(page, ['R1', 'R2']))).toEqual([]);
          const box = await page.evaluate(() => { const r = document.querySelector('n6-sufler')!.shadowRoot!.querySelector('.panel')!.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, h: innerHeight }; });
          expect(box.top).toBeGreaterThanOrEqual(0);
          expect(box.top).toBeLessThan(box.h);
          if (width === 360 || width === 1440) await page.screenshot({ path: `${ARTIFACTS}/${engineName}-width-${width}.png`, fullPage: true });
        }));
    }
  }
});
