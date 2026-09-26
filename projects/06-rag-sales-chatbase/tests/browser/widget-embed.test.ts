// Виджет на ЧУЖОЙ странице — три класса отказа embeddable-widget.md в НАСТОЯЩИХ Chromium, Firefox и WebKit:
//   перекрёстный-запрос   config/event/ask с origin хозяина 127.0.0.1:8099 → ровно его ACAO; чужой 8098 — 403, виджета нет;
//   протечка-стилей       враждебный CSS хозяина не сдвигает пузырь 56 px / 16 px и не раздувает окно; наш CSS не
//                         трогает страницу хозяина; в документ хозяина не добавлено ни одного <style>/<link>;
//   политика-безопасности CSP хозяина = ровно опубликованные директивы (без unsafe-inline) — ноль нарушений.
// И то, что проверяется только браузером: тесты донора N1 badge-integrity / isolation / xss (у донора — jsdom с
// пометками [GAP] «нужен настоящий браузер на втором origin»), бейдж решает сервер, Esc и фокус, окно на весь экран
// на ≤ 400 px, тема хозяина. Оснастка — tests/browser/widget-harness.ts. Запуск: scripts/check-responsive.sh --test tests/browser/widget-embed.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { CONTACT, HOST, KEY_FREE, KEY_PAID, STRANGER, WIDGET, startHarness, type Harness } from './widget-harness';

const ARTIFACTS = 'tests/artifacts/widget-runtime-and-badge/browser';
mkdirSync(ARTIFACTS, { recursive: true });
let harness: Harness;
beforeAll(async () => { harness = await startHarness(); });
afterAll(async () => { await harness?.close(); });

// Внутренности теневого корня читаются через открытый shadowRoot — так же, как их может читать скрипт хозяина.
const inShadow = <T>(page: Page, fn: (root: ShadowRoot) => T) => page.evaluate(fn as never) as Promise<T>;

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) describe(engineName, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });

  async function open(path: string, run: (page: Page, context: BrowserContext, problems: string[]) => Promise<void>, viewport = { width: 1280, height: 800 }) {
    const context = await browser.newContext({ viewport });
    const problems: string[] = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
      harness.log.length = 0;
      harness.events.length = 0;
      await page.goto(path);
      await run(page, context, problems);
    } finally { await context.close(); }
  }
  const waitWidget = (page: Page) => page.waitForFunction(() => Boolean(document.querySelector('n6-sufler')?.shadowRoot?.querySelector('.bubble')), null, { timeout: 10000 });
  const cspLog = (page: Page) => page.evaluate(() => document.getElementById('csp-log')!.textContent ?? '');
  const openPanel = async (page: Page) => {
    await page.locator('n6-sufler .bubble').click();
    await page.waitForFunction(() => document.querySelector('n6-sufler')!.shadowRoot!.querySelector('.panel:not([hidden])') !== null);
  };

  it('перекрёстный-запрос + политика-безопасности: на 8099 виджет загружен под строгим CSP, ACAO = ровно origin хозяина, 0 нарушений', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}`, async (page, _c, problems) => {
      await waitWidget(page);
      const configs = harness.log.filter((l) => l.path === '/w/v1/config');
      expect(configs.map((l) => [l.origin, l.status, l.acao])).toEqual([[HOST, 200, [HOST]]]);
      await openPanel(page);
      await page.waitForFunction(() => document.getElementById('csp-log') !== null);
      await expect.poll(() => harness.log.filter((l) => l.path === '/w/v1/event' && l.method === 'POST').map((l) => [l.origin, l.status, l.acao])).toEqual([[HOST, 204, [HOST]]]);
      expect(harness.log.filter((l) => l.acao.some((a) => a !== HOST))).toEqual([]);
      expect(await cspLog(page)).toBe('');
      expect(problems).toEqual([]);
    }));

  it('перекрёстный-запрос: страница ВНЕ списка бота (8098) — config 403 без ACAO, в документе хозяина ничего не появилось', () =>
    open(`${STRANGER}/host.html?bot=${KEY_FREE}`, async (page) => {
      await expect.poll(() => harness.log.filter((l) => l.path === '/w/v1/config').length).toBe(1);
      expect(harness.log.find((l) => l.path === '/w/v1/config')).toMatchObject({ origin: STRANGER, status: 403, acao: [] });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.querySelectorAll('n6-sufler').length)).toBe(0);
    }));

  it('протечка-стилей: пузырь 56 px в 16 px от угла вопреки враждебному CSS; окно 360 px, шрифт свой; хозяин не задет', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}`, async (page) => {
      const before = await page.evaluate(() => ({ styles: document.querySelectorAll('style, link').length, h1: getComputedStyle(document.getElementById('host-marker')!).fontSize,
        cta: getComputedStyle(document.getElementById('host-cta')!).backgroundColor }));
      await waitWidget(page);
      const bubble = (await page.locator('n6-sufler .bubble').boundingBox())!;
      expect([Math.round(bubble.width), Math.round(bubble.height)]).toEqual([56, 56]);
      expect(Math.round(1280 - (bubble.x + bubble.width))).toBe(16);
      expect(Math.round(800 - (bubble.y + bubble.height))).toBe(16);
      await openPanel(page);
      const panel = await inShadow(page, () => {
        const r = document.querySelector('n6-sufler')!.shadowRoot!;
        const p = r.querySelector<HTMLElement>('.panel')!.getBoundingClientRect(), input = r.querySelector<HTMLElement>('.input')!;
        return { width: Math.round(p.width), input: getComputedStyle(input).fontSize, msg: getComputedStyle(r.querySelector('.msg')!).fontSize,
          badge: getComputedStyle(r.querySelector('.n6-badge')!).color };
      });
      expect(panel).toMatchObject({ width: 360, input: '16px', msg: '15px' });
      expect(panel.badge).not.toBe('rgb(0, 255, 0)');
      const after = await page.evaluate(() => ({ styles: document.querySelectorAll('style, link').length, h1: getComputedStyle(document.getElementById('host-marker')!).fontSize,
        cta: getComputedStyle(document.getElementById('host-cta')!).backgroundColor }));
      expect(after).toEqual(before);
      await page.screenshot({ path: `${ARTIFACTS}/${engineName}-hostile-open.png` });
    }));

  it('бейдж на free: виден, ведёт на лендинг с from=домен хозяина; удаление, display:none и чужой лист стилей в корне — восстанавливаются (N1 badge-integrity)', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}`, async (page, _c, problems) => {
      await waitWidget(page);
      expect(await inShadow(page, () => document.querySelector('n6-sufler')!.shadowRoot!.querySelector('.panel'))).toBeNull();   // окно — лениво, по клику
      await openPanel(page);
      const badge = page.locator('n6-sufler .n6-badge');
      await expect.poll(() => badge.textContent()).toBe('Работает на Суфлёре');
      expect(await badge.getAttribute('href')).toBe(`${WIDGET}/?from=127.0.0.1&utm_source=badge`);
      // (1) скрипт хозяина удаляет узел бейджа
      await page.evaluate(() => document.querySelector('n6-sufler')!.shadowRoot!.querySelector('.n6-badge')!.remove());
      await expect.poll(() => badge.isVisible(), { timeout: 4000 }).toBe(true);
      expect(await badge.getAttribute('href')).toBe(`${WIDGET}/?from=127.0.0.1&utm_source=badge`);
      // (2) прямой display:none через CSSOM
      await page.evaluate(() => { (document.querySelector('n6-sufler')!.shadowRoot!.querySelector('.n6-badge') as HTMLElement).style.display = 'none'; });
      await expect.poll(() => badge.isVisible(), { timeout: 4000 }).toBe(true);
      // (3) лист стилей хозяина в НАШЕМ корне (корень открыт)
      await page.evaluate(() => {
        const r = document.querySelector('n6-sufler')!.shadowRoot!; const sheet = new CSSStyleSheet(); sheet.replaceSync('.n6-badge{display:none !important}');
        r.adoptedStyleSheets = [...r.adoptedStyleSheets, sheet];
      });
      await expect.poll(() => badge.isVisible(), { timeout: 4000 }).toBe(true);
      // Граница изоляции донора (isolation.test): document.querySelector не пересекает теневой корень.
      expect(await page.evaluate(() => document.querySelector('.n6-badge'))).toBeNull();
      expect(await cspLog(page)).toBe('');
      expect(problems).toEqual([]);
    }));

  it('бейдж на nobadge: сервер сказал false — бейджа нет и показ не отправлен', () =>
    open(`${HOST}/host.html?bot=${KEY_PAID}`, async (page) => {
      await waitWidget(page);
      await openPanel(page);
      await page.waitForTimeout(300);
      expect(await page.locator('n6-sufler .n6-badge').count()).toBe(0);
      expect(harness.events).toEqual([]);
    }));

  it('ответ рендерится ТЕКСТОМ (N1 xss): разметка модели не исполняется, javascript: ссылка отброшена, https — ссылка', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}`, async (page, _c, problems) => {
      await waitWidget(page);
      await openPanel(page);
      const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
      harness.askReply = { status: 200, body: { data: { status: 'answered', text: evil, source: { title: '<b>Цены</b>', url: 'javascript:alert(1)', excerpt: evil } } } };
      await page.locator('n6-sufler .input').fill('Сколько стоит доставка?');
      await page.locator('n6-sufler .send').click();
      await expect.poll(() => page.locator('n6-sufler .msg.bot').count()).toBe(2);
      const out = await inShadow(page, () => {
        const r = document.querySelector('n6-sufler')!.shadowRoot!; const last = r.querySelectorAll('.msg.bot')[1]!;
        return { imgs: r.querySelectorAll('img, script').length, links: last.querySelectorAll('a').length, summary: last.querySelector('summary')!.textContent,
          text: last.firstChild!.textContent, xss: (window as unknown as { __xss?: number }).__xss ?? null };
      });
      expect(out).toEqual({ imgs: 0, links: 0, summary: 'Источник: <b>Цены</b> ↗', text: evil, xss: null });
      harness.askReply = { status: 200, body: { data: { status: 'answered', text: 'Доставка от 350 ₽.', source: { title: 'Цены', url: 'https://kolos.example/ceny', excerpt: 'Доставка от 350 ₽' } } } };
      await page.locator('n6-sufler .input').fill('А самовывоз?');
      await page.locator('n6-sufler .send').click();
      await expect.poll(() => page.locator('n6-sufler .msg.bot').count()).toBe(3);
      expect(await page.locator('n6-sufler .msg.bot >> nth=2').locator('a').getAttribute('href')).toBe('https://kolos.example/ceny');
      harness.askReply = { status: 429, body: { error: { code: 'limit', message: `Лимит вопросов на сегодня исчерпан. Напишите: ${CONTACT}` } } };
      await page.locator('n6-sufler .input').fill('Ещё вопрос');
      await page.locator('n6-sufler .send').click();
      await expect.poll(() => page.locator('n6-sufler .msg.bot >> nth=3').textContent()).toContain(CONTACT);
      expect(await cspLog(page)).toBe('');
      // 429 — ожидаемый ответ заглушки выше; браузер пишет его в консоль как «Failed to load resource».
      expect(problems.filter((p) => !/status of 429/.test(p))).toEqual([]);
    }));

  it('доступность: диалог, aria-live, Esc закрывает и возвращает фокус пузырю, цели ≥ 44, предупреждение о данных; axe без серьёзных нарушений', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}`, async (page) => {
      await waitWidget(page);
      const bubble = page.locator('n6-sufler .bubble');
      expect(await bubble.getAttribute('aria-expanded')).toBe('false');
      await openPanel(page);
      expect(await bubble.getAttribute('aria-expanded')).toBe('true');
      const a11y = await inShadow(page, () => {
        const r = document.querySelector('n6-sufler')!.shadowRoot!;
        const size = (s: string) => { const b = r.querySelector(s)!.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
        return { role: r.querySelector('.panel')!.getAttribute('role'), live: r.querySelector('.log')!.getAttribute('aria-live'), close: size('.icon-btn'),
          send: size('.send'), input: size('.input')[1], warn: r.querySelector('.warn')!.textContent, focused: r.activeElement?.className };
      });
      expect(a11y).toMatchObject({ role: 'dialog', live: 'polite', close: [44, 44], warn: 'Не сообщайте паспортные и платёжные данные.', focused: 'input' });
      expect(a11y.send[1]).toBeGreaterThanOrEqual(44);
      expect(a11y.input).toBeGreaterThanOrEqual(44);
      const axe = await new AxeBuilder({ page: page as never }).include('n6-sufler').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      await page.keyboard.press('Escape');
      expect(await inShadow(page, () => document.querySelector('n6-sufler')!.shadowRoot!.querySelector<HTMLElement>('.panel')!.hidden)).toBe(true);
      expect(await bubble.getAttribute('aria-expanded')).toBe('false');
      expect(await inShadow(page, () => document.querySelector('n6-sufler')!.shadowRoot!.activeElement?.className)).toBe('bubble');
    }));

  it('≤ 400 px: окно на весь экран; тема хозяина data-theme="dark" — тёмная палитра', () =>
    open(`${HOST}/host.html?bot=${KEY_FREE}&theme=dark`, async (page) => {
      await waitWidget(page);
      await openPanel(page);
      const box = await inShadow(page, () => {
        const r = document.querySelector('n6-sufler')!.shadowRoot!; const p = r.querySelector<HTMLElement>('.panel')!; const b = p.getBoundingClientRect();
        return { rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], bg: getComputedStyle(p).backgroundColor };
      });
      expect(box.rect).toEqual([0, 0, 375, 667]);
      expect(box.bg).toBe('rgb(21, 25, 29)');
      await page.screenshot({ path: `${ARTIFACTS}/${engineName}-mobile-dark.png` });
    }, { width: 375, height: 667 }));
});
