import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { domRules, axeRule, textZoomRule, firstScreenRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { chromium, webkit, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { firstScreenSelectors } from '../../scripts/responsive/rules.mjs';
import { Landing } from '../../apps/web/src/app/Landing';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
// Фича 28: НАСТОЯЩАЯ разметка лендинга (компонент Landing из page.tsx) с НАСТОЯЩИМ globals.css, в обеих темах.
const landing = (theme: 'dark' | 'light') => `<!doctype html><html lang="ru" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>КлипМейкер</title>
<style>${readFileSync('apps/web/src/app/globals.css', 'utf8')}</style></head><body>${renderToStaticMarkup(createElement(Landing, { theme }))}</body></html>`;
const LANDING_ARTIFACTS = 'tests/artifacts/landing-demo/browser';
let server: Server;
let base: string;
beforeAll(async () => {
  // Loud failure, never a skip: this suite only runs in the Playwright container.
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer(async (req, res) => {
    const name = (req.url ?? '').slice(1);
    const theme = /^landing-(dark|light)\.html$/.exec(name)?.[1] as 'dark' | 'light' | undefined;
    if (theme) { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(landing(theme)); return; }
    if (!/^[a-z0-9-]+\.html$/.test(name)) { res.writeHead(404).end(); return; }
    try { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(await readFile(resolve('tests/fixtures/responsive', name))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Нет loopback порта');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
for (const [name, engine] of Object.entries({ chromium, webkit })) describe(name, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function fixture(name: string, run: (page: Page) => Promise<void>, viewport?: { width: number; height: number }) {
    // Mobile emulation only for R9 (as in the tool's first-screen scenarios): in Chromium isMobile zooms out
    // pages without a viewport meta, which would hide the R1/R8 defects the other fixtures inject.
    const context = await browser.newContext(viewport ? { viewport, isMobile: true, hasTouch: true } : { viewport: { width: 390, height: 844 } });
    try { const page = await context.newPage(); await page.goto(`${base}/${name}.html`); await run(page); }
    finally { await context.close(); }
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    for (const state of ['below', 'above', 'missing']) it(`R9 ${state} ${viewport.width}`, () => fixture(`r9-${state}`, async page => {
      const found = await firstScreenRule(page, '.cta');
      if (state === 'above') expect(found).toEqual([]);
      else {
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ rule: 'R9', severity: 'error', scrollY: 0, innerHeight: viewport.height });
        if (state === 'missing') expect(found[0].message).toBe('действие не найдено');
        else expect(found[0].rect.bottom).toBeGreaterThan(viewport.height);
      }
      expect(await page.evaluate(() => scrollY)).toBe(0);
    }, viewport));
  }
  for (const fallback of [false, true]) it(`R9 visibility and first visible match (fallback=${fallback})`, () => fixture('r9-above', async page => {
    if (fallback) await page.evaluate(() => Object.defineProperty(Element.prototype, 'checkVisibility', { value: undefined, configurable: true }));
    await page.setContent('<div style="opacity:0"><button class="cta">Hidden</button></div><button class="cta" disabled>Visible</button>');
    expect(await firstScreenRule(page, '.cta')).toEqual([]);
    await page.locator('button').last().evaluate(el => { el.style.position = 'absolute'; el.style.top = '-50px'; });
    expect((await firstScreenRule(page, '.cta'))[0].rect.top).toBeLessThan(0);
    for (const style of ['display:none', 'visibility:hidden', 'opacity:0']) {
      await page.setContent(`<div style="${style}"><button class="cta">Hidden</button></div>`);
      expect((await firstScreenRule(page, '.cta'))[0].message).toBe('действие не найдено');
    }
  }));
  // Фича 27a clip-cta: настоящая страница /c/ (фикстуры сверяет с обработчиком tests/clip-cta.test.ts).
  // .cta — основное действие: кнопка призыва автора, если он задан, иначе «Сделать свои клипы».
  for (const [page_, expected] of [['c-cta-dark', 'Смотреть полный выпуск →'], ['c-cta-light', 'Смотреть полный выпуск →'], ['c-plain-dark', 'Сделать свои клипы']] as const) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 740 }]) {
      it(`R9 /c/ ${page_} ${viewport.width}x${viewport.height}: основное действие в первом экране`, () => fixture(page_, async page => {
        expect(await firstScreenRule(page, '.cta')).toEqual([]);
        expect(await page.locator('.cta').evaluateAll(els => els.map(el => el.textContent))).toEqual([expected]);
      }, viewport));
    }
    it(`/c/ ${page_}: R1/R2/R5 и контраст без отказов`, () => fixture(page_, async page => {
      expect((await domRules(page, ['R1', 'R2', 'R5'])).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
      expect((await axeRule(page)).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
    }));
  }
  // Фича 28 landing-demo: на телефоне в первом экране ОБА — демо-клип и «Попробовать бесплатно» (R9 на каждый селектор).
  for (const theme of ['dark', 'light'] as const) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 360, height: 740 }]) {
      it(`R9 / landing-${theme} ${viewport.width}x${viewport.height}: демо и действие в первом экране`, () => fixture(`landing-${theme}`, async page => {
        const selectors = firstScreenSelectors('/');
        expect(selectors).toEqual(['.landing-cta', '.landing-demo video']);
        // Все селекторы до утверждения: красное называет КАЖДЫЙ ушедший за сгиб элемент, а не первый.
        const findings: { selector: string; message: string }[] = [];
        for (const selector of selectors) findings.push(...await firstScreenRule(page, selector));
        const lost = findings.map(f => `${f.selector}: ${f.message}`);
        expect(lost, `R9 за сгибом: ${JSON.stringify(lost)}`).toEqual([]);
        const geometry = await page.evaluate(() => {
          const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; };
          return { h1: box('.landing h1'), video: box('.landing-demo video'), caption: box('.landing-demo figcaption'), cta: box('.landing-cta'), innerHeight };
        });
        // Постер 9:16 ЦЕЛИКОМ (решение фичи 28), а не половина.
        expect(geometry.video.bottom).toBeLessThanOrEqual(viewport.height);
        expect(Math.abs(geometry.video.height - geometry.video.width * 16 / 9)).toBeLessThanOrEqual(2); // округление до px
        mkdirSync(LANDING_ARTIFACTS, { recursive: true });
        const stem = `${LANDING_ARTIFACTS}/${name}-${theme}-first-screen-${viewport.width}x${viewport.height}`;
        writeFileSync(`${stem}.json`, JSON.stringify(geometry, null, 2) + '\n');
        await page.screenshot({ path: `${stem}.png`, fullPage: false });
      }, viewport));
    }
    it(`/ landing-${theme}: R1/R2/R5 и axe без отказов; видео с playsinline`, () => fixture(`landing-${theme}`, async page => {
      // R5 прибора первым: без playsinline красное даёт именно правило прибора, а не проверка атрибута ниже.
      expect((await domRules(page, ['R1', 'R2', 'R5'])).filter((f: { severity: string }) => f.severity === 'error')
        .map((f: { rule: string; message: string }) => `${f.rule}: ${f.message}`)).toEqual([]);
      expect(await page.locator('.landing-demo video').evaluate(el => el.hasAttribute('playsinline') && el.getAttribute('preload') === 'none' && el.hasAttribute('controls'))).toBe(true);
      expect((await axeRule(page)).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
      expect((await textZoomRule(page)).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
    }));
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
    it(`/ landing ${viewport.width}: без горизонтального скролла; на ≥ 600 кнопка скрыта, форма видна`, () => fixture('landing-dark', async page => {
      expect((await domRules(page, ['R1'])).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
      const cta = await page.locator('.landing-cta').isVisible(), form = await page.locator('form#auth').isVisible();
      expect({ cta, form }).toEqual({ cta: viewport.width < 600, form: true });
      mkdirSync(LANDING_ARTIFACTS, { recursive: true });
      await page.screenshot({ path: `${LANDING_ARTIFACTS}/${name}-dark-width-${viewport.width}.png`, fullPage: false });
    }, viewport));
  }
  it('чистая страница: все отказы отсутствуют', () => fixture('clean', async page => {
    expect([...await domRules(page), ...await axeRule(page), ...await textZoomRule(page)].filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
  }));
  for (const rule of ['R1', 'R2', 'R5']) it(`${rule}: внедрённый дефект`, () => fixture(rule.toLowerCase(), async page => {
    const found = await domRules(page, ['R1', 'R2', 'R5']);
    expect([...new Set(found.map((f: { rule: string }) => f.rule))]).toEqual([rule]);
  }));
  it('R4: контраст', () => fixture('r4', async page => {
    expect((await axeRule(page)).some((f: { axeRule: string; severity: string }) => f.axeRule === 'color-contrast' && f.severity === 'error')).toBe(true);
  }));
  it('R4 тёмная: серый текст на чёрном — отказ; исправленный цвет — чисто', async () => {
    const contrast = (found: { axeRule: string; severity: string }[]) => found.filter(f => f.axeRule === 'color-contrast' && f.severity === 'error');
    await fixture('r4-dark', async page => { expect(contrast(await axeRule(page)).length).toBeGreaterThan(0); });
    await fixture('dark-clean', async page => { expect(contrast(await axeRule(page))).toEqual([]); });
  });
  // The real tokens from globals.css in both themes: every text/background pair of the product passes axe (AA).
  for (const theme of ['dark', 'light']) it(`палитра globals.css (${theme}): контраст AA на всех парах токенов`, () => fixture('clean', async page => {
    const css = readFileSync('apps/web/src/app/globals.css', 'utf8');
    await page.setContent(`<!doctype html><html lang="ru" data-theme="${theme}"><head><style>${css}</style></head><body>
      <nav class="navigation"><a class="brand" href="/"><span>◧</span> КлипМейкер</a><a href="/">Мои записи</a><button type="button" class="theme-toggle secondary" aria-label="Светлая тема">☾</button></nav>
      <main class="container"><p class="eyebrow">ВАШИ МЫСЛИ</p><h1>Заголовок <em>акцент</em></h1><p class="intro">Вводный текст</p><p class="muted">Второстепенный</p>
      <section class="auth-card"><label>Почта <input value="a@b.c"></label><select><option>Трек</option></select><button>Войти</button><button class="secondary">Вторичная</button><button class="text-button">Ссылка</button><button class="danger">Удалить аккаунт</button></section>
      <section class="upload-panel"><div><h2>Загрузка</h2><p>Текст панели</p><p class="muted">Подсказка</p></div></section>
      <div class="video-list"><a class="video-row" href="/"><span class="video-thumbnail">▶</span><span class="video-summary"><p>Запись</p><p class="video-id">id</p></span><span class="badge running">Идёт</span></a>
      <a class="video-row" href="/"><span class="video-summary"><p>Запись</p></span><span class="badge success">Готово</span><span class="badge failure">Ошибка</span><span class="badge silent">Тишина</span></a></div>
      <div class="status-panel failure"><div><h2>Отказ</h2><p>Причина</p></div></div><div class="status-panel running"><div><h2>Идёт</h2><p>Шаг 2 из 7</p></div></div>
      <!-- Фича 29: лента стадий в каждом тоне панели — все виды стадий (сделано/идёт/нет ответа/отказ/впереди) под AA. -->
      <section class="status-panel failure"><h2>Обработка не завершена</h2><ol class="progress-ribbon"><li data-view="done"><span class="step-mark">✓</span><span class="step-label">Загрузка</span></li><li data-view="failed" aria-current="step"><span class="step-mark">!</span><span class="step-label">Монтаж</span><span class="step-detail">1 из 3</span></li><li data-view="pending"><span class="step-mark">○</span><span class="step-label">Выбор</span></li></ol><p>Причина</p></section>
      <section class="status-panel running"><h2>Выполняется</h2><ol class="progress-ribbon"><li data-view="done"><span class="step-mark">✓</span><span class="step-label">Загрузка</span></li><li data-view="running" aria-current="step"><span class="step-mark">!</span><span class="step-label">Монтаж</span><span class="step-detail">1 из 3</span></li><li data-view="pending"><span class="step-mark">○</span><span class="step-label">Выбор</span></li></ol><p>Режем</p></section>
      <section class="status-panel silent"><h2>Нет ответа от обработки</h2><ol class="progress-ribbon"><li data-view="done"><span class="step-mark">✓</span><span class="step-label">Загрузка</span></li><li data-view="silent" aria-current="step"><span class="step-mark">!</span><span class="step-label">Монтаж</span><span class="step-detail">1 из 3</span></li><li data-view="pending"><span class="step-mark">○</span><span class="step-label">Выбор</span></li></ol><p>Проверяем</p></section>
      <section class="status-panel success compact"><p><span class="step-mark">✓</span><strong>Клипы готовы</strong> · 3 из 3</p></section>
      <header class="detail-header"><div class="detail-top"><a href="/">← Все записи</a><details class="video-meta" open><summary>Подробнее</summary><p class="video-id">video_id: <code>x</code></p></details></div></header>
      <div class="clip-grid"><article class="clip-card"><div class="clip-preview"><p>Превью недоступно</p><span class="score-badge">87</span></div><div class="clip-body"><div class="clip-actions"><button>↓ Скачать</button><button class="secondary">Ссылка</button><button class="secondary">Гостю</button></div><p class="eyebrow">КЛИП 1</p><p class="score-line"><strong>Оценка 87 из 99</strong></p><p class="score-parts">Цепкость 29</p><details class="score-why" open><summary>Почему такая оценка</summary></details><p class="score"><strong>87</strong><span> из 99</span></p><dl class="score-details"><dt>Крючок</dt><dd>Объяснение</dd></dl><button>Скачать</button></div></article></div>
      <section class="cta-panel"><h2>Призыв в конце</h2><p class="muted">Главная кнопка на странице клипа</p><div class="cta-fields"><label for="k">Что сделать зрителю в конце</label><select id="k"><option>Смотреть полный выпуск</option></select><label for="u">Ссылка (https://…)</label><input id="u" type="url" value="https://www.youtube.com/watch?v=1"><small class="muted">Домен увидит зритель</small></div><button>Сохранить призыв</button></section>
      <p class="notice">Уведомление</p><p class="empty">Пусто</p><dl class="partner-counters"><div><dt>Переходы</dt><dd>12</dd></div></dl></main></body></html>`);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(theme === 'dark' ? 'rgb(14, 19, 17)' : 'rgb(247, 248, 243)');
    const found = (await axeRule(page)).filter((f: { axeRule: string; severity: string }) => f.axeRule === 'color-contrast' && f.severity === 'error');
    expect(found).toEqual([]);
  }));
  it('R4: теги сохраняются при явном target-size', () => fixture('r4-both', async page => {
    const ids = (await axeRule(page)).map((f: { axeRule: string }) => f.axeRule);
    expect(ids).toContain('color-contrast'); expect(ids).toContain('target-size');
  }));
  it('R8: rem растёт и переполняет только на 200%', () => fixture('r8-rem', async page => {
    expect(await domRules(page, ['R1'])).toEqual([]);
    const found = await textZoomRule(page);
    expect(found.map((f: { message: string }) => f.message)).toEqual(['Скролл при 200%']);
  }));
  it('R8: px не растёт', () => fixture('r8-px', async page => {
    expect((await textZoomRule(page)).some((f: { message: string }) => f.message === 'Текст не масштабируется')).toBe(true);
  }));
  it('карусель, checkbox+label, inline p/li и disabled — без ложных отказов', () => fixture('geometry', async page => {
    expect(await domRules(page, ['R1', 'R2'])).toEqual([]);
  }));
  it('R3: прокрутка перед hit-test', () => fixture('r3', async page => {
    expect(await domRules(page, ['R3'])).toEqual([]);
  }));
  for (const fallback of [false, true]) it(`details: закрытые цели исключены, открытые проверяются (fallback=${fallback})`, () => fixture('clean', async page => {
    await page.setContent(`
      <style>
        summary { width: 200px; height: 44px; }
        #content { position: relative; }
        #small { width: 20px; height: 20px; padding: 0; }
        #field { font-size: 14px; width: 150px; height: 44px; }
        #cover { position: absolute; inset: 0; z-index: 1; }
      </style>
      <details><summary><span>Настройки</span></summary><div id="content">
        <button id="small">X</button><input id="field" type="text"><div id="cover"></div>
      </div></details>`);
    if (fallback) await page.evaluate(() => Object.defineProperty(Element.prototype, 'checkVisibility', { value: undefined, configurable: true }));
    expect(await domRules(page, ['R2', 'R3', 'R5'])).toEqual([]);
    // The visible summary must remain an interactive target even when details is closed.
    await page.locator('summary').evaluate(el => { el.style.height = '20px'; });
    expect((await domRules(page, ['R2'])).map((f: { rule: string }) => f.rule)).toEqual(['R2']);
    await page.locator('summary').evaluate(el => { el.style.height = '44px'; });
    await page.locator('details').evaluate(el => { el.setAttribute('open', ''); });
    const found = await domRules(page, ['R2', 'R3', 'R5']);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R2' && f.selector === '#small')).toBe(true);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R3' && f.selector === '#small')).toBe(true);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R5' && f.selector === '#field')).toBe(true);
  }));
  it('tabindex=-1 исключён, tabindex=0 проверяется', () => fixture('clean', async page => {
    await page.setContent('<div id="target" tabindex="-1" style="width:44px;height:44px"></div><div style="position:absolute;inset:0"></div>');
    expect(await domRules(page, ['R3'])).toEqual([]);
    await page.locator('#target').evaluate(el => { el.setAttribute('tabindex', '0'); });
    expect((await domRules(page, ['R3'])).map((f: { rule: string }) => f.rule)).toEqual(['R3']);
  }));
  it('R6: высокое превью — предупреждение', () => fixture('r6', async page => {
    expect((await domRules(page, ['R6'])).map((f: { severity: string }) => f.severity)).toEqual(['warning']);
  }));
});
