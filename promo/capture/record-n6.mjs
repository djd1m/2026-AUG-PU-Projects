// Запись экранов N6 «Суфлёр» для пилота промо-ролика (promo/PILOT-N6.md, сцены 2–4).
// Запуск — только в контейнере mcr.microsoft.com/playwright:v1.60.0-noble, без публикации портов (см. README.md).
//
// Бюджет платных вызовов за прогон (стенд боевой, квоты общие):
//   • предпросмотр (POST /api/preview) — РОВНО ОДИН, создаёт desktop-страница. Mobile-страница показывает ТУ ЖЕ задачу:
//     её POST перехватывается локально (page.route) и получает index_job_id, выданный desktop, — на стенд второй
//     запрос не уходит. Квота QUOTA_IP_PREVIEWS=3 в сутки с адреса; повторять прогон с предпросмотром — не больше 2 раз.
//   • ответы модели (POST /api/preview/{id}/ask) — 2 вопроса × 2 раскладки = 4 (квота preview_session:answers 10).
//   • /claim, /share и вход владельца — не вызываются вовсе (запрещены route-блокировкой).
// Состояние (cookie предпросмотра) сохраняется в $OUT_DIR/.state-n6.json, чтобы перезапустить шаги chat/widget
// без нового предпросмотра: STEPS=chat,widget node record-n6.mjs.
import { chromium } from 'playwright';
import { startHiDpiRecording } from './hidpi-recorder.mjs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://sufler.aicoding.space';          // адрес, ВЫДАННЫЙ развёртыванием
const SITE = 'https://aicoding.space';                 // сайт владельца, по которому собирается предпросмотр
const QUESTIONS = ['Что такое aicoding.space?', 'Какая погода в Париже?'];
const OUT = process.env.OUT_DIR ?? '/assets';
const STATE_FILE = path.join(OUT, '.state-n6.json');
const STEPS = new Set((process.env.STEPS ?? 'landing,preview,chat,widget').split(',').map((s) => s.trim()).filter(Boolean));
const PREVIEW_WAIT_MS = 90_000;                        // потолок ожидания готовности в кадре
const EXTRA_WAIT_MS = Number(process.env.EXTRA_WAIT_MS ?? 180_000); // сверх кадра, если не успело (вне записи)
const ANSWER_WAIT_MS = 60_000;
const MAX_ASKS = 4;

const LAYOUTS = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    video: { width: 1920, height: 1080 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    video: { width: 780, height: 1688 } },
};

const log = { started: new Date().toISOString(), base: BASE, site: SITE, steps: [...STEPS], events: [],
  paid: { preview_creates: 0, preview_creates_intercepted: 0, asks: 0 }, answers: [], files: [], failures: [] };
const t0 = Date.now();
const note = (event, extra = {}) => { const e = { t_s: +((Date.now() - t0) / 1000).toFixed(1), event, ...extra }; log.events.push(e); console.log(JSON.stringify(e)); };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pause = (a = 300, b = 800) => new Promise((r) => setTimeout(r, rnd(a, b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function newContext(browser, name, storageState) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({
    viewport: L.viewport, deviceScaleFactor: L.deviceScaleFactor, isMobile: L.isMobile, hasTouch: L.hasTouch,
    colorScheme: 'dark', locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    // desktop — штатный recordVideo; mobile — свой рекордер в физических пикселях (см. hidpi-recorder.mjs).
    ...(L.isMobile ? {} : { recordVideo: { dir: path.join(OUT, '.raw'), size: L.video } }),
    ...(storageState ? { storageState } : {}),
  });
  if (!L.isMobile) await ctx.addInitScript(CURSOR_SCRIPT);
  // Страховка: ни сохранения бота, ни «поделиться», ни входа — эти запросы на стенд не уходят.
  await ctx.route(/\/api\/preview\/[^/]+\/(claim|share)$|\/api\/auth\//, (route) => { note('blocked', { url: route.request().url() }); return route.abort(); });
  ctx.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'POST' && /\/api\/preview$/.test(u)) note('request.preview_create', { layout: name });
    if (req.method() === 'POST' && /\/api\/preview\/[^/]+\/ask$/.test(u)) note('request.ask', { layout: name });
  });
  return { ctx, L, name };
}

// Страница с именованным видео: закрыть страницу → сохранить файл под именем.
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
  // saveAs ждёт закрытия страницы сам; запущенный ДО close он не теряет гонку с закрытием (наблюдалось:
  // «Target page, context or browser has been closed» при saveAs после close).
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

// Плавное перемещение курсора к элементу и клик (desktop) либо касание (mobile).
async function press(page, c, locator) {
  await locator.scrollIntoViewIfNeeded();
  if (c.L.isMobile) { await pause(); await locator.tap(); return; }
  const box = await locator.boundingBox();
  if (!box) throw new Error('элемент без размеров');
  await page.mouse.move(box.x + box.width * (0.35 + Math.random() * 0.3), box.y + box.height * (0.4 + Math.random() * 0.2), { steps: rnd(18, 30) });
  await pause();
  await locator.click();
}

async function typeHuman(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === ' ' || ch === '.' || ch === '/' ? rnd(140, 260) : rnd(60, 150));
  }
}

// Плавная прокрутка окна к Y за duration мс (easeInOutCubic, requestAnimationFrame).
async function smoothScroll(page, targetY, duration) {
  await page.evaluate(({ targetY, duration }) => new Promise((resolve) => {
    const startY = window.scrollY; const dy = Math.min(targetY, document.documentElement.scrollHeight - innerHeight) - startY; const t0 = performance.now();
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

// ── Сцена: лендинг → тарифы, 8 с ────────────────────────────────────────────────────────────────────────────
async function landing(c) {
  return recorded(c, `landing-${c.name}.webm`, async (page) => {
    await gotoReady(page, BASE + '/');
    note('landing.loaded', { layout: c.name });
    if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.62, c.L.viewport.height * 0.55, { steps: 20 });
    await sleep(1400);
    await scrollToEl(page, '#plans-title', 5600, c.L.isMobile ? 24 : 160);
    await sleep(1200);
  });
}

// Ожидание конечного состояния предпросмотра на странице: окно чата | «Бот не собрался» | «нет ответа».
async function waitPreviewEnd(page, ms) {
  const done = page.locator('#preview-question');
  const failed = page.getByRole('heading', { name: /Бот не собрался|Предпросмотр недоступен/ });
  const deadline = Date.now() + ms;
  let lastProgress = '';
  while (Date.now() < deadline) {
    if (await done.isVisible().catch(() => false)) return { state: 'done' };
    if (await failed.isVisible().catch(() => false)) return { state: 'failed', reason: (await page.locator('main').innerText().catch(() => '')).slice(0, 400) };
    const p = await page.locator('[aria-live="polite"]').first().innerText().catch(() => '');
    if (p && p !== lastProgress) { lastProgress = p; note('preview.progress', { text: p.replace(/\s+/g, ' ').slice(0, 120) }); }
    await sleep(500);
  }
  return { state: 'timeout', lastProgress };
}

// ── Сцена 2: /preview — ввод адреса, отправка, ход индексации (обе раскладки, ОДНА задача) ──────────────────
async function preview(desk, mob) {
  let jobId = null;
  let result = { state: 'not_started' };
  let mobileDone = null;
  let resolveJob;
  const jobReady = new Promise((r) => { resolveJob = r; });

  const deskRun = recorded(desk, 'preview-desktop.webm', async (page) => {
    await gotoReady(page, BASE + '/preview');
    await sleep(900);
    const input = page.locator('#site-url');
    await press(page, desk, input);
    await pause(400, 700);
    await typeHuman(page, SITE);
    await pause(500, 800);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/preview$/.test(r.url()), { timeout: 30_000 }),
      press(page, desk, page.getByRole('button', { name: 'Создать бота' })),
    ]);
    log.paid.preview_creates += 1;
    const body = await response.json().catch(() => null);
    jobId = body?.data?.index_job_id ?? null;
    note('preview.created', { status: response.status(), jobId, error: body?.error ?? null });
    if (response.status() !== 202 || !jobId) {
      result = { state: 'refused', status: response.status(), error: body?.error ?? null };
      resolveJob(null);
      await sleep(3000);   // показать причину на экране; повторять запрос НЕ будем (квота)
      return;
    }
    resolveJob({ jobId, cookies: await desk.ctx.cookies() });
    await page.waitForURL(/\/preview\/[0-9a-f-]{36}/, { timeout: 15_000 });
    result = await waitPreviewEnd(page, PREVIEW_WAIT_MS);
    note('preview.end.desktop', result);
    await sleep(result.state === 'done' ? 2500 : 1500);
    if (result.state === 'timeout') throw new Error('предпросмотр не готов за 90 с — запись хода обрезана по потолку');
  });

  const mobRun = (async () => {
    const job = await jobReady;
    if (!job) { note('preview.mobile.skipped', { reason: 'предпросмотр не создан' }); return; }
    // Общая cookie предпросмотра: mobile-страница читает ТУ ЖЕ задачу; её POST отвечаем локально.
    await mob.ctx.addCookies(job.cookies);
    await recorded(mob, 'preview-mobile.webm', async (page) => {
      await page.route(/\/api\/preview$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        log.paid.preview_creates_intercepted += 1;
        note('preview.mobile.intercepted', { jobId: job.jobId });
        await sleep(rnd(500, 900));
        return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { index_job_id: job.jobId } }) });
      });
      await gotoReady(page, BASE + '/preview');
      await sleep(900);
      await press(page, mob, page.locator('#site-url'));
      await pause(400, 700);
      await typeHuman(page, SITE);
      await pause(500, 800);
      await press(page, mob, page.getByRole('button', { name: 'Создать бота' }));
      await page.waitForURL(/\/preview\/[0-9a-f-]{36}/, { timeout: 15_000 });
      mobileDone = await waitPreviewEnd(page, PREVIEW_WAIT_MS);
      note('preview.end.mobile', mobileDone);
      await sleep(2500);
    });
  })();

  await Promise.all([deskRun, mobRun]);
  return { jobId, result, mobile: mobileDone };
}

async function waitAnswer(page, before) {
  const items = page.locator('.chat-log > li');
  const deadline = Date.now() + ANSWER_WAIT_MS;
  while (Date.now() < deadline) {
    if ((await items.count()) >= before + 2) break;
    const err = await page.locator('.chat-error').innerText().catch(() => '');
    if (err) throw new Error(`ошибка чата: ${err}`);
    await sleep(300);
  }
  if ((await items.count()) < before + 2) throw new Error('ответ не пришёл за 60 с');
  const last = items.nth(before + 1);
  const cls = (await last.getAttribute('class')) ?? '';
  const kind = cls.includes('chat-answer-group') ? 'answered' : cls.includes('chat-refused') ? 'refused' : 'unknown';
  const text = (await last.innerText()).replace(/\s+/g, ' ').slice(0, 300);
  return { kind, text };
}

// ── Сцена 3: чат — вопрос с источником, вопрос мимо материалов ─────────────────────────────────────────────
async function chat(c, jobId) {
  return recorded(c, `chat-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/preview/${jobId}`);
    await page.locator('#preview-question').waitFor({ state: 'visible', timeout: 30_000 });
    const left = await page.locator('.chat-foot').innerText().catch(() => '');
    note('chat.loaded', { layout: c.name, foot: left.replace(/\s+/g, ' ') });
    await sleep(1000);
    if (c.L.isMobile) await scrollToEl(page, '.chat-window', 900, 12);
    for (const q of QUESTIONS) {
      if (log.paid.asks >= MAX_ASKS) throw new Error('бюджет вопросов прогона исчерпан (4)');
      const before = await page.locator('.chat-log > li').count();
      await press(page, c, page.locator('#preview-question'));
      await pause(300, 600);
      await typeHuman(page, q);
      await pause(500, 800);
      await press(page, c, page.getByRole('button', { name: 'Спросить' }));
      log.paid.asks += 1;
      const a = await waitAnswer(page, before);
      log.answers.push({ layout: c.name, question: q, ...a });
      note('chat.answer', { layout: c.name, question: q, kind: a.kind });
      await sleep(600);
      // Показать ответ целиком (плашку источника) — плавно, вниз к последнему ответу.
      const lastSel = `.chat-log > li:nth-child(${before + 2})`;
      await scrollToEl(page, lastSel, 1100, c.L.isMobile ? 160 : 260).catch(() => {});
      await sleep(q === QUESTIONS[0] ? 3200 : 3600);
    }
  });
}

// ── Сцена 4 (замена): окно чата предпросмотра как «виджет». Без вопросов — платных вызовов нет ────────────────
async function widget(c, jobId) {
  return recorded(c, `widget-${c.name}.webm`, async (page) => {
    await gotoReady(page, `${BASE}/preview/${jobId}`);
    await page.locator('.chat-window').waitFor({ state: 'visible', timeout: 30_000 });
    await sleep(900);
    await scrollToEl(page, '.chat-window', 1200, c.L.isMobile ? 12 : 120);
    await sleep(700);
    const suggestions = page.locator('.suggestions button');
    const n = await suggestions.count();
    if (!c.L.isMobile) {
      for (let i = 0; i < Math.min(n, 3); i += 1) {
        const box = await suggestions.nth(i).boundingBox();
        if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 }); await pause(500, 800); }
      }
      const badge = await page.locator('.chat-window .powered').boundingBox();
      if (badge) { await page.mouse.move(badge.x + badge.width / 2, badge.y + badge.height / 2, { steps: 24 }); await sleep(1200); }
    } else {
      await sleep(1500);
      await scrollToEl(page, '.chat-foot', 1200, 500).catch(() => {});
      await sleep(1500);
    }
    // Мок-страница сайта рядом с окном — «так бот будет выглядеть на вашем сайте».
    await scrollToEl(page, '.site-mock', 1200, c.L.isMobile ? 120 : 200).catch(() => {});
    await sleep(1800);
    note('widget.done', { layout: c.name, suggestions: n });
  });
}

async function main() {
  await mkdir(path.join(OUT, '.raw'), { recursive: true });
  const browser = await chromium.launch();
  note('browser', { version: browser.version() });
  let state = null;
  try { state = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { /* нет прошлого состояния */ }
  try {
    if (STEPS.has('landing')) {
      for (const name of ['desktop', 'mobile']) { const c = await newContext(browser, name); await landing(c); await c.ctx.close(); }
    }
    let jobId = process.env.JOB_ID ?? state?.jobId ?? null;
    let storage = state?.storage ?? null;
    if (STEPS.has('preview')) {
      const desk = await newContext(browser, 'desktop');
      const mob = await newContext(browser, 'mobile');
      const p = await preview(desk, mob);
      log.preview = p;
      if (p.jobId) {
        jobId = p.jobId;
        if (p.result.state === 'timeout') {
          // Готовность за кадром (не записывается): ждём ещё, чтобы снять чат. Только чтение GET /api/preview/{id}.
          const probe = await desk.ctx.newPage();
          await gotoReady(probe, `${BASE}/preview/${jobId}`);
          const extra = await waitPreviewEnd(probe, EXTRA_WAIT_MS);
          note('preview.end.offscreen', extra);
          log.preview.offscreen = extra;
          const v = probe.video(); await probe.close(); if (v) await v.delete();
        }
        storage = await desk.ctx.storageState();
        await writeFile(STATE_FILE, JSON.stringify({ jobId, storage, savedAt: new Date().toISOString() }), { mode: 0o600 });
      }
      await desk.ctx.close(); await mob.ctx.close();
    }
    for (const step of ['chat', 'widget']) {
      if (!STEPS.has(step)) continue;
      if (!jobId || !storage) { log.failures.push({ step, error: 'нет готового предпросмотра — шаг пропущен' }); continue; }
      for (const name of ['desktop', 'mobile']) {
        const c = await newContext(browser, name, storage);
        await (step === 'chat' ? chat(c, jobId) : widget(c, jobId));
        await c.ctx.close();
      }
    }
  } finally {
    await browser.close();
    await rm(path.join(OUT, '.raw'), { recursive: true, force: true });
    log.finished = new Date().toISOString();
    await writeFile(path.join(OUT, `record-log-${log.started.replace(/[:.]/g, '-')}.json`), JSON.stringify(log, null, 2));
    console.log(JSON.stringify({ paid: log.paid, files: log.files, failures: log.failures }, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
