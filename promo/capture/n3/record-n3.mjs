// Запись экранов N3 «Круг», вариант A «кабинет владельца» (решение владельца 29.09: ролик только по A).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Адрес — ВЫДАННЫЙ выкладкой ADR-003 (29.09 ~18:55 UTC, образы bridge-901f0a6): https://reward.aicoding.space/.
// Прежняя заплатка Origin (route.fetch) удалена: API этого релиза сам держит домен в списке origin.
//
// ОДИН демосеанс на раскладку: каждое открытие интерфейса создаёт fixture-арендатора (POST /api/demo), а их на стенде
// не больше 200 без очистки (shared/application/index.mjs, maxDemoRuns). Поэтому весь маршрут — обзор → правила →
// приглашение → реестр — одна страница и один файл записи на раскладку; при DEMO_LIMIT/RATE_LIMIT скрипт
// останавливается и не повторяет запрос.
//
// Платных вызовов нет. Кнопки «лаборатории» (fixture) не нажимаются и в кадр не прокручиваются; /account (F2/F3) и
// выгрузка CSV заблокированы маршрутом; «Тариф» не открывается.
import { chromium } from 'playwright';
import { startHiDpiRecording } from '../hidpi-recorder.mjs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STAND = process.env.N3_URL ?? 'https://reward.aicoding.space/';
const OUT = process.env.OUT_DIR ?? '/assets';
const LAYOUT_NAMES = (process.env.LAYOUTS ?? 'desktop,mobile').split(',').map((s) => s.trim()).filter(Boolean);
const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, video: { width: 780, height: 1688 } },
};
const TOP_BARS = { desktop: 78, mobile: 78 };   // CSS px: зелёная «Рабочий кабинет» + тёмная «Лаборатория Круг»

const log = { started: new Date().toISOString(), stand: STAND, layouts: LAYOUT_NAMES, events: [],
  paid: { calls: 0, note: 'у N3 платных вызовов нет' }, api: { demo_sessions: 0, commands: 0, non_2xx: [] },
  guards: [], files: [], failures: [] };
const t0 = Date.now();
const now = () => +((Date.now() - t0) / 1000).toFixed(2);
const starts = new Map();
let demoRefused = null;
const videoStart = (file, layout) => { const t_s = now(); starts.set(file, t_s); log.events.push({ t_s, event: 'video.start', file, layout }); };
const note = (event, extra = {}) => {
  const e = { t_s: now(), event, ...extra };
  if (extra.file && starts.has(extra.file) && event !== 'video.saved') e.t_file_s = +(e.t_s - starts.get(extra.file)).toFixed(2);
  log.events.push(e); console.log(JSON.stringify(e));
};
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

async function newContext(browser, name) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ...(L.isMobile ? {} : { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } }),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  // Страховка: рабочий кабинет (/account, F2/F3) не открывается.
  await ctx.route((u) => u.pathname.startsWith('/account') || u.pathname.startsWith('/api/account'),
    (route) => { note('blocked', { path: new URL(route.request().url()).pathname }); return route.abort(); });
  return { ctx, L, name };
}

// Счёт обращений к API и остановка на лимите — по ответам страницы (без подмены запросов).
function watchApi(page, file) {
  page.on('response', async (res) => {
    const p = new URL(res.url()).pathname;
    if (!p.startsWith('/api/')) return;
    if (p === '/api/demo') log.api.demo_sessions += 1; else log.api.commands += 1;
    if (res.status() >= 300) {
      const body = await res.text().catch(() => '');
      const code = (body.match(/"code":"([A-Z_]+)"/) || [])[1] ?? null;
      log.api.non_2xx.push({ path: p, status: res.status(), code });
      note('api.non_2xx', { file, path: p, status: res.status(), code });
      if (code === 'DEMO_LIMIT' || code === 'RATE_LIMIT') demoRefused = code;
    }
  });
}

// Сторож кадра: голый IP / sslip в видимом тексте и полях, элементы «лаборатории» в пределах окна.
async function guard(page, c, file, tag) {
  const r = await page.evaluate(() => {
    const bad = /\b\d{1,3}(?:\.\d{1,3}){3}\b|sslip\.io/;
    const inView = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; };
    const addr = [];
    for (const el of document.querySelectorAll('input, textarea')) if (bad.test(el.value) && inView(el)) addr.push(`${el.tagName}#${el.id}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (bad.test(n.textContent) && n.parentElement && inView(n.parentElement)) addr.push(n.parentElement.tagName);
    const lab = [];
    for (const el of document.querySelectorAll('button, h1, h2, h3, p, span, strong')) {
      if (/лаборатор|Добавить оплату|Зарегистрировать возврат/i.test(el.textContent || '') && inView(el)) { const b = el.getBoundingClientRect(); lab.push({ el: el.tagName, text: el.textContent.trim().slice(0, 50), top: Math.round(b.top), bottom: Math.round(b.bottom) }); }
    }
    const links = [...document.querySelectorAll('input#enrollment-link')].map((i) => i.value);
    return { addr, lab, links };
  });
  const entry = { layout: c.name, tag, t_s: now(), address_visible: r.addr, lab_in_view: r.lab, enrollment_link: r.links };
  log.guards.push(entry);
  if (r.addr.length) note('guard.address_visible', { file, tag, hits: r.addr });
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
    // Граница кадра: блок «лаборатории» в <main> не должен въехать в окно — цель прокрутки ограничена сверху.
    const lab = [...document.querySelectorAll('main h2, main h3, main p, main span, main strong, main button')]
      .filter((e) => /лаборатор|без реальных денег/i.test(e.textContent || '') && e.getBoundingClientRect().height > 0)
      .map((e) => e.getBoundingClientRect().top + window.scrollY);
    const limit = lab.length ? Math.min(...lab) - 48 - innerHeight : Infinity;
    const want = Math.min(targetY, limit);
    const startY = window.scrollY; const dy = Math.max(0, Math.min(want, document.documentElement.scrollHeight - innerHeight)) - startY; const s = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (t) => { const k = Math.min(1, (t - s) / duration); window.scrollTo(0, startY + dy * ease(k)); if (k < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { targetY, duration });
}
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
const nav = (page, name) => page.locator('nav button').filter({ hasText: name }).first();

// Весь маршрут A — один файл и один демосеанс на раскладку.
async function tour(browser, name) {
  const c = await newContext(browser, name);
  const file = `a-tour-${name}.webm`;
  const target = path.join(OUT, file);
  const page = await c.ctx.newPage();
  watchApi(page, file);
  const hidpi = c.L.isMobile ? await startHiDpiRecording(page, target, c.L.video) : null;
  videoStart(file, name);
  const mark = (event, extra = {}) => note(event, { file, layout: name, ...extra });
  let ok = true;
  try {
    // ── Обзор: герой, партнёры, последние оплаты (сцены 1 и 5 — фон) ──
    await page.goto(STAND, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
    await page.evaluate(() => document.fonts?.ready);
    await page.locator('nav button').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    if (demoRefused) throw new Error(`стенд отказал в демосеансе: ${demoRefused}`);
    if (await page.getByText(/Не удалось открыть сеанс|Доступ к кабинету отклонён/).count()) throw new Error('стенд не открыл демосеанс (см. api.non_2xx)');
    mark('overview.loaded');
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.7, c.L.viewport.height * 0.5, { steps: 20 });
    await smoothScroll(page, TOP_BARS[name], 600);
    await guard(page, c, file, 'overview.hero');
    await sleep(2200);
    mark('overview.scroll_partners');
    await scrollTo(page, 'Партнёры', 3800, c.L.isMobile ? 90 : 240);
    await guard(page, c, file, 'overview.partners');
    mark('overview.partners');
    await sleep(1800);
    if (c.L.isMobile) { await scrollTo(page, 'Последние оплаты', 2600, 90); mark('overview.payments'); await guard(page, c, file, 'overview.payments'); await sleep(1800); }
    await smoothScroll(page, 0, 800);

    // ── Правила: 20 → 25 %, публикация версии (сцена 2) ──
    await press(page, c, nav(page, 'Правила'));
    await page.locator('#policy-rate').waitFor({ state: 'visible' });
    mark('rules.open');
    await smoothScroll(page, TOP_BARS[name], 500);
    await guard(page, c, file, 'rules.open');
    await sleep(900);
    if (c.L.isMobile) await scrollTo(page, '#policy-rate', 900, 260);
    await press(page, c, page.locator('#policy-rate'));
    await page.locator('#policy-rate').selectText().catch(() => {});
    await pause(300, 500);
    await typeHuman(page, '25');
    mark('rules.rate_typed');
    await pause(600, 900);
    await press(page, c, page.locator('#policy-save'));
    await page.getByText(/Опубликована версия/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('rules.published');
    if (c.L.isMobile) await page.getByText(/Опубликована версия/).first().scrollIntoViewIfNeeded();
    await guard(page, c, file, 'rules.published');
    await sleep(2400);

    // ── Приглашение: условия V3 · 25 %, ссылка для партнёра (сцена 4) ──
    if (c.L.isMobile) await smoothScroll(page, 0, 700);
    await press(page, c, nav(page, 'Приглашение'));
    await page.locator('#enrollment-link').waitFor({ state: 'visible' });
    mark('invite.open');
    await smoothScroll(page, TOP_BARS[name], 500);
    await guard(page, c, file, 'invite.open');
    await sleep(900);
    await hover(page, c, page.locator('#copy-enrollment'), 1200);
    mark('invite.copy_hover');
    if (c.L.isMobile) await scrollTo(page, '.invite-card', 1600, 120).catch(() => {});
    else await hover(page, c, page.locator('.invite-card').first(), 1400);
    await guard(page, c, file, 'invite.card');
    await sleep(1600);
    mark('invite.end');

    // ── Реестр: подготовить → утвердить → отметить ручную отправку (сцена 3) ──
    if (c.L.isMobile) await smoothScroll(page, 0, 700);
    await press(page, c, nav(page, 'Реестр'));
    await page.locator('#registry-prepare').waitFor({ state: 'visible' });
    await smoothScroll(page, TOP_BARS[name], 500);
    mark('registry.open');
    await guard(page, c, file, 'registry.open');
    await sleep(900);
    await press(page, c, page.locator('#registry-prepare'));
    await page.getByText(/К переводу/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('registry.prepared');
    if (c.L.isMobile) await scrollTo(page, 'К переводу', 1200, 120).catch(() => {});
    await guard(page, c, file, 'registry.prepared');
    await sleep(2000);
    await press(page, c, page.locator('#registry-approve'));
    await page.getByText(/утвержден/i).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('registry.approved');
    await guard(page, c, file, 'registry.approved');
    await sleep(1800);
    await scrollTo(page, '#sent-form', 2200, c.L.isMobile ? 160 : 320);
    mark('sent.form');
    await sleep(500);
    await press(page, c, page.locator('#sent-partner'));
    const opts = await page.locator('#sent-partner option').allTextContents();
    const anna = opts.findIndex((t) => /Анна/.test(t));
    await page.locator('#sent-partner').selectOption({ index: anna > 0 ? anna : 1 });
    mark('sent.partner', { options: opts });
    await pause(500, 800);
    await press(page, c, page.locator('#sent-evidence'));
    await typeHuman(page, 'платёжное поручение 03-09');
    await pause(400, 700);
    const date = page.locator('#sent-date');
    const type = await date.getAttribute('type');
    await press(page, c, date);
    if (type === 'date') await date.fill('2026-09-03'); else await typeHuman(page, '03.09.2026');
    mark('sent.filled', { date_type: type });
    await pause(500, 800);
    await press(page, c, page.locator('#registry-sent'));
    await page.getByText(/Отмечено оператором/).first().waitFor({ state: 'visible', timeout: 20_000 });
    mark('sent.saved');
    // Прогон desktop 19:07 кончался на scrollIntoViewIfNeeded: блок «Отмечено оператором» оставался у нижнего края.
    // С 19:10 (mobile) — плавно к блоку, чтобы факт отправки был в кадре целиком.
    await scrollTo(page, 'Отмечено оператором', 1500, c.L.isMobile ? 120 : 360).catch(() => {});
    mark('sent.fact_in_view');
    await guard(page, c, file, 'sent.saved');
    await sleep(3000);
    mark('end');
  } catch (error) {
    ok = false;
    log.failures.push({ file, error: String(error?.message ?? error).slice(0, 400) });
    note('step.failed', { file, error: String(error?.message ?? error).slice(0, 200) });
  }
  const recorder = hidpi ? await hidpi.stop() : null;
  const video = page.video();
  const saving = video ? video.saveAs(target) : null;
  await page.close();
  if (saving) {
    try { await saving; await video.delete(); } catch (error) { ok = false; log.failures.push({ file, error: `saveAs: ${String(error?.message ?? error).slice(0, 200)}` }); }
  }
  log.files.push({ file, ok, ...(recorder ? { recorder } : {}) });
  note('video.saved', { file, ok });
  await c.ctx.close();
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  try {
    for (const name of LAYOUT_NAMES) {
      if (demoRefused) { log.failures.push({ layout: name, error: `пропущено: стенд отказал в демосеансе (${demoRefused})` }); continue; }
      await tour(browser, name);
    }
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    log.finished = new Date().toISOString();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    const addr = log.guards.filter((g) => g.address_visible.length).length;
    console.log(JSON.stringify({ paid: log.paid, api: log.api, files: log.files.map((f) => ({ file: f.file, ok: f.ok })), failures: log.failures, guard_address_visible: addr }, null, 2));
    if (log.failures.length || addr) process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
