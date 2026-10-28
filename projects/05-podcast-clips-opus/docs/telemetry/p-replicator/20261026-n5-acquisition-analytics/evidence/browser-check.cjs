'use strict';
// Synthetic fixture + fully intercepted official SDK. Never live counter delivery.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('/opt/browser/node_modules/playwright');
const mode = process.argv[2] || 'on';
const dir = '/tmp/n5-acquisition-e2e', base = 'https://localhost';
const fixture = JSON.parse(fs.readFileSync(`${dir}/fixture.json`, 'utf8'));
const tag = fs.readFileSync(`${dir}/tag.js`);
const result = { mode, evidence: 'fully intercepted synthetic SDK requests; NOT live goal receipt or report ingestion', checks: [], transport: [], consoleErrors: [], screenshots: [] };
const vendor = host => /yandex|metrika/i.test(host);
const decode = value => { let text = value; for (let n = 0; n < 4; n++) { try { const next = decodeURIComponent(text.replace(/\+/g, ' ')); if (next === text) break; text = next; } catch { break; } } return text; };
const sensitive = [fixture.email, fixture.password, fixture.video_id, fixture.clip_id, fixture.intent_id, 'SENTINEL', 'private-file.mp4', 'private-title', 'private-transcript', 'private-prompt'];
const redact = text => sensitive.filter(Boolean).reduce((s, v) => s.split(v).join('[redacted]'), String(text)).slice(0, 600);
async function until(test, label, timeout = 20000) {
  const started = Date.now(); while (Date.now() - started < timeout) { if (await test()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error(`Timed out: ${label}`);
}
let browser;
async function setup(engine = chromium, label = 'main') {
  const instance = engine === chromium ? browser : await engine.launch({ headless: true });
  const context = await instance.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 900 } });
  const records = [], blocked = [], errors = []; let checkout = null; let observedGoals = [];
  await context.exposeBinding('__n5RecordGoal', (_source, name) => { observedGoals.push(String(name)); });
  await context.exposeBinding('__n5ResetGoals', () => { observedGoals = []; });
  await context.addInitScript(() => {
    if (window === window.top) void window.__n5ResetGoals();
    window.__n5Goals = [];
    let current;
    Object.defineProperty(window, 'ym', { configurable: true, get: () => current, set: value => {
      current = typeof value === 'function' ? new Proxy(value, { apply(target, self, args) {
        if (args[1] === 'reachGoal') { window.__n5Goals.push(String(args[2])); void window.__n5RecordGoal(String(args[2])); }
        return Reflect.apply(target, self, args);
      } }) : value;
    } });
  });
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (vendor(u.hostname)) {
      const text = decode(req.url() + '\n' + (req.postData() || ''));
      const fields = [...u.searchParams, ...new URLSearchParams(req.postData() || '')];
      const pageUrls = fields.filter(([key]) => key === 'page-url').map(([, value]) => decode(value));
      const record = { host: u.hostname, text, pageUrls, script: u.pathname.endsWith('/tag.js') }; records.push(record);
      if (record.script) return route.fulfill({ status: 200, contentType: 'application/javascript', body: tag });
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
    }
    if (u.origin !== base && !['data:', 'blob:'].includes(u.protocol)) { blocked.push(u.hostname); return route.abort(); }
    if (req.method() === 'POST' && /^\/api\/(checkout|webhooks)/.test(u.pathname)) { errors.push('Forbidden payment mutation attempted'); return route.abort(); }
    if (checkout && req.method() === 'GET' && u.pathname === `/api/checkout/${fixture.intent_id}`) return route.fulfill({ status: checkout.http || 200, contentType: 'application/json', body: JSON.stringify({ data: checkout.next() }) });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(redact(e.message)));
  page.on('console', msg => { if (msg.type() === 'error') result.consoleErrors.push({ label, text: redact(msg.text()) }); });
  const goals = async () => [...observedGoals];
  const count = async name => (await goals()).filter(g => g === name).length;
  const network = name => records.some(r => !r.script && r.text.includes(name));
  async function expectGoal(name, expected = 1) { await until(async () => await count(name) >= expected, `wrapper ${name}`); await until(() => network(name), `SDK network ${name}`); assert.equal(await count(name), expected); }
  function privacy() {
    assert.equal(context.serviceWorkers().length, 0, 'No Service Worker registered in synthetic context');
    assert.ok(observedGoals.every(name => ['n5_visit','n5_signup_success','n5_first_clip_ready','n5_payment_confirmed'].includes(name)), 'Unexpected instrumented goal');
    for (const r of records) if (!r.script) for (const secret of sensitive.filter(Boolean)) {
      if (r.text.includes(secret)) fs.writeFileSync(`${dir}/privacy-diagnostic.json`, JSON.stringify({ label, host: r.host, matchedFieldIndex: sensitive.indexOf(secret), sanitized: sensitive.filter(Boolean).reduce((s,v,i) => s.split(v).join(`[field-${i}]`), r.text) }, null, 2));
      assert.ok(!r.text.includes(secret), `Provider request leaked prohibited sentinel/entity field (${label})`);
    }
    assert.deepEqual(errors, [], `Browser errors (${label})`);
    for (const r of records.filter(r => !r.script)) {
      for (const url of r.pageUrls) { fs.writeFileSync(`${dir}/last-url-diagnostic.json`, JSON.stringify({label, url: sensitive.filter(Boolean).reduce((s,v,i)=>s.split(v).join(`[field-${i}]`),url)},null,2)); assert.ok(/^https:\/\/clipmkr\.ru\/analytics\/(landing|dashboard|video|upgrade|payment_return)$/.test(url) || /^goal:\/\/[^/]+\/n5_(visit|signup_success|first_clip_ready|payment_confirmed)$/.test(url), `Unsanitized SDK page-url (${label})`); }
      const goalsFound = [...r.text.matchAll(/n5_(visit|signup_success|first_clip_ready|payment_confirmed)/g)].map(m => m[0]);
      result.transport.push({ label, host: r.host, goals: [...new Set(goalsFound)], interceptedHttpStatus: 200 });
    }
  }
  return { context, page, records, blocked, count, expectGoal, privacy, checkout: value => { checkout = value; }, close: async () => { privacy(); await context.close(); if (engine !== chromium) await instance.close(); } };
}
async function consent(p) { await p.getByRole('button', { name: 'Разрешить аналитику', exact: true }).click(); }
async function signIn(s, email, register = false, referral = '') {
  const p = s.page;
  if (register) await p.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться', exact: true }).click();
  await p.locator('input[name="email"]').fill(email); await p.locator('input[name="password"]').fill(fixture.password);
  if (referral) await p.locator('input[name="partner_code"]').fill(referral);
  await p.locator('#auth button[type="submit"], #auth button:not([type])').first().click();
}
async function ui(s, engine) {
  for (const theme of ['dark', 'light']) for (const width of [360, 900]) {
    await s.page.setViewportSize({ width, height: 900 });
    await s.page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const aside = s.page.getByRole('complementary', { name: 'Аналитика сайта' }); await aside.scrollIntoViewIfNeeded();
    const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false, `overflow ${engine}/${theme}/${width}`);
    for (const box of await aside.locator('button').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { width: r.width, height: r.height }; }))) assert.ok(box.width >= 44 && box.height >= 44, `consent touch target ${engine}/${theme}/${width}`);
    const path = `${dir}/${mode}-${engine}-${theme}-${width}.png`; await s.page.screenshot({ path, fullPage: true }); result.screenshots.push(path);
  }
}
async function run() {
  assert.ok(['on', 'off', 'invalid'].includes(mode)); browser = await chromium.launch({ headless: true });
  const main = await setup(); await main.page.goto(`${base}/?private=SENTINEL#SENTINEL`, { referer: `${base}/private/SENTINEL?ref=private-title` }); await main.page.locator('#auth').waitFor();
  if (mode !== 'on') {
    await main.page.waitForTimeout(1500); assert.equal(main.records.length, 0); assert.equal(await main.page.getByRole('complementary', { name: 'Аналитика сайта' }).count(), 0);
    assert.equal(await main.page.locator('script[src*="yandex"]').count(), 0); result.checks.push('disabled runtime: landing healthy, no SDK/provider requests/consent UI'); await main.close(); return;
  }
  await main.page.evaluate(() => { document.title = 'private-title SENTINEL'; });
  await ui(main, 'chromium'); assert.equal(main.records.length, 0, 'No provider traffic before consent');
  await consent(main.page); await main.expectGoal('n5_visit');
  const sdkFrameElement = main.page.locator('iframe[sandbox="allow-scripts"]');
  assert.equal(await sdkFrameElement.count(), 1, 'One sandboxed SDK frame');
  assert.equal(await sdkFrameElement.getAttribute('referrerpolicy'), 'no-referrer');
  const sdkFrame = await sdkFrameElement.elementHandle().then(handle => handle.contentFrame());
  assert.ok(sdkFrame, 'SDK frame exists');
  assert.equal(await sdkFrame.evaluate(() => { try { void navigator.serviceWorker.register; return false; } catch (error) { return error.name === 'SecurityError'; } }), true, 'Opaque SDK frame cannot access or register Service Workers');
  assert.equal(await sdkFrame.evaluate(() => document.baseURI), 'https://clipmkr.ru/analytics/', 'SDK base cannot inherit parent sentinel URL');
  assert.equal(await sdkFrame.evaluate(() => { try { void parent.document.body; return false; } catch { return true; } }), true, 'SDK cannot read parent DOM');
  assert.equal(await sdkFrame.evaluate(() => { try { void parent.location.href; return false; } catch { return true; } }), true, 'SDK cannot read parent URL');
  await main.page.reload(); await main.page.waitForTimeout(2000); assert.equal(await main.count('n5_visit'), 0, 'Reload dedupe');
  await signIn(main, fixture.email); await main.page.waitForURL('**/dashboard'); assert.equal(await main.count('n5_signup_success'), 0, 'Login is not signup');
  await main.page.goto(`${base}/dashboard/videos/${fixture.video_id}?filename=private-file.mp4#SENTINEL`); await main.expectGoal('n5_first_clip_ready');
  await main.page.reload(); await main.page.waitForTimeout(1500); assert.equal(await main.count('n5_first_clip_ready'), 0, 'Ready reload dedupe');
  let polls = 0; main.checkout({ next: () => ({ intent_id: fixture.intent_id, status: ++polls > 1 ? 'succeeded' : 'pending', account_plan: 'paid' }) });
  await main.page.goto(`${base}/upgrade/return?intent=${fixture.intent_id}&private=SENTINEL#SENTINEL`); await main.expectGoal('n5_payment_confirmed');
  // Next's instrumented native history API supplies an actual client-side pathname transition.
  const excludedBefore = main.records.length;
  await main.page.evaluate(() => history.pushState({}, '', '/g/SENTINEL')); await main.page.waitForTimeout(600);
  const excludedSettled = main.records.length; await main.page.waitForTimeout(1200); assert.equal(main.records.length, excludedSettled, 'No subsequent SDK traffic on excluded SPA route');
  await main.page.evaluate(() => history.back()); await main.page.waitForTimeout(1200);
  assert.equal(await main.count('n5_payment_confirmed'), 1, 'Excluded roundtrip payment dedupe');
  await main.page.goto(`${base}/dashboard/videos/${fixture.video_id}`); await main.page.waitForTimeout(1500); assert.equal(await main.count('n5_first_clip_ready'), 0, 'Excluded roundtrip ready dedupe');
  await main.page.getByRole('button', { name: 'Отключить аналитику', exact: true }).click(); await main.page.waitForTimeout(700);
  const withdrawn = main.records.length; await main.page.evaluate(() => history.pushState({}, '', '/dashboard')); await main.page.waitForTimeout(1500); assert.equal(main.records.length, withdrawn, 'Withdrawal stops future SDK traffic');
  assert.equal(await main.page.evaluate(() => localStorage.getItem('n5.acquisition.v1')), null); result.checks.push('visit/login/ready/payment/reload/excluded route/withdrawal'); await main.close();
  const signup = await setup(chromium, 'signup'); await signup.page.goto(base); await consent(signup.page);
  const newEmail = fixture.new_email.replace('@', `+${Date.now()}@`); sensitive.push(newEmail);
  await signIn(signup, newEmail, true, 'SENTINEL');
  await signup.page.getByRole('button', { name: 'Продолжить без применения кода', exact: true }).waitFor(); assert.equal(await signup.count('n5_signup_success'), 0, 'Failed continuation is not signup');
  await signup.page.getByRole('button', { name: 'Продолжить без применения кода', exact: true }).click(); await signup.page.waitForURL('**/dashboard'); await signup.expectGoal('n5_signup_success'); result.checks.push('real registration + protected discard continuation'); await signup.close();
  const duplicate = await setup(chromium, 'duplicate'); await duplicate.page.goto(base); await consent(duplicate.page);
  const authResponse = duplicate.page.waitForResponse(r => r.url().includes('/api/auth/register'));
  const protectedResponse = duplicate.page.waitForResponse(r => r.url().includes('code.apply'));
  await signIn(duplicate, fixture.email, true); assert.equal((await authResponse).status(), 200); assert.equal((await protectedResponse).status(), 401);
  await duplicate.page.waitForTimeout(1000); assert.equal(await duplicate.count('n5_signup_success'), 0); result.checks.push('dummy register200 + protected401 no signup'); await duplicate.close();
  const mismatch = await setup(chromium, 'wrong-intent'); await mismatch.page.goto(base); await consent(mismatch.page); await signIn(mismatch, fixture.email); await mismatch.page.waitForURL('**/dashboard');
  mismatch.checkout({ next: () => ({ intent_id: '00000000-0000-4000-8000-000000000999', status: 'succeeded', account_plan: 'paid' }) });
  await mismatch.page.goto(`${base}/upgrade/return?intent=${fixture.intent_id}`); await mismatch.page.locator('[data-state="succeeded"]').waitFor(); await mismatch.page.waitForTimeout(1500); assert.equal(await mismatch.count('n5_payment_confirmed'), 0); result.checks.push('wrong raw intent cannot produce payment goal'); await mismatch.close();
  const wk = await setup(webkit, 'webkit-ui'); await wk.page.goto(base); await ui(wk, 'webkit'); assert.equal(wk.records.length, 0); await wk.close(); result.checks.push('chromium + webkit consent responsive/theme checks');
}
(async () => { try { await run(); result.status = 'passed'; } catch (e) { result.status = 'failed'; result.error = redact(e.stack || e); process.exitCode = 1; } finally { if (browser) await browser.close(); fs.writeFileSync(`${dir}/result-${mode}.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ status: result.status, mode, checks: result.checks, transportRequests: result.transport.length, result: `${dir}/result-${mode}.json`, error: result.error || null })); } })();
