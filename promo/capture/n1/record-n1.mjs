// Запись экранов N1 «Proofwall» для промо-ролика серии (promo/SERIES.md, promo/CAPTURE-BRIEF.md, часть A).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Платных вызовов у N1 нет (приём видео выключен, расшифровка не вызывается). Ограниченные действия стенда
// считаются в журнале и НЕ повторяются в цикле:
//   • регистрация фикстуры — ОДНА (promo-fixture-n1@example.com, пароль в $OUT_DIR/.fixture.env, 600);
//     при повторном прогоне — вход по той же учётке;
//   • отправка отзыва через форму — РОВНО 2 за всё время (desktop + mobile), в СВОЮ форму /f/<slug>;
//     лимит стенда 5/час с адреса на проект; счётчик хранится в .state-n1.json и переживает перезапуск;
//   • импорт CSV (3 примера) — ОДИН commit, чтобы стене было что показать; все отзывы — ВЫМЫШЛЕННЫЕ примеры;
//   • оплата, /partner, вкладка видео — не открываются (оплата и /partner заблокированы route-блокировкой).
// Виджет «на чужом сайте» — простая HTML-страница, отданная http-сервером ВНУТРИ контейнера (127.0.0.1:8099,
// порт наружу не публикуется); origin localhost стенд установкой не засчитывает (LOCAL_HOSTS в widget-install.ts).
import { chromium } from 'playwright';
import { startHiDpiRecording } from '../hidpi-recorder.mjs';
import { sitePage } from './site-page.mjs';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://proofwall.aicoding.space';       // адрес, ВЫДАННЫЙ развёртыванием
const OUT = process.env.OUT_DIR ?? '/assets';
const STATE_FILE = path.join(OUT, '.state-n1.json');
const FIXTURE_FILE = path.join(OUT, '.fixture.env');
const STEPS = new Set((process.env.STEPS ?? 'setup,wallempty,links,seed,form,moderate,approveall,wall,snippet,site').split(',').map((s) => s.trim()).filter(Boolean));
// ONLY=mobile|desktop — снять шаг только в одной раскладке (круг правок 2D: пересъёмка сцены 4 только mobile).
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
const layoutsFor = () => ['desktop', 'mobile'].filter((n) => !ONLY || ONLY.has(n));
const MAX_SUBMITS = 2;
const SITE_PORT = 8099;

const REVIEWS = {
  desktop: { name: 'Марина С.', role: 'заказывает зерно', initials: 'МС', hue: 268,
    text: 'Заказываю зерно уже полгода: обжарка всегда свежая, привозят на следующий день. Спасибо, что помните, какой помол мне нужен!' },
  mobile: { name: 'Олег Т.', role: 'гость кофейни', initials: 'ОТ', hue: 22,
    text: 'Лучший капучино в районе. Прихожу каждое утро перед работой — ни разу не ждал дольше пары минут.' },
};
// Вымышленные примеры для стены: без фамилий, без брендов, помечаются «пример» в титрах ролика.
const CSV = [
  'name,text,role',
  'Анна В.,"Взяли кофе и круассаны на офисный завтрак — всё приехало горячим и вовремя. Коллеги просят повторить.",офис-менеджер',
  'Игорь П.,"Посоветовали зерно под мою гейзерную кофеварку, и это прямо попадание. Теперь беру только здесь.",постоянный покупатель',
  'Света Л.,"Уютно, тихо, хороший вай-фай. Работаю здесь по пятницам, и десерты каждый раз новые.",фрилансер',
].join('\n');

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), base: BASE, steps: [...STEPS], events: [],
  limited: { register: 0, login: 0, submits: 0, import_commits: 0, moderations: 0 }, paid: { calls: 0, note: 'у N1 платных вызовов нет' },
  files: [], failures: [] };
const t0 = Date.now();
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Отметка внутри ФАЙЛА записи: секунды от начала записи текущей страницы (для монтажа).
// Круг правок 2D: `t_file_s` = t_s − t_s(video.start) того же файла (ворота навыка gate-log.mjs), clip_s оставлен для
// совместимости со старыми журналами.
let clipStart = 0;
let clipFile = '';
let clipStartT = 0;
const mark = (event, extra = {}) => {
  const t_s = +((Date.now() - t0) / 1000).toFixed(1);
  note(event, { file: clipFile, clip_s: +((Date.now() - clipStart) / 1000).toFixed(1), t_file_s: +(t_s - clipStartT).toFixed(1), ...extra });
};

const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__promo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__promo_cursor';
    c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;'
      + 'transition:transform .08s ease-out;background:no-repeat center/contain url("data:image/svg+xml;utf8,'
      + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>') + '")';
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'scale(.82)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

// Блок «Тариф» (кнопка оплаты тестового магазина) в кадр не попадает: скрывается СТИЛЕМ ЗАПИСИ, код продукта
// не меняется. Скрывается заголовок «Тариф» и всё до ближайшего разделителя.
const HIDE_BILLING = () => {
  const run = () => {
    for (const h of document.querySelectorAll('h2')) {
      if (h.textContent?.trim() !== 'Тариф' || h.dataset.promoHidden) continue;
      h.dataset.promoHidden = '1';
      let el = h;
      while (el && !(el.tagName === 'HR')) { const next = el.nextElementSibling; el.style.display = 'none'; el = next; }
    }
  };
  const obs = new MutationObserver(run);
  const start = () => { run(); obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

async function readFixture() {
  const raw = await readFile(FIXTURE_FILE, 'utf8');
  const env = Object.fromEntries(raw.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (!env.PROMO_EMAIL || !env.PROMO_PASSWORD) throw new Error('.fixture.env без PROMO_EMAIL/PROMO_PASSWORD — фикстура не настроена');
  return env;
}

async function newContext(browser, name, storageState) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ...(L.isMobile ? {} : { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } }),
    ...(storageState ? { storageState } : {}),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  await ctx.addInitScript(HIDE_BILLING);
  // Страховка: оплата, партнёрка, видео-приём, смена пароля — на стенд не уходят.
  await ctx.route(/\/api\/checkout|\/partner|\/api\/testimonials\/video|\/api\/auth\/password/, (route) => { note('blocked', { url: route.request().url() }); return route.abort(); });
  ctx.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'POST' && /\/api\/testimonials$/.test(u)) note('request.submit', { layout: name });
    if (req.method() === 'POST' && /\/moderate$/.test(u)) note('request.moderate', { layout: name });
  });
  return { ctx, L, name };
}

async function recorded(c, file, fn) {
  const page = await c.ctx.newPage();
  const target = path.join(OUT, file);
  const hidpi = c.L.isMobile ? await startHiDpiRecording(page, target, c.L.video) : null;
  const started = Date.now();
  clipStart = started; clipFile = file;
  clipStartT = +((started - t0) / 1000).toFixed(1);
  log.events.push({ t_s: clipStartT, event: 'video.start', file, layout: c.name });
  let ok = true;
  try { await fn(page); }
  catch (error) { ok = false; log.failures.push({ file, error: String(error?.message ?? error).slice(0, 400) }); note('step.failed', { file, error: String(error?.message ?? error).slice(0, 200) }); }
  const recorder = hidpi ? await hidpi.stop() : null;
  const video = page.video();
  const saving = video ? video.saveAs(target) : null;
  await page.close();
  if (saving) {
    try { await saving; await video.delete(); }
    catch (error) { ok = false; log.failures.push({ file, error: `saveAs: ${String(error?.message ?? error).slice(0, 200)}` }); }
  }
  log.files.push({ file, ok, wall_s: +((Date.now() - started) / 1000).toFixed(1), ...(recorder ? { recorder } : {}) });
  note('video.saved', { file, ok });
  return ok;
}

async function press(page, c, locator, { click = true } = {}) {
  await locator.scrollIntoViewIfNeeded();
  if (c.L.isMobile) { await pause(); if (click) await locator.tap(); return; }
  const box = await locator.boundingBox();
  if (!box) throw new Error('элемент без размеров');
  await page.mouse.move(box.x + box.width * (0.35 + Math.random() * 0.3), box.y + box.height * (0.4 + Math.random() * 0.2), { steps: rnd(18, 30) });
  await pause();
  if (click) await locator.click();
}

async function typeHuman(page, text, fast = false) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === ' ' || ch === '.' || ch === ',' ? rnd(fast ? 60 : 110, fast ? 120 : 220) : rnd(fast ? 25 : 45, fast ? 60 : 110));
  }
}

async function smoothScroll(page, targetY, duration) {
  await page.evaluate(({ targetY, duration }) => new Promise((resolve) => {
    const startY = window.scrollY; const dy = Math.max(0, Math.min(targetY, document.documentElement.scrollHeight - innerHeight)) - startY; const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const k = Math.min(1, (now - t0) / duration); window.scrollTo(0, startY + dy * ease(k)); if (k < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { targetY, duration });
}
async function scrollToLocator(page, locator, duration, offset = 80) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('нет элемента для прокрутки');
  const y = await page.evaluate(() => window.scrollY);
  await smoothScroll(page, box.y + y - offset, duration);
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
  await page.evaluate(() => document.fonts?.ready);
}

// ── Подготовка (НЕ записывается): регистрация фикстуры через обычную форму стенда либо вход ─────────────────
async function setup(browser, state) {
  const fx = await readFixture();
  const c = await newContext(browser, 'desktop');
  const page = await c.ctx.newPage();
  await gotoReady(page, BASE + '/');
  let slug = null;
  if (!state.registered) {
    await page.locator('input[type=email]').fill(fx.PROMO_EMAIL);
    await page.locator('input[type=password]').fill(fx.PROMO_PASSWORD);
    await page.getByLabel('Название проекта').fill(fx.PROMO_PROJECT_NAME ?? 'primer-coffee');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/auth\/register$/.test(r.url()), { timeout: 30_000 }),
      page.getByRole('button', { name: 'Создать проект' }).click(),
    ]);
    log.limited.register += 1;
    const body = await resp.json().catch(() => null);
    note('setup.register', { status: resp.status(), slug: body?.project_slug ?? null, errors: body?.errors ?? body?.error ?? null });
    // Тело ответа может быть недоступно: страница сразу уходит на /dashboard/<slug>. Тогда slug — из адреса.
    if (resp.status() === 201) {
      await page.waitForURL(/\/dashboard\//, { timeout: 20_000 }).catch(() => {});
      slug = body?.project_slug ?? (page.url().match(/\/dashboard\/([^/?#]+)/)?.[1] ?? null);
    }
  }
  if (!slug) {
    // Учётка уже есть (повторный прогон) — вход через API входа той же формы.
    const res = await page.evaluate(async ({ email, password }) => {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { email: fx.PROMO_EMAIL, password: fx.PROMO_PASSWORD });
    log.limited.login += 1;
    slug = res.body?.projects?.[0]?.slug ?? null;
    note('setup.login', { status: res.status, slug });
    if (!slug) throw new Error(`вход фикстуры не удался: ${res.status}`);
  }
  const storage = await c.ctx.storageState();
  const video = page.video(); await page.close(); if (video) await video.delete();
  await c.ctx.close();
  return { ...state, registered: true, slug, storage };
}

// ── Сцена 1: пустая стена нового проекта — «показать нечем» ───────────────────────────────────────────────
async function wallEmpty(c, st) {
  return recorded(c, `wall-empty-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/w/${st.slug}`);
    mark('wall_empty.loaded');
    if (!c.L.isMobile) await page.mouse.move(960, 620, { steps: 25 });
    await sleep(2200);
    // Курсор медленно проходит под пустой карточкой, не закрывая текст «Здесь появятся отзывы…».
    if (!c.L.isMobile) { await page.mouse.move(1320, 560, { steps: 40 }); mark('wall_empty.cursor'); }
    await sleep(2500);
  });
}

// ── Сцена 2а: кабинет — три адреса (форма сбора, стена, сниппет) ──────────────────────────────────────────
async function links(c, st) {
  return recorded(c, `links-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/dashboard/${st.slug}`);
    mark('links.loaded');
    await sleep(1200);
    const formLink = page.locator('.linkRow__url').first();
    if (c.L.isMobile) await scrollToLocator(page, page.getByRole('heading', { name: 'Ссылки' }), 1100, 40);
    await press(page, c, formLink, { click: false });
    mark('links.form_link');
    await sleep(1800);
    if (!c.L.isMobile) {
      // «Копировать» — выделение ссылки (без буфера обмена: headless его не показывает).
      await page.evaluate(() => { const a = document.querySelector('.linkRow__url'); if (a) { const r = document.createRange(); r.selectNodeContents(a); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } });
      mark('links.form_link_selected');
      await sleep(1600);
    }
    await sleep(800);
  });
}

// ── Подготовка (НЕ записывается): 3 примера импортом CSV, остаются «на проверке» ─────────────────────────────
async function seed(browser, st) {
  if (st.imported) { note('seed.skipped', { reason: 'импорт уже выполнен' }); return st; }
  const c = await newContext(browser, 'desktop', st.storage);
  const page = await c.ctx.newPage();
  await gotoReady(page, `${BASE}/dashboard/${st.slug}`);
  const res = await page.evaluate(async ({ slug, csv }) => {
    const r = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, csv, mode: 'commit', mapping: { name: 0, text: 1, role: 2 } }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { slug: st.slug, csv: CSV });
  log.limited.import_commits += 1;
  note('seed.import', res);
  const video = page.video(); await page.close(); if (video) await video.delete();
  await c.ctx.close();
  if (res.status !== 200) throw new Error(`импорт не удался: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...st, imported: true };
}

// Аватар отзыва — синтетический (инициалы на градиенте), чтобы не брать чужие фото.
async function makeAvatar(browser, r) {
  const file = path.join(OUT, '.tmp', `avatar-${r.initials === 'МС' ? 'ms' : 'ot'}.png`);
  const p = await browser.newPage({ viewport: { width: 480, height: 480 } });
  await p.setContent(`<html><body style="margin:0"><div style="width:480px;height:480px;display:grid;place-items:center;background:linear-gradient(135deg,hsl(${r.hue} 70% 62%),hsl(${r.hue + 40} 75% 45%));font:700 170px/1 sans-serif;color:#fff;letter-spacing:-6px">${r.initials}</div></body></html>`);
  await p.screenshot({ path: file, type: 'png' });
  await p.close();
  return file;
}

// ── Сцена 2б: клиент открывает ссылку → отзыв текстом + фото → «Отправить отзыв» (РОВНО 1 на раскладку) ──
async function form(c, st, avatar) {
  if ((st.submits ?? 0) >= MAX_SUBMITS) { note('form.skipped', { layout: c.name, reason: `отправок уже ${st.submits} из ${MAX_SUBMITS}` }); return false; }
  const r = REVIEWS[c.name];
  let submitted = false;
  await recorded(c, `form-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/f/${st.slug}`);
    mark('form.loaded');
    await sleep(1300);
    await press(page, c, page.getByLabel('Ваше имя'));
    await pause(250, 450);
    await typeHuman(page, r.name);
    await pause(300, 500);
    await press(page, c, page.getByLabel(/Роль или компания/));
    await typeHuman(page, r.role, true);
    await pause(300, 500);
    await press(page, c, page.getByLabel('Отзыв'));
    mark('form.text_start');
    await typeHuman(page, r.text, true);
    mark('form.text_done');
    await pause(500, 800);
    const file = page.locator('input[type=file]');
    await press(page, c, file, { click: false });
    await file.setInputFiles(avatar);
    mark('form.photo_attached');
    await sleep(1400);
    const btn = page.getByRole('button', { name: 'Отправить отзыв' });
    const [resp] = await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'POST' && /\/api\/testimonials$/.test(x.url()), { timeout: 30_000 }),
      press(page, c, btn),
    ]);
    log.limited.submits += 1;
    submitted = true;
    mark('form.submitted', { status: resp.status() });
    if (resp.status() !== 201) throw new Error(`отправка отклонена: ${resp.status()} (повтор НЕ выполняется)`);
    await page.getByText('Спасибо! Отзыв отправлен.').waitFor({ timeout: 10_000 });
    await page.getByText('Спасибо! Отзыв отправлен.').scrollIntoViewIfNeeded();
    mark('form.thanks');
    await sleep(2800);
  });
  return submitted;
}

// ── Сцена 3а: модерация — «Опубликовать» верхний отзыв из формы ────────────────────────────────────────────
async function moderate(c, st) {
  const r = REVIEWS[c.name];
  return recorded(c, `moderate-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/dashboard/${st.slug}`);
    mark('moderate.loaded');
    await sleep(900);
    const heading = page.getByRole('heading', { name: 'Отзывы', exact: true });
    await scrollToLocator(page, heading, 1800, c.L.isMobile ? 16 : 40);
    mark('moderate.queue_visible', { pending: await page.locator('.chip--warn').first().innerText().catch(() => '') });
    await sleep(1400);
    const item = page.locator('article.modItem', { hasText: r.name }).first();
    if (!c.L.isMobile) { await press(page, c, item.locator('.modItem__text'), { click: false }); await sleep(1200); }
    const publish = item.getByRole('button', { name: 'Опубликовать' });
    await press(page, c, publish, { click: false });
    await sleep(500);
    const [resp] = await Promise.all([
      page.waitForResponse((x) => x.request().method() === 'POST' && /\/moderate$/.test(x.url()), { timeout: 20_000 }),
      c.L.isMobile ? publish.tap() : publish.click(),
    ]);
    log.limited.moderations += 1;
    mark('moderate.published', { status: resp.status() });
    await item.locator('.chip--ok').waitFor({ timeout: 10_000 });
    await sleep(2600);
  });
}

// ── Подготовка (НЕ записывается): опубликовать оставшиеся примеры, чтобы стена была полной ──────────────────
async function approveAll(browser, st) {
  const c = await newContext(browser, 'desktop', st.storage);
  const page = await c.ctx.newPage();
  await gotoReady(page, `${BASE}/dashboard/${st.slug}`);
  let n = 0;
  for (let i = 0; i < 10; i += 1) {
    const btn = page.locator('article.modItem', { has: page.locator('.chip--warn') }).getByRole('button', { name: 'Опубликовать' }).first();
    if (!(await btn.count())) break;
    await Promise.all([page.waitForResponse((x) => /\/moderate$/.test(x.url()), { timeout: 20_000 }), btn.click()]);
    n += 1; log.limited.moderations += 1;
    await sleep(400);
  }
  note('approveall.done', { approved: n });
  const video = page.video(); await page.close(); if (video) await video.delete();
  await c.ctx.close();
}

// ── Сцена 3б: стена любви — карточки, плавная прокрутка до бейджа внизу ──────────────────────────────────
async function wall(c, st) {
  return recorded(c, `wall-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/w/${st.slug}`);
    mark('wall.loaded', { cards: await page.locator('.quote').count() });
    if (!c.L.isMobile) await page.mouse.move(1180, 640, { steps: 25 });
    await sleep(2000);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await smoothScroll(page, total, c.L.isMobile ? 7000 : 4500);
    mark('wall.bottom', { scroll_px: total });
    await sleep(1500);
    const foot = page.locator('.wallFoot').first();
    if (!c.L.isMobile && await foot.count()) { await press(page, c, foot, { click: false }); mark('wall.badge_hover'); }
    await sleep(1800);
  });
}

// ── Сцена 4а: сниппет «Виджет на свой сайт» в кабинете ─────────────────────────────────────────────────────
async function snippet(c, st) {
  let code = null;
  await recorded(c, `snippet-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/dashboard/${st.slug}`);
    await sleep(800);
    const head = page.getByRole('heading', { name: 'Виджет на свой сайт' });
    await scrollToLocator(page, head, 1400, c.L.isMobile ? 16 : 200);
    mark('snippet.visible');
    await sleep(1000);
    const pre = page.locator('pre.snippet');
    code = (await pre.innerText()).trim();
    await press(page, c, pre, { click: false });
    if (c.L.isMobile) {
      // Круг правок 2D: на 390 px тег <script … data-slug="…"> длиннее блока кода. Продукт не меняется — блок
      // прокручивается по горизонтали, как пальцем у пользователя: плавно до конца строки, пауза, чтобы зритель
      // прочитал хвост тега (data-slug, async, </script>).
      const geo = await pre.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
      mark('snippet.geometry', geo);
      await sleep(700);
      mark('snippet.hscroll_start');
      await pre.evaluate((el, duration) => new Promise((resolve) => {
        const target = el.scrollWidth - el.clientWidth; const t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now) => { const k = Math.min(1, (now - t0) / duration); el.scrollLeft = target * ease(k); if (k < 1) requestAnimationFrame(step); else resolve(); };
        requestAnimationFrame(step);
      }), 2600);
      mark('snippet.hscroll_end', { scrollLeft: await pre.evaluate((el) => el.scrollLeft) });
      await sleep(1600);
    }
    await page.evaluate(() => { const el = document.querySelector('pre.snippet code'); if (el) { const r = document.createRange(); r.selectNodeContents(el); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } });
    mark('snippet.selected');
    await sleep(2600);
  });
  return code;
}

// ── Сцена 4б: виджет на «чужом» сайте (страница внутри контейнера, origin http://127.0.0.1:8099) ─────────────
async function site(c, code) {
  return recorded(c, `site-${c.name}.webm`, async (page) => {
    await gotoReady(page, `http://127.0.0.1:${SITE_PORT}/`);
    mark('site.loaded');
    if (!c.L.isMobile) await page.mouse.move(700, 520, { steps: 25 });
    await sleep(1800);
    const reviews = page.locator('#reviews');
    await scrollToLocator(page, reviews, c.L.isMobile ? 2600 : 2200, c.L.isMobile ? 8 : 20);
    mark('site.reviews_visible');
    await sleep(2200);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const now = await page.evaluate(() => window.scrollY);
    if (total - now > 40) { await smoothScroll(page, total, c.L.isMobile ? 5000 : 3000); mark('site.bottom'); }
    await sleep(2400);
    const shadowText = await page.evaluate(() => [...document.querySelectorAll('#reviews div')].map((d) => d.shadowRoot?.textContent ?? '').join(' ').replace(/\s+/g, ' ').slice(0, 300));
    note('site.widget_text', { layout: c.name, text: shadowText, codeLine: code });
  });
}

async function saveState(st) { await writeFile(STATE_FILE, JSON.stringify({ ...st, savedAt: new Date().toISOString() }), { mode: 0o600 }); }

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  await mkdir(path.join(OUT, '.tmp'), { recursive: true });
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  let st = {};
  try { st = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { /* первый прогон */ }
  let server = null;
  try {
    if (STEPS.has('setup') || !st.storage) { st = await setup(browser, st); await saveState(st); }
    const each = async (step, fn) => {
      if (!STEPS.has(step)) return;
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name, st.storage); await fn(c); await c.ctx.close(); }
    };
    await each('wallempty', (c) => wallEmpty(c, st));
    await each('links', (c) => links(c, st));
    if (STEPS.has('seed')) { st = await seed(browser, st); await saveState(st); }
    if (STEPS.has('form')) {
      for (const name of ['desktop', 'mobile']) {
        const avatar = await makeAvatar(browser, REVIEWS[name]);
        const c = await newContext(browser, name);   // клиент — без сессии владельца
        const sent = await form(c, st, avatar);
        await c.ctx.close();
        if (sent) { st.submits = (st.submits ?? 0) + 1; await saveState(st); }
      }
    }
    await each('moderate', (c) => moderate(c, st));
    if (STEPS.has('approveall')) await approveAll(browser, st);
    await each('wall', (c) => wall(c, st));
    let code = st.snippet ?? null;
    if (STEPS.has('snippet')) {
      for (const name of layoutsFor()) { const c = await newContext(browser, name, st.storage); const got = await snippet(c, st); code = got ?? code; await c.ctx.close(); }
      st.snippet = code; await saveState(st);
    }
    if (STEPS.has('site')) {
      if (!code) throw new Error('нет сниппета — шаг site невозможен');
      const html = sitePage(code);
      server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
      await new Promise((r) => server.listen(SITE_PORT, '127.0.0.1', r));
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name); await site(c, code); await c.ctx.close(); }
    }
  } finally {
    if (server) server.close();
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    log.finished = new Date().toISOString();
    log.slug = st.slug ?? null;
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ limited: log.limited, files: log.files, failures: log.failures }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
