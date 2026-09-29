// Сцена 4 N6 «распространение» (круг правок 2): учётка-фикстура, экран установки и страница «чужого сайта» —
// отдельный origin http://shop.example:8099 внутри контейнера
// записи. Отдаёт ограничительный CSP (директивы с экрана «Установка») и враждебный CSS; строка установки — как есть.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function shopPage(tag) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>shop.example</title><link rel="stylesheet" href="/site.css"></head><body>
<header><b>shop.example</b><nav><span>Каталог</span><span>Доставка</span><span>Контакты</span></nav></header>
<main><p class="kicker">Пример сайта клиента — другой домен</p><h1>Сайт вашей компании</h1>
<p>Перед закрывающим тегом body вставлена одна строка из кабинета «Суфлёра». Больше на этой странице ничего не менялось.</p>
<div class="cards"><div></div><div></div><div></div></div></main>
${tag}
</body></html>`;
}
// Враждебный CSS хозяина (embeddable-widget.md): глобальные reset, box-sizing, кнопки и z-index — Shadow DOM виджета от них закрыт.
const SHOP_CSS = `*{box-sizing:content-box;margin:0}html{background:#f4f1ea;color:#1d1b16;font:18px/1.5 Georgia,serif}
header{display:flex;justify-content:space-between;align-items:center;padding:22px 6vw;background:#fff;border-bottom:1px solid #ddd6c8}
header b{font:700 22px/1 Georgia,serif}nav{display:flex;gap:28px}nav span{color:#6b6353}
main{max-width:980px;padding:8vh 6vw}.kicker{color:#8a6d2f;text-transform:uppercase;letter-spacing:.08em;font-size:14px}
h1{font-size:clamp(34px,6vw,56px);margin:12px 0 18px}main>p{max-width:40em}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:6vh}
.cards div{height:160px;background:#e8e1d3;border-radius:6px}button{font:italic 20px Georgia,serif!important;background:#c33!important;border:4px dashed #000}
header{position:sticky;top:0;z-index:1000}.cards div{position:relative;z-index:999}@media(max-width:600px){nav{display:none}}`;

export function serveShop(tag, { base, url, onListen }) {
  const csp = `default-src 'self'; script-src ${base}; connect-src ${base}; img-src ${base} data:; style-src 'self'`;
  const server = http.createServer((req, res) => {
    const headers = { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' };
    if (req.url === '/site.css') { res.writeHead(200, { ...headers, 'Content-Type': 'text/css; charset=utf-8' }); return res.end(SHOP_CSS); }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(shopPage(tag));
  });
  return new Promise((resolve) => server.listen(8099, '127.0.0.1', () => { onListen({ url, csp }); resolve(server); }));
}

// Шаги круга правок 2 (fixture, install, embed). Помощники записи — из record-n6.mjs, чтобы не дублировать.
export function round2({ BASE, OUT, log, note, newContext, recorded, press, sleep, scrollToEl, gotoReady }) {
  // ── Круг правок 2: сцена 4 «распространение» — учётка-фикстура, экран установки, виджет на ЧУЖОЙ странице ──────────
  // fixture: регистрация promo-fixture-n6@example.com обычной формой (вне записи) С cookie предпросмотра пилота — сервер
  //   сохраняет бот предпросмотра в аккаунт (claimPreview: фрагменты не пересчитываются, платных вызовов нет); затем в
  //   «Установке» контакт для «не знаю» и домен чужой страницы. Пароль — только из .fixture.env (600), в журнал не пишется.
  // install: /dashboard/bots/{id}/install — строка <script …> и «Скопировать код» (обе раскладки).
  // embed: страница http://shop.example:8099 — свой HTTP-сервер ВНУТРИ контейнера записи (имя сводится к 127.0.0.1
  //   правилом резолвера Chromium; IP и localhost продукт как домен не принимает), отдаёт CSP из экрана установки и
  //   враждебный CSS; строка установки вставлена перед </body> как есть. Виджет открывается, вопросов НЕТ (ask заблокирован).
  const FIXTURE_ENV = path.join(OUT, '.fixture.env');
  const FIXTURE_STATE = path.join(OUT, '.state-n6-fixture.json');
  const SHOP = 'http://shop.example:8099';
  const CONTACT = 'hello@shop.example';

  // Регистрация — один раз (есть .state-n6-fixture.json — повторно не регистрируемся); контакт, домен и отметка
  // «Я проверил ответы бота» — идемпотентно при каждом шаге fixture. Отметку велит инвентарь (05_project_inputs.md, N6:
  // «до отметки «проверено» посетители видят «Бот ещё настраивается» — у своего демо-бота поставить до съёмки»); ответы
  // этого бота проверены пилотом (источник у ответа, отказ вне материалов). Отметка — флаг, платных вызовов нет.
  async function fixture(browser, state, fx0) {
    const c = await newContext(browser, 'desktop', fx0?.storage ?? state?.storage, { allowAuth: true });
    const page = await c.ctx.newPage();
    try {
      let botId = fx0?.botId;
      if (!botId) botId = await register(page);
      await gotoReady(page, `${BASE}/dashboard/bots/${botId}/install`);
      if (await page.locator('#install-contact').isVisible().catch(() => false)) {
        await page.fill('#install-contact', CONTACT);
        await page.getByRole('button', { name: 'Сохранить и показать код' }).click();
        await page.locator('pre.snippet code').waitFor({ state: 'visible', timeout: 20_000 });
        note('fixture.contact_saved');
      }
      if (!(await page.locator('.origin-list code', { hasText: SHOP }).count())) {
        await page.fill('#origin-domain', SHOP);
        await page.getByRole('button', { name: 'Добавить домен' }).click();
        await page.locator('.origin-list code', { hasText: SHOP }).waitFor({ state: 'visible', timeout: 20_000 });
        note('fixture.origin_added', { origin: SHOP });
      }
      const verify = page.getByRole('button', { name: 'Я проверил ответы бота' });
      if (await verify.isVisible().catch(() => false)) {
        await verify.click();
        await verify.waitFor({ state: 'hidden', timeout: 20_000 });
        note('fixture.verified');
      }
      const tag = (await page.locator('pre.snippet code').innerText()).trim();
      if (!/^<script src="https:\/\/sufler\.aicoding\.space\/w\/widget\.[0-9a-f]+\.js" data-bot="[A-Za-z0-9_-]{22}" async><\/script>$/.test(tag)) throw new Error(`строка установки неожиданной формы: ${tag.slice(0, 120)}`);
      const fx = { botId, tag, storage: await c.ctx.storageState(), savedAt: new Date().toISOString() };
      await writeFile(FIXTURE_STATE, JSON.stringify(fx), { mode: 0o600 });
      note('fixture.ready', { botId, tag });
      return fx;
    } finally {
      const v = page.video(); await page.close(); if (v) await v.delete().catch(() => {});
      await c.ctx.close();
    }
  }

  async function register(page) {
    const env = Object.fromEntries((await readFile(FIXTURE_ENV, 'utf8')).split('\n').filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
    if (!env.FIXTURE_EMAIL || !env.FIXTURE_PASSWORD) throw new Error('.fixture.env без FIXTURE_EMAIL/FIXTURE_PASSWORD');
    {
      await gotoReady(page, `${BASE}/login?mode=register`);
      await page.fill('#auth-email', env.FIXTURE_EMAIL);
      await page.fill('#auth input[name=password]', env.FIXTURE_PASSWORD);
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/auth\/register$/.test(r.url()), { timeout: 30_000 }),
        page.locator('#auth button:not(.text-button)').click(),
      ]);
      const body = await resp.json().catch(() => null);
      note('fixture.register', { status: resp.status(), preview: body?.data?.preview ?? null, error: body?.error?.code ?? null });
      if (!resp.ok()) throw new Error(`регистрация фикстуры отклонена: ${resp.status()} ${body?.error?.code ?? ''}`);
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      const href = await page.locator('a[href*="/dashboard/bots/"]').first().getAttribute('href', { timeout: 20_000 });
      const botId = href?.match(/\/dashboard\/bots\/([0-9a-f-]{36})/)?.[1];
      if (!botId) throw new Error('в кабинете фикстуры нет бота — предпросмотр не сохранён');
      return botId;
    }
  }

  async function install(c, fx) {
    await c.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    return recorded(c, `install-${c.name}.webm`, async (page, ev) => {
      await gotoReady(page, `${BASE}/dashboard/bots/${fx.botId}/install`);
      ev('install.loaded');
      if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.55, c.L.viewport.height * 0.5, { steps: 20 });
      await sleep(1200);
      await scrollToEl(page, '#code-title', 1400, c.L.isMobile ? 180 : 140);
      ev('install.code_visible');
      await sleep(900);
      const box = await page.locator('pre.snippet').boundingBox();
      if (box && !c.L.isMobile) {
        await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 24 }); await sleep(500);
        await page.mouse.move(box.x + Math.min(box.width - 30, 900), box.y + box.height / 2, { steps: 40 }); await sleep(600);
      } else await sleep(1600);
      await press(page, c, page.getByRole('button', { name: 'Скопировать код' }));
      ev('install.copy_clicked');
      await page.getByText('Скопировано').waitFor({ state: 'visible', timeout: 3000 }).then(() => ev('install.copied'), () => ev('install.copy_no_status'));
      await sleep(2400);
    });
  }

  async function embed(c) {
    c.ctx.on('response', (r) => { if (/\/w\/v1\/config/.test(r.url())) note('widget.config', { layout: c.name, status: r.status(), origin: r.request().headers().origin ?? null }); });
    c.ctx.on('request', (r) => { if (/\/w\/v1\/ask/.test(r.url())) log.paid.widget_asks = (log.paid.widget_asks ?? 0) + 1; });
    return recorded(c, `embed-${c.name}.webm`, async (page, ev) => {
      page.on('console', (m) => { if (/sufler-widget|Content Security Policy/i.test(m.text())) ev('page.console', { text: m.text().slice(0, 200) }); });
      await gotoReady(page, SHOP + '/');
      ev('embed.loaded', { origin: SHOP });
      if (!c.L.isMobile) await page.mouse.move(c.L.viewport.width * 0.45, c.L.viewport.height * 0.45, { steps: 20 });
      const bubble = page.locator('n6-sufler button.bubble');
      await bubble.waitFor({ state: 'visible', timeout: 15_000 });
      ev('embed.bubble_visible');
      await sleep(1800);
      await press(page, c, bubble);
      ev('embed.opened');
      await sleep(4500);
      const input = page.locator('n6-sufler textarea, n6-sufler input[type=text]').first();
      if (!c.L.isMobile && await input.isVisible().catch(() => false)) {
        const b = await input.boundingBox(); if (b) await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2, { steps: 26 });
      }
      await sleep(2500);
      ev('embed.done');
    });
  }
  return { FIXTURE_STATE, SHOP, fixture, install, embed };
}
