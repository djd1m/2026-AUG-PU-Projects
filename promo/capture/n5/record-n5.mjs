// Запись экранов N5 «КлипМейкер» для серии промо-роликов (promo/SERIES.md, promo/CAPTURE-BRIEF.md, часть A).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Бюджет платных вызовов за ВСЮ серию: ОДНА обработка записи ≤ 3 минут (расшифровка whisper + выбор фрагментов
// моделью через OpenRouter). Её запускает ровно один POST /api/upload/complete на desktop-странице.
//   • Если в $OUT/.state-n5.json уже есть video_id — шаг upload ОТКАЗЫВАЕТСЯ (повтор = второй платный вызов).
//   • Mobile-запись загрузки выбирает файл и доводит палец до кнопки, но НЕ нажимает её.
//   • video.retry, clip.setMusic (пересборка), interest.create, guest.*, account.delete, /api/checkout, /upgrade —
//     заблокированы маршрутом: ни повтора обработки, ни экрана оплаты в кадре.
// Экран интереса «Pro скоро»/оффер оплаты скрыт стилем записи (section[aria-label=...]) — продукт не менялся.
import { chromium } from 'playwright';
import { startHiDpiRecording } from '../hidpi-recorder.mjs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://clipmkr.ru';                       // адрес, ВЫДАННЫЙ развёртыванием
const SHOWCASE = 'CTDUUG';                              // витринный клип лендинга (packages/shared/src/showcase.ts)
const OUT = process.env.OUT_DIR ?? '/assets';
const SOURCE_FILE = path.join(OUT, process.env.SOURCE ?? 'aikhenvald-pushkin-178s.mp4');
const STATE_FILE = path.join(OUT, '.state-n5.json');
const FIXTURE_FILE = path.join(OUT, '.fixture.env');
const STEPS = new Set((process.env.STEPS ?? 'landing,showcase,upload,clips,link').split(',').map((s) => s.trim()).filter(Boolean));
const PROGRESS_IN_FRAME_MS = 75_000;                    // сколько хода обработки держать в кадре
const DONE_WAIT_MS = 15 * 60_000;                       // потолок ожидания готовности (вне кадра)

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), base: BASE, steps: [...STEPS], events: [],
  paid: { upload_complete: 0, video_create: 0, blocked: 0 }, files: [], failures: [], stages: [] };
const t0 = Date.now();
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
// Что нельзя показывать (05_project_inputs.md): экран интереса «Pro скоро» и оффер оплаты; ссылка автора витринного
// клипа ведёт на чужую площадку (youtube.com) — скрыта. Только стиль записи, продукт не менялся.
const HIDE_SCRIPT = () => {
  const css = 'section[aria-label="Интерес к тарифу"],section[aria-label="Тариф Pro"],[data-state="pro-offer"],.author-cta{display:none!important}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head ?? document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
};

async function newContext(browser, name, storageState) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'dark', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    ...(L.isMobile ? {} : { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } }),
    ...(storageState ? { storageState } : {}),
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  await ctx.addInitScript(HIDE_SCRIPT);
  await ctx.route(/\/api\/checkout|\/upgrade|\/api\/trpc\/(video\.retry|clip\.setMusic|interest\.create|guest\.|account\.delete|video\.setCta)/,
    (route) => { log.paid.blocked += 1; note('blocked', { url: route.request().url() }); return route.abort(); });
  ctx.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'POST' && /\/api\/upload\/complete$/.test(u)) note('request.upload_complete', { layout: name });
    if (req.method() === 'POST' && /\/api\/trpc\/video\.create/.test(u)) note('request.video_create', { layout: name });
    if (req.method() === 'POST' && /\/api\/trpc\/link\.create/.test(u)) note('request.link_create', { layout: name });
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
async function hover(page, c, locator, hold = 900) {
  if (c.L.isMobile) { await sleep(hold); return; }
  const box = await locator.boundingBox({ timeout: 5000 }).catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: rnd(20, 30) });
  await sleep(hold);
}

async function smoothScroll(page, targetY, duration) {
  await page.evaluate(({ targetY, duration }) => new Promise((resolve) => {
    const startY = window.scrollY; const dy = Math.max(0, Math.min(targetY, document.documentElement.scrollHeight - innerHeight)) - startY; const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const k = Math.min(1, (now - t0) / duration); window.scrollTo(0, startY + dy * ease(k)); if (k < 1) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  }), { targetY, duration });
}
async function scrollToEl(page, selector, duration, offset = 80) {
  const y = await page.evaluate(({ selector, offset }) => { const el = document.querySelector(selector); return el ? el.getBoundingClientRect().top + window.scrollY - offset : null; }, { selector, offset });
  if (y === null) throw new Error(`нет элемента ${selector}`);
  await smoothScroll(page, y, duration);
}
async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => { await page.waitForLoadState('domcontentloaded'); });
  await page.evaluate(() => document.fonts?.ready);
}

// ── Лендинг: герой с демо-клипом, запуск демо (витрина, без входа) ─────────────────────────────────────────────
async function landing(c) {
  return recorded(c, `landing-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/');
    note('landing.loaded', { layout: c.name });
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.55, c.L.viewport.height * 0.5, { steps: 20 });
    await sleep(1800);
    const demo = page.locator('.landing-demo video');
    if (c.L.isMobile) await scrollToEl(page, '.landing-demo', 1600, 70);
    await sleep(600);
    await press(page, c, demo);             // controls: клик по видео запускает воспроизведение
    await page.evaluate(() => { const v = document.querySelector('.landing-demo video'); if (v && v.paused) return v.play().catch(() => {}); });
    note('landing.demo.play', { layout: c.name });
    await sleep(7000);
    await hover(page, c, page.locator('.landing-demo figcaption a'), 1400);
  });
}

// ── Витрина /c/CTDUUG: клип с меткой и призывом «Сделать свои клипы» (без входа) ───────────────────────────────
async function showcase(c) {
  return recorded(c, `showcase-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/c/${SHOWCASE}`);
    await page.locator('.preview img').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    note('showcase.loaded', { layout: c.name });
    await sleep(1500);
    if (c.L.isMobile) { await smoothScroll(page, 400, 2200); await sleep(1500); await smoothScroll(page, 0, 1500); }
    else await hover(page, c, page.locator('.preview'), 2000);
    await hover(page, c, page.locator('.secondary-link'), 1800);
  });
}

async function readFixture() {
  const text = await readFile(FIXTURE_FILE, 'utf8');
  const get = (k) => text.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
  const email = get('N5_FIXTURE_EMAIL'), password = get('N5_FIXTURE_PASSWORD');
  if (!email || !password) throw new Error('в .fixture.env нет почты или пароля');
  return { email, password };
}

// Вход фикстурой через ОБЫЧНУЮ форму лендинга: регистрация, если аккаунта нет; иначе вход. Не записывается.
async function signIn(browser) {
  const { email, password } = await readFixture();
  const c = await newContext(browser, 'desktop');
  const page = await c.ctx.newPage();
  await gotoReady(page, BASE + '/');
  const tryForm = async (register) => {
    if (register) await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth input[name="password"]').fill(password);
    await page.locator('#auth button:not(.text-button)').first().click();
    const r = await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 20_000 }).then(() => 'ok'),
      page.locator('#auth [role="alert"]').waitFor({ timeout: 20_000 }).then(async () => page.locator('#auth [role="alert"]').innerText()),
    ]);
    return r;
  };
  let r = await tryForm(false);
  note('fixture.login', { result: r === 'ok' ? 'ok' : r.slice(0, 120) });
  if (r !== 'ok') { await gotoReady(page, BASE + '/'); r = await tryForm(true); note('fixture.register', { result: r === 'ok' ? 'ok' : r.slice(0, 120) }); log.fixture_registered = r === 'ok'; }
  if (r !== 'ok') throw new Error(`фикстура не вошла: ${r}`);
  const storage = await c.ctx.storageState();
  const v = page.video(); await page.close(); if (v) await v.delete();
  await c.ctx.close();
  return storage;
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify({ ...state, savedAt: new Date().toISOString() }), { mode: 0o600 });
}

// ── Сцена 2: загрузка (desktop — настоящая, ОДНА) + прогресс словами (обе раскладки, ОДНА запись) ─────────────
async function upload(desk, mob, storage) {
  let resolveVideo; const videoReady = new Promise((r) => { resolveVideo = r; });
  let videoId = null;
  const deskRun = recorded(desk, 'upload-desktop.webm', async (page) => {
    await gotoReady(page, BASE + '/dashboard');
    await page.mouse.move(900, 400, { steps: 15 });
    await sleep(1500);
    await hover(page, desk, page.locator('.upload-panel h2'), 1200);
    await page.locator('#source-file').setInputFiles(SOURCE_FILE);
    await hover(page, desk, page.locator('#source-file'), 900);
    note('upload.file_selected', { layout: 'desktop' });
    const musicBox = page.locator('.upload-panel label.check').first();
    await press(page, desk, musicBox);       // «Добавить музыку и финальный акцент» — трек из каталога CC0, без платных вызовов
    await pause(700, 1100);
    const button = page.getByRole('button', { name: /Создать клипы/ });
    const done = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/upload\/complete$/.test(r.url()), { timeout: 120_000 });
    await press(page, desk, button);
    log.paid.video_create += 1;
    const res = await done;
    log.paid.upload_complete += 1;
    const body = await res.json().catch(() => null);
    videoId = body?.data?.video_id ?? null;
    note('upload.complete', { status: res.status(), videoId, error: body?.error ?? null });
    if (!res.ok() || !videoId) { resolveVideo(null); await sleep(3000); throw new Error(`загрузка не завершена: ${res.status()}`); }
    await saveState({ videoId, storage: await desk.ctx.storageState() });
    resolveVideo(videoId);
    await page.waitForURL(/\/dashboard\/videos\//, { timeout: 30_000 });
    const deadline = Date.now() + PROGRESS_IN_FRAME_MS;
    let last = '';
    await page.mouse.move(1300, 700, { steps: 25 });
    while (Date.now() < deadline) {
      const s = await page.locator('.status-panel').innerText().catch(() => '');
      const flat = s.replace(/\s+/g, ' ').slice(0, 160);
      if (flat && flat !== last) { last = flat; note('progress.desktop', { text: flat }); log.stages.push({ t_s: +((Date.now() - t0) / 1000).toFixed(1), text: flat }); }
      if (await page.locator('.status-panel.success').isVisible().catch(() => false)) break;
      await sleep(500);
    }
    await sleep(1000);
  });

  const mobRun = (async () => {
    // Загрузка на телефоне: выбрать файл и довести палец до кнопки. НЕ нажимать — это был бы второй платный вызов.
    await recorded(mob, 'upload-mobile.webm', async (page) => {
      await gotoReady(page, BASE + '/dashboard');
      await sleep(1500);
      await scrollToEl(page, '.upload-controls', 1400, 20);
      await sleep(800);
      await page.locator('#source-file').setInputFiles(SOURCE_FILE);
      note('upload.file_selected', { layout: 'mobile' });
      await sleep(1000);
      await page.locator('.upload-panel label.check').first().tap();
      await sleep(900);
      await scrollToEl(page, '.upload-controls button', 1200, 300);
      await sleep(1600);
      note('upload.mobile.not_pressed');
    });
    const id = await videoReady;
    if (!id) { note('progress.mobile.skipped', { reason: 'загрузка не состоялась' }); return; }
    await recorded(mob, 'progress-mobile.webm', async (page) => {
      await gotoReady(page, `${BASE}/dashboard/videos/${id}`);
      const deadline = Date.now() + 45_000;
      let last = '';
      while (Date.now() < deadline) {
        const s = (await page.locator('.status-panel').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
        if (s && s !== last) { last = s; note('progress.mobile', { text: s }); }
        if (await page.locator('.status-panel.success').isVisible().catch(() => false)) break;
        await sleep(500);
      }
    });
  })();
  await Promise.all([deskRun, mobRun]);
  return videoId;
}

// Готовность — вне кадра, только чтение (GET video.get через страницу), до 15 минут.
async function waitDone(c, videoId) {
  const page = await c.ctx.newPage();
  const deadline = Date.now() + DONE_WAIT_MS;
  let last = '', state = 'timeout';
  while (Date.now() < deadline) {
    await gotoReady(page, `${BASE}/dashboard/videos/${videoId}`);
    const s = (await page.locator('.status-panel').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    if (s && s !== last) { last = s; note('progress.offscreen', { text: s }); log.stages.push({ t_s: +((Date.now() - t0) / 1000).toFixed(1), text: s }); }
    const tone = await page.locator('.status-panel').getAttribute('data-state').catch(() => null);
    if (tone === 'success') { state = 'done'; break; }
    if (tone === 'failure') { state = 'failed'; break; }
    await sleep(20_000);
  }
  const clips = await page.locator('.clip-card').count().catch(() => 0);
  const v = page.video(); await page.close(); if (v) await v.delete();
  note('processing.end', { state, clips });
  return { state, clips };
}

// ── Сцена 3: экран клипов — оценки 0–99, «Почему такая оценка» ────────────────────────────────────────────────
async function clips(c, videoId) {
  return recorded(c, `clips-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/dashboard/videos/${videoId}`);
    await page.locator('.clip-card').first().waitFor({ state: 'visible', timeout: 30_000 });
    const n = await page.locator('.clip-card').count();
    const scores = await page.locator('.score-line').allInnerTexts().catch(() => []);
    note('clips.loaded', { layout: c.name, clips: n, scores });
    log.clips = { count: n, scores };
    if (!c.L.isMobile) await page.mouse.move(960, 300, { steps: 20 });
    await sleep(1500);
    await scrollToEl(page, '.clips-section', 1800, c.L.isMobile ? 12 : 40);
    await sleep(1200);
    const first = page.locator('.clip-card').first();
    await hover(page, c, first.locator('.score-badge'), 1200);
    await hover(page, c, first.locator('.score-line'), 1000);
    await press(page, c, first.locator('.score-why summary'));
    await sleep(600);
    if (c.L.isMobile) await scrollToEl(page, '.clip-card .score-details', 1400, 260).catch(() => {});
    await sleep(3200);
    if (!c.L.isMobile && n > 1) {
      for (let i = 1; i < Math.min(n, 4); i += 1) { await hover(page, c, page.locator('.clip-card').nth(i).locator('.score-line'), 900); }
    }
    if (c.L.isMobile && n > 1) { await scrollToEl(page, '.clip-card:nth-child(2)', 1800, 12).catch(() => {}); await sleep(1800); }
    // Воспроизведение первого клипа (файл клипа, без платных вызовов).
    await scrollToEl(page, '.clip-card', 1400, c.L.isMobile ? 12 : 40);
    await page.evaluate(() => { const v = document.querySelector('.clip-card video'); if (v) { v.muted = true; return v.play().catch(() => {}); } });
    await sleep(6500);
  });
}

// ── Сцена 4: «Ссылка» → короткая ссылка /c/<код> → страница клипа с меткой ──────────────────────────────────
async function link(c, videoId) {
  let short = null;
  await recorded(c, `link-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/dashboard/videos/${videoId}`);
    const first = page.locator('.clip-card').first();
    await first.waitFor({ state: 'visible', timeout: 30_000 });
    await scrollToEl(page, '.clips-section', 1200, c.L.isMobile ? 12 : 40);
    await sleep(900);
    await press(page, c, first.getByRole('button', { name: /Ссылка/ }));
    const status = first.locator('p[role="status"]');
    await status.waitFor({ state: 'visible', timeout: 15_000 });
    const msg = await status.innerText();
    short = (msg.match(/https?:\/\/\S+\/c\/[A-Z0-9]+/)?.[0]) ?? await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
    note('link.created', { layout: c.name, message: msg, short });
    await sleep(2200);
    if (!short) throw new Error('короткая ссылка не получена');
    await gotoReady(page, short);
    await page.locator('.preview img').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    note('clip_page.loaded', { layout: c.name, url: page.url() });
    await sleep(1500);
    if (c.L.isMobile) { await smoothScroll(page, 420, 2200); await sleep(1600); await smoothScroll(page, 0, 1500); }
    else await hover(page, c, page.locator('.preview'), 2600);
    // Без ссылки автора главная кнопка — «Сделать свои клипы» (.cta), а не .secondary-link (прогон 1 упал на этом).
    await hover(page, c, page.locator('main a.cta:visible, main a.secondary-link:visible').first(), 1600);
  });
  return short;
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  let state = null;
  try { state = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { /* нет прошлого состояния */ }
  try {
    for (const [step, fn] of [['landing', landing], ['showcase', showcase]]) {
      if (!STEPS.has(step)) continue;
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name); await fn(c); await c.ctx.close(); }
    }
    let videoId = state?.videoId ?? null;
    let storage = state?.storage ?? null;
    if (STEPS.has('upload')) {
      if (videoId) {
        log.failures.push({ step: 'upload', error: `в ${STATE_FILE} уже есть video_id ${videoId} — повторная обработка запрещена бюджетом` });
        note('upload.refused', { videoId });
      } else {
        storage = await signIn(browser);
        const desk = await newContext(browser, 'desktop', storage);
        const mob = await newContext(browser, 'mobile', storage);
        videoId = await upload(desk, mob, storage);
        if (videoId) {
          storage = await desk.ctx.storageState();
          log.processing = await waitDone(desk, videoId);
          await saveState({ videoId, storage, processing: log.processing });
        }
        await desk.ctx.close(); await mob.ctx.close();
      }
    }
    for (const step of ['clips', 'link']) {
      if (!STEPS.has(step)) continue;
      if (!videoId || !storage) { log.failures.push({ step, error: 'нет готовой записи — шаг пропущен' }); continue; }
      for (const name of ['desktop', 'mobile']) {
        const c = await newContext(browser, name, storage);
        if (step === 'clips') await clips(c, videoId); else log[`short_${name}`] = await link(c, videoId);
        await c.ctx.close();
      }
    }
    log.videoId = videoId;
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    log.finished = new Date().toISOString();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ paid: log.paid, files: log.files, failures: log.failures }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
