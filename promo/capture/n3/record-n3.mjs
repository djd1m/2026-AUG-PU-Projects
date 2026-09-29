// Запись экранов N3 «Круг» для промо-ролика серии (promo/SERIES.md, promo/remotion/n3/SCENARIO.md).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Платных вызовов нет: стенд работает на синтетических данных, каждый новый контекст браузера получает
// чистый демо-seed (POST /api/demo). Кнопки «лаборатории» (fixture-контекст) не нажимаются и в кадр не
// прокручиваются; ссылки на /account (F2/F3) не открываются — страховка route-блокировкой.
//
// ЗАПЛАТКА ДОСТАВКИ (см. README.md, «Адрес стенда»). Выданный адрес n3-*.212.192.0.33.sslip.io на 29.09
// не отвечает (TLS alert internal error): машина сменила адрес, прокси обслуживает n3-*.194.85.249.105.sslip.io.
// Но API стенда (собран от f8055e3, пересборка запрещена) держит список origin, зашитый в код, — только
// старые адреса, и на новом отвечает 403 ORIGIN_DENIED «Источник запроса не разрешён». Чтобы снять
// НЕИЗМЕНЁННЫЙ продукт без пересборки, запросы страницы к /api/* выполняются через route.fetch с заголовком
// Origin выданного адреса (тот же сервер, тот же ответ). Продукт, стенд и данные не меняются.
import { chromium } from 'playwright';
import { startHiDpiRecording } from './hidpi-recorder.mjs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HOST = process.env.N3_HOST ?? '194.85.249.105.sslip.io';      // адрес, по которому стенд отвечает сейчас
const ISSUED_HOST = '212.192.0.33.sslip.io';                       // выданный адрес (docs/demos/index.md)
const OUT = process.env.OUT_DIR ?? '/assets';
const STEPS = new Set((process.env.STEPS ?? 'overview,rules,partner,registry').split(',').map((s) => s.trim()).filter(Boolean));
const LAYOUT_NAMES = (process.env.LAYOUTS ?? 'desktop,mobile').split(',').map((s) => s.trim()).filter(Boolean);
const url = (v) => `https://n3-${v}.${HOST}/`;

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), host: HOST, issued_host: ISSUED_HOST, steps: [...STEPS], layouts: LAYOUT_NAMES,
  events: [], paid: { calls: 0, note: 'у N3 платных вызовов нет' }, api: { demo_sessions: 0, commands: 0, non_2xx: [] },
  guards: [], files: [], failures: [] };
const t0 = Date.now();
let demoRefused = null;
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Видимый курсор для desktop: headless-запись не рисует системный указатель (как в record-n6.mjs).
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__promo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__promo_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;'
      + 'transition:transform .08s ease-out;background:no-repeat center/contain url("data:image/svg+xml;utf8,'
      + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>') + '")';
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'scale(.82)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

// Маска кадра: поле «ссылка вступления» на экране «Приглашение» показывает полный адрес стенда с голым IP.
// Размытие ставится ДО первого кадра страницы; содержимое поля и продукт не меняются.
const MASK_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__promo_mask')) return;
    const s = document.createElement('style');
    s.id = '__promo_mask';
    s.textContent = '#enrollment-link{filter:blur(9px)!important}';
    document.documentElement.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

async function newContext(browser, name, variant) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ...(L.isMobile ? {} : { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } }),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  await ctx.addInitScript(MASK_SCRIPT);
  // Страховка: рабочий кабинет (/account, F2/F3) и выгрузка CSV не открываются.
  await ctx.route((u) => u.pathname.startsWith('/account') || u.pathname.startsWith('/api/account'), (route) => { note('blocked', { path: new URL(route.request().url()).pathname }); return route.abort(); });
  // Заплатка доставки: Origin выданного адреса для запросов страницы к /api/* (см. шапку файла).
  await ctx.route((u) => u.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const headers = req.headers();
    if (!headers.origin) return route.continue();
    const response = await route.fetch({ headers: { ...headers, origin: `https://n3-${variant}.${ISSUED_HOST}` } });
    const p = new URL(req.url()).pathname;
    if (p === '/api/demo') log.api.demo_sessions += 1; else log.api.commands += 1;
    if (response.status() >= 300) {
      const body = await response.text().catch(() => '');
      const code = (body.match(/"code":"([A-Z_]+)"/) || [])[1] ?? null;
      log.api.non_2xx.push({ variant, path: p, status: response.status(), code });
      // Лимит демосеансов стенда (200 fixture-арендаторов, без очистки) — не повторять: каждый повтор бесполезен.
      if (code === 'DEMO_LIMIT' || code === 'RATE_LIMIT') { demoRefused = code; note('api.refused', { variant, path: p, code }); }
    }
    return route.fulfill({ response });
  });
  return { ctx, L, name, variant };
}

// Сторож кадра: голый IP в видимом тексте/полях и элементы «лаборатории» в пределах окна.
async function guard(page, c, tag) {
  const r = await page.evaluate(() => {
    const ip = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
    const inView = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; };
    const masked = (el) => { for (let e = el; e; e = e.parentElement) if ((getComputedStyle(e).filter || '').includes('blur')) return true; return false; };
    const ipHits = [];
    for (const el of document.querySelectorAll('input, textarea')) if (ip.test(el.value) && inView(el)) ipHits.push({ el: `${el.tagName}#${el.id}`, masked: masked(el) });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (ip.test(n.textContent) && n.parentElement && inView(n.parentElement)) ipHits.push({ el: n.parentElement.tagName, masked: masked(n.parentElement) });
    const lab = [];
    for (const el of document.querySelectorAll('button, h1, h2, h3, p, span, strong, div')) {
      if (el.children.length > 0 && el.tagName === 'DIV') continue;
      if (/лаборатор/i.test(el.textContent || '') && inView(el)) { const b = el.getBoundingClientRect(); lab.push({ el: el.tagName, text: el.textContent.trim().slice(0, 50), top: Math.round(b.top), bottom: Math.round(b.bottom) }); }
    }
    return { ipHits, lab };
  });
  const unmasked = r.ipHits.filter((h) => !h.masked);
  const entry = { layout: c.name, variant: c.variant, tag, t_s: +((Date.now() - t0) / 1000).toFixed(1), ip_unmasked: unmasked, ip_masked: r.ipHits.length - unmasked.length, lab_in_view: r.lab };
  log.guards.push(entry);
  if (unmasked.length) note('guard.ip_visible', { layout: c.name, tag, hits: unmasked });
}

// Страница с именованным видео (как в record-n6.mjs): saveAs запускается ДО close.
async function recorded(c, file, fn) {
  const page = await c.ctx.newPage();
  const target = path.join(OUT, file);
  const hidpi = c.L.isMobile ? await startHiDpiRecording(page, target, c.L.video) : null;
  const started = Date.now();
  const marks = [];
  const mark = (event) => { const m = { t_s: +((Date.now() - started) / 1000).toFixed(2), event }; marks.push(m); note('mark', { file, ...m }); };
  let ok = true;
  try { await fn(page, mark); }
  catch (error) { ok = false; log.failures.push({ file, error: String(error?.message ?? error).slice(0, 400) }); note('step.failed', { file, error: String(error?.message ?? error).slice(0, 200) }); }
  const recorder = hidpi ? await hidpi.stop() : null;
  const video = page.video();
  const saving = video ? video.saveAs(target) : null;
  await page.close();
  if (saving) {
    try { await saving; await video.delete(); }
    catch (error) { ok = false; log.failures.push({ file, error: `saveAs: ${String(error?.message ?? error).slice(0, 200)}` }); }
  }
  log.files.push({ file, ok, wall_s: +((Date.now() - started) / 1000).toFixed(1), marks, ...(recorder ? { recorder } : {}) });
  note('video.saved', { file, ok });
  return ok;
}

async function press(page, c, locator) {
  await locator.scrollIntoViewIfNeeded();
  if (c.L.isMobile) { await pause(); await locator.tap(); return; }
  const box = await locator.boundingBox();
  if (!box) throw new Error('элемент без размеров');
  await page.mouse.move(box.x + box.width * (0.35 + Math.random() * 0.3), box.y + box.height * (0.4 + Math.random() * 0.2), { steps: rnd(18, 30) });
  await pause();
  await locator.click();
}
async function hover(page, c, locator, ms = 900) {
  if (c.L.isMobile) { await sleep(ms); return; }
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: rnd(20, 30) });
  await sleep(ms);
}
async function typeHuman(page, text) {
  for (const ch of text) { await page.keyboard.type(ch); await sleep(ch === ' ' ? rnd(140, 240) : rnd(70, 150)); }
}
async function smoothScroll(page, targetY, duration) {
  await page.evaluate(({ targetY, duration }) => new Promise((resolve) => {
    // Граница кадра: блоки «лаборатории» в <main> не должны въехать в окно — цель прокрутки ограничивается сверху.
    const lab = [...document.querySelectorAll('main h2, main h3, main p, main span, main strong, main button')]
      .filter((e) => /лаборатор/i.test(e.textContent || '') && e.getBoundingClientRect().height > 0)
      .map((e) => e.getBoundingClientRect().top + window.scrollY);
    const limit = lab.length ? Math.min(...lab) - 48 - innerHeight : Infinity;
    const want = Math.min(targetY, limit);
    const startY = window.scrollY; const dy = Math.max(0, Math.min(want, document.documentElement.scrollHeight - innerHeight)) - startY; const s = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const k = Math.min(1, (now - s) / duration); window.scrollTo(0, startY + dy * ease(k)); if (k < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { targetY, duration });
}
// Плавно к элементу: selector либо текст заголовка/подписи (точное совпадение по началу).
async function scrollTo(page, target, duration, offset = 80) {
  const y = await page.evaluate(({ target, offset }) => {
    let el = null;
    if (target.startsWith('#') || target.startsWith('.')) el = document.querySelector(target);
    else el = [...document.querySelectorAll('h1,h2,h3,p,span,strong,label,legend')].find((e) => (e.textContent || '').trim().startsWith(target));
    return el ? el.getBoundingClientRect().top + window.scrollY - offset : null;
  }, { target, offset });
  if (y === null) throw new Error(`нет элемента «${target}»`);
  await smoothScroll(page, y, duration);
}
async function gotoReady(page, target) {
  await page.goto(target, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
  await page.evaluate(() => document.fonts?.ready);
  // Готовность: на mobile подпись «Демо работает с сервером» скрыта, поэтому ждём навигацию и отсутствие отказа.
  await page.locator('nav button').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => !/Не удалось открыть сеанс|Доступ к кабинету отклонён/.test(document.body.innerText), null, { timeout: 5_000 })
    .catch(() => { throw new Error('стенд не открыл демосеанс (см. api.non_2xx в журнале)'); });
  if (demoRefused) throw new Error(`стенд отказал в демосеансе: ${demoRefused}`);
}
const nav = (page, name) => page.locator('nav button').filter({ hasText: name }).first();
const TOP_BARS = { desktop: 78, mobile: 156 / 2 };   // зелёная полоса «Рабочий кабинет» + тёмная «Лаборатория Круг»

// ── Сцены 1/5 (фон): обзор владельца — программа работает, партнёры, последние оплаты ─────────────────────────
async function overview(c) {
  return recorded(c, `a-overview-${c.name}.webm`, async (page, mark) => {
    await gotoReady(page, url('a'));
    mark('loaded');
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.7, c.L.viewport.height * 0.5, { steps: 20 });
    await smoothScroll(page, TOP_BARS[c.name], 600);   // убрать служебные полосы там, где страница позволяет
    await guard(page, c, 'overview.hero');
    await sleep(1800);
    mark('scroll.partners');
    await scrollTo(page, 'Партнёры', 4200, c.L.isMobile ? 90 : 240);
    await guard(page, c, 'overview.partners');
    await sleep(1600);
    if (c.L.isMobile) { mark('scroll.payments'); await scrollTo(page, 'Последние оплаты', 2600, 90); await guard(page, c, 'overview.payments'); await sleep(1600); }
    mark('end');
  });
}

// ── Сцена 2: правила программы (25%) → приглашение партнёра ──────────────────────────────────────────────────
async function rules(c) {
  return recorded(c, `a-rules-${c.name}.webm`, async (page, mark) => {
    await gotoReady(page, url('a'));
    mark('loaded');
    await sleep(700);
    await press(page, c, nav(page, 'Правила'));
    await page.locator('#policy-rate').waitFor({ state: 'visible' });
    mark('rules.open');
    await smoothScroll(page, TOP_BARS[c.name], 500);
    await guard(page, c, 'rules.open');
    await sleep(900);
    if (c.L.isMobile) await scrollTo(page, '#policy-rate', 900, 260);
    await press(page, c, page.locator('#policy-rate'));
    await page.locator('#policy-rate').selectText().catch(() => {});
    await pause(300, 500);
    await typeHuman(page, '25');
    mark('rate.typed');
    await pause(600, 900);
    await press(page, c, page.locator('#policy-save'));
    await page.getByText(/Опубликована версия/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('rules.published');
    await guard(page, c, 'rules.published');
    await sleep(2200);
    if (c.L.isMobile) await smoothScroll(page, 0, 700);
    await press(page, c, nav(page, 'Приглашение'));
    await page.locator('#enrollment-link').waitFor({ state: 'visible' });
    mark('invite.open');
    await smoothScroll(page, TOP_BARS[c.name], 500);
    await guard(page, c, 'invite.open');
    await sleep(800);
    await hover(page, c, page.locator('#copy-enrollment'), 1000);
    if (c.L.isMobile) { await scrollTo(page, 'Что увидит партнёр', 1800, 120).catch(() => {}); }
    else await hover(page, c, page.getByText('Что увидит партнёр'), 1200);
    await guard(page, c, 'invite.end');
    await sleep(1400);
    mark('end');
  });
}

// ── Сцена 3: партнёр — условия → вступление → личная ссылка и промокод → начисления с оплат ──────────────────
async function partner(c) {
  return recorded(c, `c-partner-${c.name}.webm`, async (page, mark) => {
    await gotoReady(page, url('c'));
    mark('loaded');
    await smoothScroll(page, TOP_BARS[c.name], 500);
    await guard(page, c, 'terms.open');
    await sleep(1400);
    mark('scroll.consent');
    await scrollTo(page, '#enrollment-consent', 2400, c.L.isMobile ? 360 : 420);
    await sleep(500);
    await press(page, c, page.locator('#enrollment-consent'));
    if (!(await page.locator('#enrollment-consent').isChecked())) await page.locator('#enrollment-consent').check();
    await pause(500, 800);
    await press(page, c, page.getByRole('button', { name: 'Вступить и получить ссылку' }));
    await page.locator('#share-promo').waitFor({ state: 'visible', timeout: 20_000 });
    mark('joined.share_kit');
    await smoothScroll(page, TOP_BARS[c.name], 500);
    if (c.L.isMobile) await scrollTo(page, '#share-url', 900, 260).catch(() => {});
    await guard(page, c, 'share_kit');
    await hover(page, c, page.locator('#share-url'), 1000);
    await hover(page, c, page.locator('#share-promo'), 1500);
    mark('income.open');
    if (c.L.isMobile) await smoothScroll(page, 0, 700);
    await press(page, c, nav(page, 'Доход и выплаты'));
    await page.getByText('Комиссии и корректировки').first().waitFor({ state: 'visible', timeout: 20_000 });
    await smoothScroll(page, TOP_BARS[c.name], 500);
    await guard(page, c, 'income.open');
    await sleep(1200);
    mark('income.scroll');
    await scrollTo(page, 'Комиссии и корректировки', 2400, c.L.isMobile ? 40 : 160);
    await guard(page, c, 'income.rows');
    await sleep(1400);
    if (c.L.isMobile) { await smoothScroll(page, await page.evaluate(() => scrollY + 520), 2200); await guard(page, c, 'income.rows2'); await sleep(1400); }
    mark('end');
  });
}

// ── Сцена 4: реестр месяца → утверждение → отметка ручной отправки ─────────────────────────────────────────────
async function registry(c) {
  return recorded(c, `a-registry-${c.name}.webm`, async (page, mark) => {
    await gotoReady(page, url('a'));
    mark('loaded');
    await sleep(600);
    await press(page, c, nav(page, 'Реестр'));
    await page.locator('#registry-prepare').waitFor({ state: 'visible' });
    await smoothScroll(page, TOP_BARS[c.name], 500);
    mark('registry.open');
    await guard(page, c, 'registry.open');
    await sleep(900);
    await press(page, c, page.locator('#registry-prepare'));
    await page.getByText(/К переводу/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('registry.prepared');
    await guard(page, c, 'registry.prepared');
    await sleep(1800);
    await press(page, c, page.getByRole('button', { name: 'Утвердить эту версию' }));
    await page.getByText(/утверждена/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('registry.approved');
    await guard(page, c, 'registry.approved');
    await sleep(1600);
    mark('scroll.sent');
    await scrollTo(page, 'Отметить ручную отправку', 2400, c.L.isMobile ? 60 : 200);
    await sleep(500);
    await press(page, c, page.locator('#sent-partner'));
    await page.locator('#sent-partner').selectOption({ index: 1 });
    await pause(500, 800);
    await press(page, c, page.locator('#sent-evidence'));
    await typeHuman(page, 'платёжное поручение 03-09');
    await pause(400, 700);
    const date = page.locator('#sent-date');
    const type = await date.getAttribute('type');
    await press(page, c, date);
    if (type === 'date') await date.fill('2026-09-03'); else await typeHuman(page, '03.09.2026');
    note('sent_date', { type });
    await pause(500, 800);
    await press(page, c, page.locator('#registry-sent'));
    await page.getByText(/Отмечено оператором/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('sent.saved');
    await page.getByText(/Отмечено оператором/).first().scrollIntoViewIfNeeded();
    await guard(page, c, 'sent.saved');
    await sleep(2600);
    mark('end');
  });
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  const plan = [['overview', 'a', overview], ['rules', 'a', rules], ['partner', 'c', partner], ['registry', 'a', registry]];
  try {
    for (const [step, variant, fn] of plan) {
      if (!STEPS.has(step)) continue;
      for (const name of LAYOUT_NAMES) {
        if (demoRefused) { log.failures.push({ step, layout: name, error: `пропущено: стенд отказал в демосеансе (${demoRefused})` }); continue; }
        const c = await newContext(browser, name, variant); await fn(c); await c.ctx.close();
      }
    }
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    log.finished = new Date().toISOString();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    const ipVisible = log.guards.filter((g) => g.ip_unmasked.length).length;
    console.log(JSON.stringify({ paid: log.paid, api: log.api, files: log.files.map((f) => ({ file: f.file, ok: f.ok, wall_s: f.wall_s })), failures: log.failures, guard_ip_visible: ipVisible }, null, 2));
    if (log.failures.length || ipVisible) process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
