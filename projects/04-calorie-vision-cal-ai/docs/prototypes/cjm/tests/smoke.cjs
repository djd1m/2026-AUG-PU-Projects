'use strict';
/* Смоук-проверка прототипа CJM. Playwright берётся из соседнего окружения
   (у прототипа зависимостей нет). Запуск: node tests/smoke.cjs */

const { chromium } = require('/home/dz-projects-2026/genai-pulse-discovery/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = path.join(__dirname, 'shots');
const VARIANTS = ['A', 'B', 'C', 'D'];

function nowISO() { return new Date().toISOString(); }

async function collect(page) {
  const errs = [];
  page.on('console', function (m) { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', function (e) { errs.push('pageerror: ' + e.message); });
  return errs;
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errs = await collect(page);
  const results = [];

  await page.goto(URL, { waitUntil: 'load' });

  for (const v of VARIANTS) {
    await page.click('#tab-' + v);
    await page.waitForFunction(function (x) {
      return document.getElementById('tab-' + x).getAttribute('aria-selected') === 'true';
    }, v);

    for (let step = 1; step <= 6; step++) {
      const checks = [];
      await page.click('#rail button[data-step="' + step + '"]');
      await page.waitForFunction(function (s) {
        const b = document.querySelector('#rail button[aria-current="step"]');
        return b && b.dataset.step === String(s);
      }, step);

      checks.push({ name: 'шаг открыт', ok: (await page.$('#rail button[aria-current="step"]')) !== null });
      checks.push({ name: 'хэш соответствует шагу', ok: await page.evaluate(function () { return location.hash; }) === '#' + v + '/' + step });
      checks.push({ name: 'карта пути заполнена', ok: (await page.textContent('#map-body')).trim().length > 80 });
      checks.push({ name: 'экран телефона не пуст', ok: (await page.innerHTML('#screen')).length > 200 });

      if (step === 2) {
        checks.push({ name: 'кнопка съёмки есть', ok: (await page.$('[data-action="shutter"]')) !== null });
        await page.click('[data-action="shutter"]');
        await page.waitForFunction(function () { return location.hash.endsWith('/3'); });
        const moved = await page.evaluate(function () { return location.hash; });
        checks.push({ name: 'съёмка переводит на шаг 3', ok: moved === '#' + v + '/3' });
        await page.click('#rail button[data-step="2"]');
        await page.waitForFunction(function () { return location.hash.endsWith('/2'); });
      }

      if (step === 3) {
        checks.push({ name: 'чип источника числа', ok: (await page.$('[data-action="source"]')) !== null });
        checks.push({ name: 'share-CTA (FR-GROWTH-001)', ok: (await page.$('#share-cta')) !== null });
        const before = await page.textContent('#kcal-value');
        await page.click('[data-action="portion-inc"]');
        await page.waitForFunction(function (b) {
          const el = document.getElementById('kcal-value');
          return el && el.textContent !== b;
        }, before);
        const after = await page.textContent('#kcal-value');
        checks.push({ name: 'степпер пересчитывает ккал (' + before + ' → ' + after + ')', ok: before !== after });
        await page.click('[data-action="source"]');
        checks.push({ name: 'запись базы раскрывается', ok: (await page.$('.src-row')) !== null });
        await page.click('[data-action="conflict"]');
        checks.push({ name: 'экран расхождения', ok: (await page.$('.conflict')) !== null });
        await page.click('[data-action="portion-dec"]');
      }

      await page.evaluate(function () { window.scrollTo(0, 0); });
      await page.screenshot({
        path: path.join(SHOTS, v + '-step' + step + '-desktop.png'),
        fullPage: true
      });

      results.push({ url: URL + '#' + v + '/' + step, variant: v, step: step, checks: checks, consoleErrors: errs.slice(), at: nowISO() });
    }
  }

  /* панели: оверлей фиксированный, fullPage его не удлиняет — временно выше вьюпорт */
  const panel = [];
  await page.setViewportSize({ width: 1440, height: 1560 });
  await page.click('[data-action="open-compare"]');
  panel.push({ name: 'панель «Сравнить» открылась', ok: await page.isVisible('#sheet-compare') });
  panel.push({ name: 'таблица 4 вариантов заполнена', ok: (await page.$$('#cmp-table tbody tr')).length >= 7 });
  await page.click('#cmp-table [data-action="choose"][data-variant="C"]');
  const dtext = await page.inputValue('#decision-text');
  panel.push({ name: 'текст решения готовится', ok: dtext.indexOf('Выбираю вариант C') === 0 });
  await page.screenshot({ path: path.join(SHOTS, 'panel-compare-desktop.png') });
  await page.click('#sheet-compare [data-action="close"]');
  panel.push({ name: 'панель «Сравнить» закрылась', ok: !(await page.isVisible('#sheet-compare')) });

  await page.click('[data-action="open-builder"]');
  panel.push({ name: 'панель «Собрать свой» открылась', ok: await page.isVisible('#sheet-builder') });
  panel.push({ name: 'шесть выпадающих выборов', ok: (await page.$$('#mix-grid select')).length === 6 });
  await page.selectOption('#mix-6', 'A');
  await page.selectOption('#mix-1', 'B');
  const mtext = await page.inputValue('#mix-text');
  panel.push({
    name: 'гибрид попадает в текст решения',
    ok: mtext.indexOf('Выбираю гибрид') === 0 && mtext.indexOf('шаг 6') !== -1 &&
        mtext.indexOf('из A') !== -1 && mtext.indexOf('шаг 1') !== -1 && mtext.indexOf('из B') !== -1
  });
  await page.screenshot({ path: path.join(SHOTS, 'panel-builder-desktop.png') });
  await page.click('#sheet-builder [data-action="close"]');
  panel.push({ name: 'панель «Собрать свой» закрылась', ok: !(await page.isVisible('#sheet-builder')) });

  await page.setViewportSize({ width: 1440, height: 1000 });
  results.push({ url: URL, variant: '—', step: 0, checks: panel, consoleErrors: errs.slice(), at: nowISO() });

  await ctx.close();
  return { results: results, errs: errs };
}

async function mobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = await collect(page);
  const results = [];

  for (const v of VARIANTS) {
    await page.goto(URL + '#' + v + '/3', { waitUntil: 'load' });
    await page.waitForSelector('#share-cta');
    const checks = [];
    const noScroll = await page.evaluate(function () {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    checks.push({ name: 'нет горизонтального скролла на 390px', ok: noScroll });
    checks.push({ name: 'share-CTA виден', ok: await page.isVisible('#share-cta') });
    checks.push({ name: 'чип источника виден', ok: await page.isVisible('[data-action="source"]') });
    await page.screenshot({ path: path.join(SHOTS, v + '-mobile.png'), fullPage: true });
    results.push({ url: URL + '#' + v + '/3', variant: v, step: 3, checks: checks, consoleErrors: errs.slice(), at: nowISO() });
  }

  /* точки входа variant-*.html должны довести до нужного варианта */
  for (const v of VARIANTS) {
    const file = 'file://' + path.join(ROOT, 'variant-' + v.toLowerCase() + '.html');
    await page.goto(file, { waitUntil: 'load' });
    await page.waitForFunction(function (x) { return location.hash === '#' + x + '/1'; }, v, { timeout: 5000 });
    const ok = (await page.evaluate(function () { return location.pathname; })).endsWith('index.html');
    results.push({
      url: file, variant: v, step: 1, at: nowISO(), consoleErrors: errs.slice(),
      checks: [{ name: 'точка входа variant-' + v.toLowerCase() + '.html ведёт в прототип', ok: ok }]
    });
  }

  await ctx.close();
  return { results: results, errs: errs };
}

(async function () {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const d = await desktop(browser);
  const m = await mobile(browser);
  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'desktop-results.json'), JSON.stringify(d.results, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'mobile-results.json'), JSON.stringify(m.results, null, 2) + '\n');

  const all = d.results.concat(m.results);
  let ok = 0, total = 0, failed = [];
  all.forEach(function (r) {
    r.checks.forEach(function (c) {
      total++;
      if (c.ok) ok++; else failed.push(r.variant + '/' + r.step + ': ' + c.name);
    });
  });
  const errs = d.errs.concat(m.errs);
  console.log('проверок: ' + ok + '/' + total);
  console.log('console errors: ' + errs.length);
  errs.forEach(function (e) { console.log('  ' + e); });
  failed.forEach(function (f) { console.log('  ПРОВАЛ ' + f); });
  process.exit(ok === total && errs.length === 0 ? 0 : 1);
})();
