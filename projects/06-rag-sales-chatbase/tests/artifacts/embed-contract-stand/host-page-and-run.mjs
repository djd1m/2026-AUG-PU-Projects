import http from 'node:http';
import { chromium, firefox, webkit } from '/w/scripts/responsive/node_modules/playwright/index.mjs';
const W = 'https://sufler.aicoding.space';
const TAG = `<script src="${W}/w/widget.3085a96053d22f8c.js" data-bot="t24Z2UX-0J3SVFY15bW54A" async></script>`;
const CSP = `default-src 'none'; script-src ${W}; connect-src ${W}; img-src ${W} data:; style-src 'self'`;
const HOSTILE = `* { box-sizing: content-box !important; font-size: 30px !important } div { position: relative; z-index: 1 } img { width: 100% } button { width: 300px !important } h1 { color: rgb(200, 0, 0) }`;
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Хозяин</title><link rel="stylesheet" href="/host.css"></head><body><h1 id="host-title">Сайт клиента</h1><button id="host-btn">Кнопка хозяина</button>${TAG}</body></html>`;
for (const port of [8099, 8098]) http.createServer((req, res) => {
  if (req.url === '/host.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(HOSTILE); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP }); res.end(page);
}).listen(port, '0.0.0.0');
const out = [];
for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await type.launch();
  for (const port of [8099, 8098]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
    const errs = [], csp = [], api = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
    p.on('response', async (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/w/')) api.push(`${r.request().method()} ${u.pathname} ${r.status()} acao=${(await r.allHeaders())['access-control-allow-origin'] ?? '-'}`); });
    await p.exposeFunction('__csp', (v) => csp.push(v));
    await p.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp(e.violatedDirective + ' ' + e.blockedURI)));
    const hostBefore = null;
    await p.goto(`http://stand.example:${port}/`, { waitUntil: 'networkidle' });
    const r = { name, origin: `http://stand.example:${port}` };
    const host = p.locator('n6-sufler');
    r.widget = await host.count();
    if (port === 8099 && r.widget) {
      const bubble = host.locator('button').first(); const bb = await bubble.boundingBox();
      r.bubble = bb && { w: Math.round(bb.width), h: Math.round(bb.height), right: Math.round(1280 - bb.x - bb.width), bottom: Math.round(900 - bb.y - bb.height) };
      await bubble.click();
      const input = host.locator('input, textarea').first(); await input.waitFor({ timeout: 10000 });
      r.inputFont = await input.evaluate((el) => getComputedStyle(el).fontSize);
      await input.fill('What is the World Wide Web project?'); await input.press('Enter');
      await p.waitForTimeout(20000);
      const items = await host.locator('li').allTextContents(); r.answer = items.slice(-2).map((t) => t.replace(/\s+/g, ' ').slice(0, 220));
      r.sourceChip = await host.getByText(/Источник/).count();
      r.hostTitleColor = await p.locator('#host-title').evaluate((el) => getComputedStyle(el).color);
      r.hostBtnWidth = Math.round((await p.locator('#host-btn').boundingBox()).width);
      r.styleNodesInHost = await p.evaluate(() => document.querySelectorAll('style, link[rel=stylesheet]').length);
      await p.screenshot({ path: `/out/embed-${name}.png` });
    }
    r.api = api; r.csp = csp; r.errors = errs; out.push(r); await ctx.close();
  }
  await browser.close();
}
console.log(JSON.stringify(out, null, 1)); process.exit(0);
