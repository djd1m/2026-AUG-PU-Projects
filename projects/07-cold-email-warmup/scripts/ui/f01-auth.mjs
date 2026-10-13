// Run only inside the existing shared Playwright container, with its N7 network attached.
// The caller owns that attachment and must detach it only if it added it.
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/browser/node_modules/playwright');
const origin = 'http://127.0.0.1:18701';
const evidence = process.env.N7_UI_EVIDENCE;
assert(evidence, 'N7_UI_EVIDENCE required');
const preflight = JSON.parse(await readFile(`${evidence}/preflight.json`, 'utf8'));
assert.equal(preflight.status, 'ready');
assert.equal(preflight.source_revision, 'e557c73bd87495ad099e66981c2a7ef4e61f713f');
assert.equal(preflight.input_hashes.matched, 19);
assert.equal(preflight.input_hashes.mismatches.length, 0);
await mkdir(evidence, { recursive: true });
const report = {
  run_id: '20261002T192500Z-f01', work_unit_id: 'n7-f01-ui-sol', attempt_id: 'ui-1',
  source_revision: preflight.source_revision, build: preflight.build,
  started_at: new Date().toISOString(), runtime_node: process.version,
  playwright: require('/opt/browser/node_modules/playwright/package.json').version,
  preflight: 'preflight.json', viewports: [], result: 'failed',
  cleanup: { own_contexts_closed: false, bridge_closed: false, sockets_closed: false },
};
const sockets = new Set();
const upstreams = new Set();
const contexts = new Set();
// Preserve Host, Origin, cookies and every browser header; log no request bodies or headers.
const bridge = createServer((incoming, outgoing) => {
  const upstream = request({ hostname: 'n7f01-web-1', port: 3000,
    path: incoming.url, method: incoming.method, headers: incoming.headers }, response => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstreams.add(upstream);
  upstream.on('close', () => upstreams.delete(upstream));
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
bridge.on('connection', socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
});
let browser;
let listening = false;
let phase = 'bridge-listen';
const check = (row, name, condition) => {
  row.checks.push({ name, pass: Boolean(condition) });
  assert(condition, name);
};
async function identity(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/me');
    const body = await response.json();
    return { status: response.status, data: body.data };
  });
}
async function screenshot(page, row, state) {
  const path = `${row.width}-${state}.png`;
  await page.screenshot({ path: `${evidence}/${path}`, fullPage: true });
  row.screenshots.push(path);
}
async function layout(page, row, state) {
  const size = await page.evaluate(() => ({ width: innerWidth,
    body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  check(row, `${state}-no-horizontal-overflow`, size.body <= size.width && size.root <= size.width);
}
try {
  await new Promise((resolve, reject) => {
    bridge.once('error', reject);
    bridge.listen(18701, '127.0.0.1', resolve);
  });
  listening = true;
  phase = 'browser-connect';
  // The existing run-server accepts its root endpoint; /inside returns HTTP 400.
  browser = await chromium.connect('ws://127.0.0.1:9320/', { timeout: 10000 });
  report.chromium = browser.version();
  for (const width of [1440, 390]) {
    phase = `viewport-${width}`;
    const row = { width, height: 900, pass: false, checks: [], screenshots: [],
      responses: [], console: { expected_401: 0, incidental_favicon_404: 0, unexpected: 0 },
      page_errors: 0, request_failures: 0, registrations: 0, logins: 0 };
    report.viewports.push(row);
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    contexts.add(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', () => row.page_errors++);
    page.on('requestfailed', () => row.request_failures++);
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      const url = message.location().url;
      if (url === `${origin}/api/auth/me` && /401/.test(text)) row.console.expected_401++;
      else if (url === `${origin}/favicon.ico` && /404/.test(text)) row.console.incidental_favicon_404++;
      else row.console.unexpected++;
    });
    page.on('response', response => {
      const url = new URL(response.url());
      row.responses.push({ path: url.pathname, method: response.request().method(), status: response.status() });
    });
    phase = `viewport-${width}-initial-navigation`;
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    check(row, 'initial-unauthenticated-api', (await identity(page)).status === 401);
    check(row, 'initial-unauthenticated-ui', await page.locator('#auth').isVisible());
    check(row, 'email-label', await page.getByLabel('Электронная почта', { exact: true }).count() === 1);
    check(row, 'password-label', await page.getByLabel('Пароль', { exact: true }).count() === 1);
    check(row, 'registration-consent-warning', await page.getByText('Регистрация не даёт согласия на рассылку.', { exact: false }).isVisible());
    await layout(page, row, 'auth');
    await screenshot(page, row, 'auth');
    const email = `n7-ui-${width}-${randomBytes(10).toString('hex')}@example.test`;
    const password = randomBytes(24).toString('base64url');
    // Keyboard-only from first Tab through registration submission at each viewport.
    await page.keyboard.press('Tab');
    check(row, 'tab-email', await page.locator('#email').evaluate(el => el === document.activeElement));
    check(row, 'visible-focus', await page.locator('#email').evaluate(el => getComputedStyle(el).outlineStyle !== 'none'));
    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    check(row, 'tab-password', await page.locator('#password').evaluate(el => el === document.activeElement));
    await page.keyboard.type(password);
    await page.keyboard.press('Tab');
    check(row, 'tab-login', await page.getByRole('button', { name: 'Войти', exact: true }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab');
    check(row, 'tab-register', await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).evaluate(el => el === document.activeElement));
    const registered = page.waitForResponse(r => r.url() === `${origin}/api/auth/register`);
    await page.keyboard.press('Enter');
    row.registrations++;
    check(row, 'keyboard-register-201', (await registered).status() === 201);
    await page.locator('#logout').waitFor({ state: 'visible' });
    const first = await identity(page);
    check(row, 'usable-authenticated-identity', first.status === 200 &&
      /^[a-f0-9-]{36}$/.test(first.data?.account_id) && /^[a-f0-9-]{36}$/.test(first.data?.tenant_id));
    check(row, 'registration-no-sending-consent', await page.getByRole('status').innerText() ===
      'Вы вошли. Аккаунт готов; согласие на отправку не предоставлено.');
    const oldCookies = await context.cookies(origin);
    check(row, 'session-cookie-present', oldCookies.length > 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#logout').waitFor({ state: 'visible' });
    const persisted = await identity(page);
    check(row, 'reload-persists-api-identity', persisted.status === 200 &&
      persisted.data.account_id === first.data.account_id && persisted.data.tenant_id === first.data.tenant_id);
    check(row, 'reload-persists-ui', !await page.locator('#auth').isVisible());
    await layout(page, row, 'dashboard');
    await screenshot(page, row, 'dashboard');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.locator('#auth').waitFor({ state: 'visible' });
    await page.locator('#email').fill('');
    await layout(page, row, 'logout');
    await screenshot(page, row, 'logout');
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(row, 'logout-reload-unauthenticated-api', (await identity(page)).status === 401);
    check(row, 'logout-reload-unauthenticated-ui', await page.locator('#auth').isVisible() && !await page.locator('#logout').isVisible());
    const replay = await browser.newContext({ viewport: { width, height: 900 } });
    contexts.add(replay);
    await replay.addCookies(oldCookies);
    const replayPage = await replay.newPage();
    await replayPage.goto(origin, { waitUntil: 'domcontentloaded' });
    check(row, 'old-session-reuse-rejected', (await identity(replayPage)).status === 401 && await replayPage.locator('#auth').isVisible());
    await replay.close(); contexts.delete(replay);
    await page.getByLabel('Электронная почта', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    const login = page.waitForResponse(r => r.url() === `${origin}/api/auth/login`);
    await page.getByRole('button', { name: 'Войти', exact: true }).press('Enter');
    row.logins++;
    check(row, 'existing-identity-login-200', (await login).status() === 200);
    await page.locator('#logout').waitFor({ state: 'visible' });
    const relogged = await identity(page);
    check(row, 'login-same-identity', relogged.status === 200 && relogged.data.account_id === first.data.account_id);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.locator('#auth').waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(row, 'second-logout-reload', (await identity(page)).status === 401 && await page.locator('#auth').isVisible());
    check(row, 'no-sending-requests', row.responses.every(r => r.method === 'GET' ||
      ['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(r.path)));
    check(row, 'no-unexpected-http-errors', row.responses.every(r => r.status < 400 ||
      (r.status === 401 && r.path === '/api/auth/me') || (r.status === 404 && r.path === '/favicon.ico')));
    check(row, 'no-unexpected-console-errors', row.console.unexpected === 0);
    check(row, 'no-page-errors', row.page_errors === 0);
    check(row, 'no-request-failures', row.request_failures === 0);
    row.pass = true;
    await context.close(); contexts.delete(context);
  }
  report.result = 'pass';
} catch (error) {
  // Never serialize raw errors: browser errors may contain user-entered values.
  report.failure = { phase, kind: error?.code === 'EADDRINUSE' ? 'bridge_port_busy' : 'assertion_or_runtime_failure', error_type: error?.name };
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  report.cleanup.own_contexts_closed = true;
  // close() on a remotely connected Playwright Browser disconnects this client.
  if (browser) await browser.close();
  for (const upstream of upstreams) upstream.destroy();
  for (const socket of sockets) socket.destroy();
  if (listening) await new Promise(resolve => bridge.close(resolve));
  report.cleanup.bridge_closed = !bridge.listening;
  report.cleanup.sockets_closed = sockets.size === 0;
  report.finished_at = new Date().toISOString();
  await writeFile(`${evidence}/checks.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, viewports: report.viewports.map(r => ({ width: r.width, pass: r.pass })), failure: report.failure }));
}
