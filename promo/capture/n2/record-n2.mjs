// Запись экранов N2 «ReviewQR» для промо-ролика серии (promo/SERIES.md, сценарий promo/remotion/n2/SCENARIO.md).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Что делает и чего НЕ делает (стенд боевой, promo/CAPTURE-BRIEF.md):
//   • работает ТОЛЬКО со своей точкой фикстуры-учётки (promo-fixture-n2@example.com, пароль из .fixture.env);
//     на чужую точку kofeynya-artel не ходит вовсе — обращение туда ушло бы в Telegram владельца;
//   • приватные обращения: не больше MAX_SUBMITS=3 за час с адреса (лимит стенда 10/час) — счётчик хранится в
//     $OUT_DIR/.state-n2.json и проверяется ДО отправки; повторный прогон не может его превысить;
//   • привязку Telegram, оплату и выход не трогает: POST /places/*/bind, /billing/checkout, /logout, t.me —
//     заблокированы маршрутом в браузере;
//   • платных вызовов у N2 нет (моделей нет); счётчик ведётся для квитанции.
import { chromium } from 'playwright';
import { startHiDpiRecording } from '../hidpi-recorder.mjs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://reviewqr.aicoding.space';          // адрес, ВЫДАННЫЙ развёртыванием
const OUT = process.env.OUT_DIR ?? '/assets';
const STATE_FILE = path.join(OUT, '.state-n2.json');
const EMAIL = process.env.FIXTURE_EMAIL;
const PASSWORD = process.env.FIXTURE_PASSWORD;
const PLACE = 'Пекарня на Речной';                         // вымышленная точка
// Ссылки ведут на ГЛАВНУЮ площадки, а не на карточку заведения: у вымышленной точки карточки нет, а ссылаться
// на чужую было бы неправдой. Поиск («?text=пекарня», как в demo-script.md) не взят: кабинет хранит ссылку после
// new URL() и показывает кириллицу процент-кодами (%D0%BF…) — в кадре это нечитаемо (прогон 1, 29.09 08:09 UTC).
const LINKS = { yandex_maps: 'https://yandex.ru/maps/', twogis: 'https://2gis.ru/' };
const MESSAGES = {
  // Текст mobile сменён после прогона 3: то обращение принято, но его запись оборвалась; повтор с тем же текстом
  // дал бы в кабинете два одинаковых сообщения.
  mobile: { body: 'Капучино принесли холодным, а на просьбу переделать только пожали плечами. Обидно — хожу к вам каждое утро.', rating: '2', contact: 'anna@example.com' },
  desktop: { body: 'Долго ждали заказ, минут двадцать. Хлеб вкусный, но очередь стоит поправить.', rating: '3', contact: '' },
};
const STEPS = new Set((process.env.STEPS ?? 'setup,landing,owner,guest,inbox').split(',').map((s) => s.trim()).filter(Boolean));
const MAX_SUBMITS = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), base: BASE, place: PLACE, steps: [...STEPS], events: [],
  paid: { model_calls: 0 }, submits: 0, door_clicks: [], files: [], failures: [], blocked: [] };
const t0 = Date.now();
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let state = {};
async function loadState() { try { state = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { state = {}; } }
async function saveState() { await writeFile(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 }); }

// Видимый курсор для desktop: headless-запись не рисует системный указатель (как в promo/capture/record-n6.mjs).
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__promo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__promo_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;'
      + 'transition:transform .08s ease-out;background:no-repeat center/contain url("data:image/svg+xml;utf8,'
      + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>') + '")';
    document.documentElement.appendChild(c);
    const last = sessionStorage.getItem('__promo_cursor_xy');
    if (last) { const [x, y] = last.split(',').map(Number); c.style.left = x + 'px'; c.style.top = y + 'px'; }
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; try { sessionStorage.setItem('__promo_cursor_xy', `${e.clientX},${e.clientY}`); } catch {} }, true);
    window.addEventListener('mousedown', () => { c.style.transform = 'scale(.82)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

async function newContext(browser, name, { record = true, storageState } = {}) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ...(record && !L.isMobile ? { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } } : {}),
    ...(storageState ? { storageState } : {}),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  // Страховка: привязка Telegram, оплата, выход и сам Telegram на стенд/наружу не уходят.
  await ctx.route(/\/places\/[^/]+\/bind$|\/billing\/checkout$|\/logout$|\/\/t\.me\/|kofeynya-artel/, (route) => {
    log.blocked.push(route.request().url()); note('blocked', { url: route.request().url() }); return route.abort();
  });
  return { ctx, L, name };
}

async function recorded(c, file, fn) {
  const page = await c.ctx.newPage();
  const target = path.join(OUT, file);
  const hidpi = c.L.isMobile ? await startHiDpiRecording(page, target, c.L.video) : null;
  const started = Date.now();
  let ok = true;
  try { await fn(page); }
  catch (error) { ok = false; log.failures.push({ file, error: String(error?.message ?? error).slice(0, 400) }); note('step.failed', { file, error: String(error?.message ?? error).slice(0, 200) }); }
  // Остановка рекордера с потолком: зависший снимок экрана не должен вешать весь прогон (наблюдалось 18 мин).
  // (Таймер обязан проверять, что остановка ещё НЕ завершилась: в прогонах 08:37 и 08:50 его не было, и в журнал
  // попадали ложные «HiDPI stop > 30 с» при успешно закрытых файлах.)
  let stopped = false;
  const recorder = hidpi ? await Promise.race([
    hidpi.stop().then((r) => { stopped = true; return r; }),
    sleep(30_000).then(() => { if (!stopped) { ok = false; log.failures.push({ file, error: 'HiDPI stop > 30 с' }); } return null; }),
  ]) : null;
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
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: rnd(18, 28) });
  await sleep(ms);
}

async function typeHuman(page, text, fast = false) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === ' ' || ch === '.' || ch === ',' ? rnd(fast ? 60 : 120, fast ? 120 : 220) : rnd(fast ? 25 : 50, fast ? 60 : 130));
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
  const y = await locator.evaluate((el, offset) => el.getBoundingClientRect().top + window.scrollY - offset, offset);
  await smoothScroll(page, y, duration);
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
  await page.evaluate(() => document.fonts?.ready);
}

// ── setup (без записи): регистрация фикстуры обычной формой стенда, иначе вход ──────────────────────────────
async function setup(browser) {
  if (!EMAIL || !PASSWORD) throw new Error('FIXTURE_EMAIL/FIXTURE_PASSWORD не заданы (.fixture.env)');
  const c = await newContext(browser, 'desktop', { record: false });
  const page = await c.ctx.newPage();
  await gotoReady(page, BASE + '/register');
  await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD); await page.fill('#account', PLACE);
  await page.getByRole('button', { name: 'Создать кабинет' }).click();
  await page.waitForLoadState('domcontentloaded');
  if (!page.url().endsWith('/dashboard')) {
    const err = await page.locator('.err').innerText().catch(() => '');
    note('setup.register_refused', { error: err });
    await gotoReady(page, BASE + '/login');
    await page.fill('#email', EMAIL); await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    note('setup.login');
  } else {
    state.registeredAt = new Date().toISOString();
    note('setup.registered');
  }
  state.storage = await c.ctx.storageState();
  await saveState();
  await c.ctx.close();
}

// Карточка своей точки на дашборде (или null).
function placeCard(page) { return page.locator('section.card').filter({ has: page.locator('.place b', { hasText: PLACE }) }).first(); }

async function readPlace(page) {
  const card = placeCard(page);
  if (!(await card.count())) return null;
  const slug = (await card.locator('.place .mono').innerText()).replace(/^\/r\//, '').trim();
  const qrHref = await card.locator('a.qr', { hasText: 'QR и макеты' }).getAttribute('href');
  const id = qrHref?.split('/')[2] ?? null;
  return { slug, id };
}

// ── Сцена 1/5: лендинг, только герой (ниже — цена плана: оплату в ролике не показываем) ───────────────────
async function landing(c) {
  return recorded(c, `landing-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/');
    note('landing.loaded', { layout: c.name });
    if (!c.L.isMobile) {
      await page.mouse.move(c.L.viewport.width * 0.3, c.L.viewport.height * 0.35, { steps: 20 });
      await sleep(1500);
      await hover(page, c, page.locator('.mock').first(), 2500);
      await hover(page, c, page.locator('.h-hero'), 1800);
    } else {
      await sleep(2200);
      await scrollToLocator(page, page.locator('.mock').first(), 2200, 60);
      await sleep(2200);
      await smoothScroll(page, 0, 1500);
      await sleep(1000);
    }
  });
}

// ── Сцена 2: владелец — точка и ссылки (desktop создаёт; mobile показывает готовую) ─────────────────────────
async function ownerPlace(c) {
  return recorded(c, `owner-place-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/dashboard');
    if (!page.url().endsWith('/dashboard')) throw new Error(`нет сессии: ${page.url()}`);
    await sleep(1200);
    let place = await readPlace(page);
    if (!place && !c.L.isMobile) {
      const name = page.locator('#name');
      await scrollToLocator(page, name, 900, 300);
      await press(page, c, name);
      await pause(300, 500);
      await typeHuman(page, PLACE);
      await pause(500, 800);
      await press(page, c, page.getByRole('button', { name: 'Создать' }));
      await page.waitForURL(/\/dashboard$/);
      await page.waitForLoadState('networkidle').catch(() => {});
      place = await readPlace(page);
      note('owner.place_created', { layout: c.name, ...place });
      await smoothScroll(page, 0, 700);
      await sleep(1200);
    }
    if (!place) throw new Error('точки нет — сначала desktop-запись owner');
    state.place = place; await saveState();
    const card = placeCard(page);
    if (!c.L.isMobile) {
      for (const [field, url] of Object.entries(LINKS)) {
        const inp = card.locator(`input[name="${field}"]`);
        await press(page, c, inp);
        await inp.fill('');
        await pause(250, 450);
        await typeHuman(page, url, true);
        await pause(400, 700);
      }
      await press(page, c, card.getByRole('button', { name: 'Сохранить ссылки' }));
      await page.waitForURL(/\/dashboard$/);
      await page.waitForLoadState('networkidle').catch(() => {});
      note('owner.links_saved', { layout: c.name });
      await sleep(900);
      await hover(page, c, placeCard(page).locator('p a'), 1800);
    } else {
      await scrollToLocator(page, card, 1200, 70);
      await sleep(1800);
      await scrollToLocator(page, card.locator('p a'), 1400, 420);
      await sleep(1800);
    }
    await hover(page, c, placeCard(page).locator('a.qr', { hasText: 'QR и макеты' }), 700);
  });
}

// ── Сцена 2: QR и печатные макеты ───────────────────────────────────────────────────────────────────────────
async function ownerQr(c) {
  return recorded(c, `owner-qr-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/dashboard');
    await sleep(800);
    await press(page, c, placeCard(page).locator('a.qr', { hasText: 'QR и макеты' }));
    await page.waitForURL(/\/qr$/);
    await page.waitForLoadState('networkidle').catch(() => {});
    note('owner.qr_opened', { layout: c.name });
    await sleep(1800);
    await hover(page, c, page.locator('.mk__qr').first(), 1200);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await smoothScroll(page, total * 0.55, c.L.isMobile ? 5200 : 4200);
    await sleep(1400);
    await smoothScroll(page, total, 2600);
    await sleep(1600);
  });
}

function submitsInWindow() {
  const now = Date.now();
  state.submits = (state.submits ?? []).filter((t) => now - Date.parse(t) < SUBMIT_WINDOW_MS);
  return state.submits.length;
}

// ── Сцена 3: гость — три равные двери, довольный уходит на Карты ─────────────────────────────────────────────
async function guestChoice(c, slug) {
  return recorded(c, `guest-choice-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/r/${slug}`);
    const doors = page.locator('.door__link');
    const titles = await page.locator('.door__title').allInnerTexts();
    note('guest.doors', { layout: c.name, titles });
    await sleep(2500);
    for (let i = 0; i < await doors.count(); i += 1) await hover(page, c, doors.nth(i), 700);
    await sleep(600);
    const yandex = doors.filter({ hasText: 'Яндекс.Карты' });
    // Страницу площадки НЕ открываем:
    //   • прогон 2 (29.09 08:14 UTC): Яндекс.Карты (WebGL) повесили CDP Page.captureScreenshot — 18 минут на остановке
    //     HiDPI-рекордера;
    //   • прогон 3 (08:37 UTC): route на yandex.ru не сработал — Playwright не перехватывает запросы, порождённые
    //     редиректом, — и Яндекс ответил headless-браузеру белой страницей «Limited».
    // Поэтому перехватывается сам /go/: запрос УХОДИТ на стенд (route.fetch без следования редиректу — переход гостя
    // записан в журнал точки, 302 и Location получены настоящие), а браузеру отдаётся 204 — Chromium на 204 при
    // навигации остаётся на текущем документе. В кадре — нажатая дверь; на площадку трафик не уходит.
    let go = null;
    await page.route(/\/go\/[^/]+\/[^/]+$/, async (route) => {
      const r = await route.fetch({ maxRedirects: 0 });
      go = { status: r.status(), location: r.headers()['location'] ?? null };
      note('guest.go', { layout: c.name, ...go });
      return route.fulfill({ status: 204, body: '' });
    });
    await press(page, c, yandex);
    for (let i = 0; i < 50 && !go; i += 1) await sleep(200);
    if (!go) throw new Error('переход /go/ не случился за 10 с');
    log.door_clicks.push({ layout: c.name, door: 'yandex_maps', ...go });
    await sleep(2500);
    note('guest.after_go', { layout: c.name, url: page.url().slice(0, 120) });
  });
}

// ── Сцена 3: недовольный пишет владельцу (ОДНА отправка на раскладку) ─────────────────────────────────────────
async function guestPrivate(c, slug) {
  return recorded(c, `guest-private-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/r/${slug}`);
    await sleep(1500);
    await press(page, c, page.locator('.door__link', { hasText: 'Написать нам напрямую' }));
    await page.waitForURL(/\/private$/);
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1600);
    const m = MESSAGES[c.name];
    await press(page, c, page.locator('#body'));
    await pause(300, 500);
    await typeHuman(page, m.body);
    await pause(500, 800);
    await press(page, c, page.locator(`.rate input[value="${m.rating}"]`).locator('xpath=..'));
    await pause(400, 700);
    if (m.contact) { await press(page, c, page.locator('#contact')); await pause(250, 400); await typeHuman(page, m.contact); await pause(400, 700); }
    // Лимит до отправки: не больше MAX_SUBMITS за час, счётчик переживает перезапуски.
    if (submitsInWindow() >= MAX_SUBMITS) throw new Error(`лимит отправок прогона: ${MAX_SUBMITS} за час уже потрачен`);
    const submit = page.getByRole('button', { name: 'Отправить владельцу' });
    await submit.scrollIntoViewIfNeeded();
    state.submits.push(new Date().toISOString()); await saveState();
    log.submits += 1;
    await press(page, c, submit);
    // Ответ на POST приходит по тому же адресу: ждать ЗАГОЛОВОК результата, а не событие загрузки — в прогоне 3
    // domcontentloaded вернулся до навигации, запись оборвалась на форме, хотя обращение было принято (08:37 UTC).
    await page.locator('h1.title', { hasText: 'Отправлено' }).waitFor({ timeout: 15_000 }).catch(() => {});
    const title = await page.locator('h1.title').innerText().catch(() => '');
    note('guest.submitted', { layout: c.name, title, err: (await page.locator('.err').count()) ? await page.locator('.err').innerText() : null });
    if (title !== 'Отправлено') throw new Error(`отправка не прошла: ${title}`);
    await sleep(2800);
  });
}

// ── Сцена 4: обращение у владельца в кабинете ────────────────────────────────────────────────────────────────
async function inbox(c) {
  return recorded(c, `inbox-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/dashboard');
    await sleep(1000);
    const card = placeCard(page);
    await scrollToLocator(page, card, 900, c.L.isMobile ? 70 : 140);
    const chips = await card.locator('.chip').allInnerTexts();
    note('inbox.chips', { layout: c.name, chips });
    await hover(page, c, card.locator('.chip').nth(1), 1600);
    await press(page, c, card.locator('a.qr', { hasText: 'обращения' }));
    await page.waitForURL(/\/places\/[^/]+$/);
    await page.waitForLoadState('networkidle').catch(() => {});
    const items = await page.locator('.fb').count();
    note('inbox.items', { layout: c.name, items });
    await sleep(1400);
    await hover(page, c, page.locator('.fb').first(), 2200);
    if (c.L.isMobile) { await scrollToLocator(page, page.locator('.fb').last(), 1600, 300); }
    await sleep(2400);
  });
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  await loadState();
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  try {
    if (STEPS.has('setup') || !state.storage) await setup(browser);
    if (STEPS.has('landing')) for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name); await landing(c); await c.ctx.close(); }
    const storageState = state.storage;
    if (STEPS.has('owner')) {
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name, { storageState }); await ownerPlace(c); await c.ctx.close(); }
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name, { storageState }); await ownerQr(c); await c.ctx.close(); }
    }
    if (STEPS.has('guest')) {
      const slug = state.place?.slug;
      if (!slug) throw new Error('нет slug своей точки — сначала шаг owner');
      // Гость — без сессии владельца, mobile первым (главная раскладка гостя).
      // GUEST_PARTS / GUEST_LAYOUTS — перезаписать одну запись, не тратя переходы и отправки на остальные.
      const parts = (process.env.GUEST_PARTS ?? 'choice,private').split(',');
      const layouts = (process.env.GUEST_LAYOUTS ?? 'mobile,desktop').split(',');
      if (parts.includes('choice')) for (const name of layouts) { const c = await newContext(browser, name); await guestChoice(c, slug); await c.ctx.close(); }
      if (parts.includes('private')) for (const name of layouts) { const c = await newContext(browser, name); await guestPrivate(c, slug); await c.ctx.close(); }
    }
    if (STEPS.has('inbox')) for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name, { storageState }); await inbox(c); await c.ctx.close(); }
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    await saveState();
    log.finished = new Date().toISOString();
    log.place_state = state.place ?? null;
    log.submits_last_hour = submitsInWindow();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ paid: log.paid, submits: log.submits, files: log.files, failures: log.failures }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
