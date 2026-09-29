// Запись экранов N4 «Тарелка» для промо-ролика серии (promo/SERIES.md, promo/CAPTURE-BRIEF.md, часть A).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Бюджет платных вызовов (распознавание = вызов модели, стенд боевой) — ≤ 3 на ВЕСЬ прогон серии:
//   • prep   — 1 распознавание (блины, CC0) вне кадра: запись в дневник, чтобы «итог дня» был не из одного блюда;
//   • mobile — 1 распознавание (салат нисуаз, CC0) в кадре: галерея → распознаётся → результат;
//   • desktop — 0: его POST /api/v1/scans перехватывается в браузере (page.route) и получает scan_id, выданный
//     mobile; cookie сессии устройства скопированы из mobile-контекста — стенд видит ТОТ ЖЕ скан.
// Счётчик хранится в $OUT_DIR/.state-n4.json (права 600) и переживает перезапуск: при paid_total ≥ 3 шаги,
// требующие нового распознавания, не выполняются. Повторов и циклов нет: отказ записывается в журнал.
// /pro, оплата, партнёрка, кабинет и вход не открываются (route-блокировка ниже).
import { chromium } from 'playwright';
import { startHiDpiRecording } from '../hidpi-recorder.mjs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://tarelka.aicoding.space';          // адрес, ВЫДАННЫЙ развёртыванием
const OUT = process.env.OUT_DIR ?? '/assets';
const STATE_FILE = path.join(OUT, '.state-n4.json');
const PHOTO_MAIN = path.join(OUT, 'photos', 'salmon-nicoise.jpg');     // CC0, Daderot, Wikimedia Commons
const PHOTO_PREP = path.join(OUT, 'photos', 'pancakes-berries.jpg');   // CC0, Daderot, Wikimedia Commons
const FAKE_CAM = path.join(OUT, '.raw-cam', 'plate.mjpeg');            // тот же CC0-кадр как «видоискатель»
const STEPS = new Set((process.env.STEPS ?? 'prep,mobile,desktop,card').split(',').map((s) => s.trim()).filter(Boolean));
const PAID_CAP = 3;
const SCAN_WAIT_MS = 90_000;

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), base: BASE, steps: [...STEPS], events: [],
  paid: { scans_this_run: 0, scans_intercepted: 0 }, files: [], failures: [], photos: {
    main: { file: 'photos/salmon-nicoise.jpg', source: 'https://commons.wikimedia.org/wiki/File:Salmon_nicoise_salad_-_London,_UK.jpg', license: 'CC0 1.0', author: 'Daderot' },
    prep: { file: 'photos/pancakes-berries.jpg', source: 'https://commons.wikimedia.org/wiki/File:Pancakes_with_berries,_plus_avocado_-_London,_UK.jpg', license: 'CC0 1.0', author: 'Daderot' } } };
const t0 = Date.now();
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let state = {};
async function saveState() { await writeFile(STATE_FILE, JSON.stringify({ ...state, savedAt: new Date().toISOString() }), { mode: 0o600 }); }
function spendScan(label) {
  const total = (state.paid_total ?? 0) + 1;
  if (total > PAID_CAP) throw new Error(`лимит распознаваний прогона (${PAID_CAP}) исчерпан — ${label} не выполняется`);
  state.paid_total = total; log.paid.scans_this_run += 1;
  note('paid.scan', { label, paid_total: total });
}

// Видимый курсор для desktop: headless-запись не рисует системный указатель.
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

async function newContext(browser, name, { record = true, storageState } = {}) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'light', locale: 'ru-RU', timezoneId: 'Europe/Moscow', permissions: ['camera'],
    ...(record && !L.isMobile ? { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } } : {}),
    ...(storageState ? { storageState } : {}),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  // Страховка «нельзя показывать»: оплата, Pro, партнёрка, кабинет, вход — на стенд не уходят.
  await ctx.route(/\/(pro|cabinet|partner|invite|auth\/(email|telegram))(\/|\?|$)|\/api\/v1\/(subscription|payments|codes|partner|earnings|payout|admin|interest)/, (route) => {
    note('blocked', { url: route.request().url() }); return route.abort();
  });
  ctx.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/v1\/scans$/.test(req.url())) note('request.scan_create', { layout: name });
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

async function press(page, c, locator) {
  await locator.scrollIntoViewIfNeeded();
  if (c.L.isMobile) { await pause(); await locator.tap(); return; }
  const box = await locator.boundingBox();
  if (!box) throw new Error('элемент без размеров');
  await page.mouse.move(box.x + box.width * (0.35 + Math.random() * 0.3), box.y + box.height * (0.4 + Math.random() * 0.2), { steps: rnd(18, 30) });
  await pause();
  await locator.click();
}

async function smoothScroll(page, targetY, duration) {
  await page.evaluate(({ targetY, duration }) => new Promise((resolve) => {
    const startY = window.scrollY; const dy = Math.max(0, Math.min(targetY, document.documentElement.scrollHeight - innerHeight)) - startY; const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const k = Math.min(1, (now - t0) / duration); window.scrollTo(0, startY + dy * ease(k)); if (k < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { targetY, duration });
}
async function scrollToLoc(page, locator, duration, offset = 80) {
  const y = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await smoothScroll(page, y, duration);
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
  await page.evaluate(() => document.fonts?.ready);
}

// Выбор фото через «галерея» → file chooser (ввод файла, как у человека с телефоном).
async function pickPhoto(page, c, file) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    press(page, c, page.getByRole('button', { name: 'галерея' })),
  ]);
  await pause(500, 900);
  await chooser.setFiles(file);
}

// Конечное состояние экрана результата: плитки | отказ | потолок.
async function waitResult(page, ms = SCAN_WAIT_MS) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await page.locator('.result__tiles').first().isVisible().catch(() => false)) return { state: 'done' };
    const status = (await page.locator('.result__status').first().innerText().catch(() => '')).trim();
    if (status && !/распознаётся|загрузка/.test(status)) return { state: 'failed', reason: status.slice(0, 300) };
    const notice = (await page.locator('.viewfinder__notice[role=alert]').innerText().catch(() => '')).trim();
    if (notice) return { state: 'refused', reason: notice.slice(0, 300) };
    await sleep(400);
  }
  return { state: 'timeout' };
}

async function readTiles(page) {
  return page.locator('.result__tiles .tile__value').allInnerTexts().catch(() => []);
}

// ── prep (вне кадра): согласие + блины в дневник. 1 платный вызов ───────────────────────────────────────────
async function prep(browser) {
  const c = await newContext(browser, 'mobile', { record: false });
  const page = await c.ctx.newPage();
  try {
    await gotoReady(page, `${BASE}/consent?return=${encodeURIComponent('/')}`);
    await page.getByRole('button', { name: 'Согласен(а)' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/consent'), { timeout: 15_000 });
    note('prep.consent', { url: page.url() });
    state.storage = await c.ctx.storageState();
    await saveState();
    if (state.prepScanId) { note('prep.scan.skipped', { reason: 'уже был', prepScanId: state.prepScanId, prepResult: state.prepResult }); return; }
    await gotoReady(page, `${BASE}/`);
    spendScan('prep: блины');
    await saveState();
    await pickPhoto(page, c, PHOTO_PREP);
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    const res = await waitResult(page);
    state.prepScanId = page.url().split('/result/')[1]?.split(/[?#]/)[0];
    state.prepResult = res.state === 'done' ? 'done' : res.reason ?? res.state;
    state.storage = await c.ctx.storageState();
    await saveState();
    note('prep.scan', { ...res, scanId: state.prepScanId, tiles: await readTiles(page) });
    // Отказ сопоставления на очевидном блюде — признак пустой/недоступной базы продуктов: дальше
    // НЕ тратим (mobile откажется сам, пока не задано ALLOW_AFTER_PREP_FAIL=1 — решение человека).
    if (res.state !== 'done') throw new Error(`prep: распознавание не удалось: ${JSON.stringify(res)}`);
    await page.getByRole('button', { name: 'в дневник' }).click();
    await page.waitForURL(/\/diary/, { timeout: 15_000 });
    note('prep.diary', { url: page.url() });
    state.storage = await c.ctx.storageState();
    await saveState();
  } finally { await page.close(); await c.ctx.close(); }
}

// ── Сцена 2: камера → галерея → распознаётся → результат ───────────────────────────────────────────────────
async function capture(c, { intercept }) {
  return recorded(c, `capture-${c.name}.webm`, async (page) => {
    if (intercept) {
      await page.route(/\/api\/v1\/scans$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        log.paid.scans_intercepted += 1;
        note('scan.intercepted', { layout: c.name, scanId: state.scanId });
        await sleep(rnd(600, 900));
        return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { scan_id: state.scanId } }) });
      });
    }
    await gotoReady(page, `${BASE}/`);
    note('capture.loaded', { layout: c.name, camera: await page.locator('.viewfinder__video').evaluate((v) => v.readyState).catch(() => null) });
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.6, c.L.viewport.height * 0.5, { steps: 20 });
    await sleep(2200);
    if (!intercept) { spendScan('mobile: салат нисуаз'); await saveState(); }
    await pickPhoto(page, c, PHOTO_MAIN);
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    const sentAt = Date.now();
    const res = await waitResult(page);
    if (!intercept) state.scanId = page.url().split('/result/')[1]?.split(/[?#]/)[0];
    note('capture.result', { layout: c.name, ...res, scanId: state.scanId, wait_s: +((Date.now() - sentAt) / 1000).toFixed(1), tiles: await readTiles(page) });
    await saveState();
    if (res.state !== 'done') throw new Error(`распознавание: ${JSON.stringify(res)}`);
    await sleep(2500);
  });
}

// ── Сцена 3: состав, источник USDA, правка порции ─────────────────────────────────────────────────────────
async function result(c, { delta }) {
  return recorded(c, `result-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/result/${state.scanId}`);
    await page.locator('.result__tiles').waitFor({ state: 'visible', timeout: 30_000 });
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.55, c.L.viewport.height * 0.45, { steps: 20 });
    await sleep(1800);
    const item = page.locator('.result__items > li.item').filter({ has: page.locator('.source-chip') }).first();
    await scrollToLoc(page, item, 1600, c.L.isMobile ? 120 : 260);
    await sleep(700);
    await press(page, c, item.locator('.source-chip > summary'));
    await sleep(2400);
    const before = await readTiles(page);
    const label = (await item.locator('.item__label').innerText().catch(() => '')).trim();
    const btn = item.getByRole('button', { name: delta > 0 ? 'плюс 50 г' : 'минус 50 г' });
    await press(page, c, btn);
    await page.waitForFunction((b) => JSON.stringify([...document.querySelectorAll('.result__tiles .tile__value')].map((e) => e.textContent)) !== b,
      JSON.stringify(before), { timeout: 15_000 }).catch(() => {});
    await sleep(1500);
    note('result.portion', { layout: c.name, item: label, delta, before, after: await readTiles(page) });
    await smoothScroll(page, 0, 1400);
    await sleep(2200);
  });
}

// ── Сцена 4: «поделиться» → ссылка → карточка /c/<id> ──────────────────────────────────────────────────────
async function share(c) {
  return recorded(c, `share-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/result/${state.scanId}`);
    await page.locator('.result__tiles').waitFor({ state: 'visible', timeout: 30_000 });
    await sleep(1200);
    await press(page, c, page.getByRole('button', { name: 'поделиться' }));
    const panel = page.locator('.share-panel__url');
    await panel.waitFor({ state: 'visible', timeout: 20_000 });
    const url = (await panel.innerText()).trim();
    state.cardUrl = url; state.cardId = url.split('/c/')[1]?.split(/[/?#]/)[0];
    note('share.ready', { layout: c.name, url });
    await saveState();
    await scrollToLoc(page, panel, 900, c.L.isMobile ? 300 : 500).catch(() => {});
    await sleep(2200);
    await gotoReady(page, `${BASE}/c/${state.cardId}`);
    await page.locator('.card__photo img').evaluate((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })));
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.7, c.L.viewport.height * 0.6, { steps: 20 });
    await sleep(2500);
    await smoothScroll(page, 10_000, 2400);
    await sleep(2000);
  });
}

// ── Итог дня: «в дневник» → /diary ────────────────────────────────────────────────────────────────────────
async function diary(c) {
  return recorded(c, `diary-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/result/${state.scanId}`);
    await page.locator('.result__tiles').waitFor({ state: 'visible', timeout: 30_000 });
    await sleep(1200);
    await press(page, c, page.getByRole('button', { name: 'в дневник' }));
    await page.waitForURL(/\/diary/, { timeout: 20_000 });
    await page.locator('.diary__streak, .diary__empty').first().waitFor({ state: 'visible', timeout: 20_000 });
    note('diary.loaded', { layout: c.name, tiles: await page.locator('.result__tiles .tile__value').allInnerTexts().catch(() => []),
      entries: await page.locator('.diary__entry').count() });
    await sleep(2200);
    const last = page.locator('.diary__entry').last();
    if (await last.count()) await scrollToLoc(page, last, 2000, c.L.isMobile ? 200 : 400).catch(() => {});
    await sleep(2200);
  });
}

// ── Карточка отдельно: картинка 9:16 целиком (для сцены 4) ────────────────────────────────────────────────
async function cardImage(browser) {
  if (!state.cardId) { log.failures.push({ step: 'card', error: 'нет cardId' }); return; }
  const c = await newContext(browser, 'mobile', { record: false });
  const res = await c.ctx.request.get(`${BASE}/c/${state.cardId}/image`);
  note('card.image', { status: res.status(), type: res.headers()['content-type'] });
  if (res.ok()) {
    const ext = (res.headers()['content-type'] ?? '').includes('png') ? 'png' : 'jpg';
    await writeFile(path.join(OUT, `card-image.${ext}`), await res.body());
    log.files.push({ file: `card-image.${ext}`, ok: true });
  }
  await c.ctx.close();
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  await mkdir(path.dirname(FAKE_CAM), { recursive: true });
  await copyFile(PHOTO_MAIN, FAKE_CAM);
  try { state = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { state = {}; }
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FAKE_CAM}`] });
  note('browser', { version: browser.version(), paid_total_before: state.paid_total ?? 0 });
  try {
    if (STEPS.has('probe')) {
      for (const name of ['mobile', 'desktop']) {
        const c = await newContext(browser, name, { record: false });
        const page = await c.ctx.newPage();
        await gotoReady(page, `${BASE}/`); await sleep(2500);
        await page.screenshot({ path: path.join(OUT, `probe-${name}.png`) });
        await c.ctx.close();
      }
    }
    if (STEPS.has('prep') && (!state.prepScanId || !state.storage)) await prep(browser);
    if (STEPS.has('mobile')) {
      if (!state.storage) throw new Error('нет состояния сессии (prep не выполнен)');
      if (!state.scanId && state.prepResult && state.prepResult !== 'done' && process.env.ALLOW_AFTER_PREP_FAIL !== '1') {
        throw new Error(`prep закончился «${state.prepResult}» — новое распознавание не запускаю (ALLOW_AFTER_PREP_FAIL=1 — после проверки базы)`);
      }
      const c = await newContext(browser, 'mobile', { storageState: state.storage });
      if (!state.scanId) await capture(c, { intercept: false }); else note('capture.mobile.skipped', { reason: 'скан уже есть', scanId: state.scanId });
      if (state.scanId) { await result(c, { delta: +50 }); await share(c); await diary(c); }
      state.storage = await c.ctx.storageState(); await saveState();
      await c.ctx.close();
    }
    if (STEPS.has('desktop') && state.scanId) {
      const c = await newContext(browser, 'desktop', { storageState: state.storage });
      await capture(c, { intercept: true });
      await result(c, { delta: -50 }); await share(c); await diary(c);
      await c.ctx.close();
    }
    if (STEPS.has('card')) await cardImage(browser);
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    await rm(path.dirname(FAKE_CAM), { recursive: true, force: true });
    log.paid.paid_total = state.paid_total ?? 0;
    log.state = { prepScanId: state.prepScanId ?? null, scanId: state.scanId ?? null, cardId: state.cardId ?? null };
    log.finished = new Date().toISOString();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ paid: log.paid, files: log.files, failures: log.failures }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
