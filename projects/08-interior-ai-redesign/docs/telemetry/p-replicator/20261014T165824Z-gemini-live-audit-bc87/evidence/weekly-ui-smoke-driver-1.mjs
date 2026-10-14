import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = process.env.N8_PUBLIC_ORIGIN;
const buildRevision = process.env.N8_BUILD_REVISION;
assert.equal(origin, 'https://n8.77.83.87.178.sslip.io');
assert.equal(buildRevision, 'sha256:ea805048b32fc121e7f1d5086d61775543b8e7cbd78392804b60ba79b731e886');

const fixture = JSON.parse(await readFile('/app/.runtime/public-e2e/compat-journey-2/runtime-fixture.json', 'utf8'));
assert.equal(fixture.origin, origin);
for (const key of ['email', 'password', 'projectId']) assert.equal(typeof fixture[key], 'string');

const startedAt = new Date().toISOString();
const network = [];
const forbiddenMutations = [];
const blockedAutomaticMutations = [];
const unexpectedOutbound = [];
const browserErrors = [];
const tabs = [];
let account;
let dashboard;
let billing;

function cleanText(value) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[synthetic-email]')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[uuid]')
    .replace(/\s+/g, ' ')
    .trim();
}

async function snapshot(page, name) {
  await page.screenshot({path: `/app/evidence/${name}.png`, fullPage: true});
}

async function inspectVisible(page) {
  return page.locator('[role="tabpanel"]:visible').evaluate((panel) => {
    const text = (node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const unique = (items) => [...new Set(items.filter(Boolean))];
    return {
      headings: unique([...panel.querySelectorAll('h2,h3')].map(text)),
      messages: unique([...panel.querySelectorAll('p,.badge')].map(text)),
      controls: [...panel.querySelectorAll('button,input,select,textarea,a')].map((node) => ({
        kind: node.tagName.toLowerCase(),
        label: text(node) || node.getAttribute('aria-label') || node.closest('label')?.childNodes[0]?.textContent?.trim() || node.getAttribute('name') || '',
        disabled: 'disabled' in node ? node.disabled : false,
        type: node.getAttribute('type'),
      })),
    };
  });
}

const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
const page = await context.newPage();
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('response', (response) => {
  const url = new URL(response.url());
  if (url.origin === origin && url.pathname.startsWith('/api/')) {
    network.push({method: response.request().method(), path: url.pathname, status: response.status()});
  }
});
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) {
    unexpectedOutbound.push({method: request.method(), origin: url.origin, path: url.pathname});
    return route.abort();
  }
  const allowed = ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
    (request.method() === 'POST' && url.pathname === '/api/auth/login');
  if (!allowed) {
    if (request.method() === 'POST' && /\/api\/projects\/[^/]+\/designs\/[^/]+\/view$/.test(url.pathname)) {
      blockedAutomaticMutations.push({method: request.method(), path: url.pathname});
      return route.abort();
    }
    forbiddenMutations.push({method: request.method(), path: url.pathname});
    return route.abort();
  }
  return route.continue();
});

try {
  const landingResponse = await page.goto(origin, {waitUntil: 'networkidle'});
  assert.equal(landingResponse?.status(), 200);
  await page.goto(`${origin}/login`, {waitUntil: 'networkidle'});
  await page.getByLabel('Почта', {exact: true}).fill(fixture.email);
  await page.getByLabel(/^Пароль/).fill(fixture.password);
  await page.getByRole('button', {name: 'Войти', exact: true}).click();
  await page.waitForURL('**/dashboard');
  await page.getByText('ВОЗМОЖНОСТИ АККАУНТА', {exact: true}).waitFor();
  const dashboardText = cleanText(await page.locator('main').innerText());
  dashboard = {
    hasAccountCapabilities: dashboardText.includes('ВОЗМОЖНОСТИ АККАУНТА'),
    aiManualText: dashboardText.includes('AI-предложения: ручной режим'),
    paymentsOffText: dashboardText.includes('Оплата: пока отключена'),
    manualAvailableText: dashboardText.includes('Ручной план, дизайн и смета доступны без AI.'),
  };
  account = await page.evaluate(async () => {
    const response = await fetch('/api/me', {credentials: 'same-origin', cache: 'no-store'});
    if (!response.ok) throw new Error(`GET /api/me ${response.status}`);
    const body = await response.json();
    const value = body.data ?? body;
    return {
      aiMode: value.aiMode,
      paymentsMode: value.paymentsMode,
      creditsAvailable: value.creditsAvailable,
      creditsHeld: value.creditsHeld,
      paidExport: value.paidExport,
      billingHold: value.billingHold,
      aiUsage: value.aiUsage,
    };
  });
  await snapshot(page, 'dashboard');

  await page.goto(`${origin}/dashboard/${fixture.projectId}`, {waitUntil: 'networkidle'});
  const labels = ['01 Обмеры', '02 Референсы', '03 Дизайн', '04 Покупки', '05 Смета', '06 До / после'];
  for (const label of labels) {
    const tab = page.getByRole('tab', {name: label, exact: true});
    await tab.click();
    await page.waitForTimeout(500);
    const panel = await inspectVisible(page);
    tabs.push({
      label,
      selected: (await tab.getAttribute('aria-selected')) === 'true',
      headings: panel.headings.map(cleanText),
      messages: panel.messages.map(cleanText),
      controls: panel.controls.map((control) => ({...control, label: cleanText(control.label)})),
    });
    await snapshot(page, `tab-${label.slice(0, 2)}`);
  }

  const design = tabs.find((item) => item.label === '03 Дизайн');
  assert(design?.messages.some((text) => text.includes('Пока доступен ручной дизайн.')));

  await page.goto(`${origin}/billing`, {waitUntil: 'networkidle'});
  await page.getByRole('heading', {name: 'AI-кредиты и экспорт'}).waitFor();
  const billingText = cleanText(await page.locator('main').innerText());
  billing = {
    paymentsDisabledText: billingText.includes('Оплата пока отключена.'),
    manualCapabilitiesText: billingText.includes('Ручной план, дизайн, смета и экспорт с водяным знаком доступны.'),
    emptyHistoryText: billingText.includes('Платежей ещё нет.'),
    checkoutButtons: await page.getByRole('button', {name: 'Перейти к оплате'}).count(),
    headings: (await page.locator('h1,h2,h3').allTextContents()).map(cleanText),
  };
  await snapshot(page, 'billing');

  assert.equal(forbiddenMutations.length, 0, 'A disallowed mutation was attempted');
  assert.equal(unexpectedOutbound.length, 0, 'Unexpected outbound request');
  const unexpectedBrowserErrors = browserErrors.filter((message) =>
    !(blockedAutomaticMutations.length > 0 && message === 'console: Failed to load resource: net::ERR_FAILED')
  );
  assert.equal(unexpectedBrowserErrors.length, 0, 'Unexpected browser or console error');
  assert.equal(account.aiMode, 'manual');
  assert.equal(account.paymentsMode, 'off');
  assert.equal(billing.paymentsDisabledText, true);
  assert.equal(tabs.length, 6);

  const result = {
    status: blockedAutomaticMutations.length > 0 ? 'passed_with_observation' : 'passed',
    startedAt,
    finishedAt: new Date().toISOString(),
    sourceRevision: '47c4e6fb3f1e336822f97af227a1e5f905925b28',
    buildRevision,
    fixtureBuildRevision: fixture.buildRevision,
    engine: 'chromium',
    scope: 'read-only public UI audit; the sole server mutation was synthetic-fixture login, which creates a session',
    dashboard,
    account,
    tabs,
    billing,
    network,
    forbiddenMutations,
    blockedAutomaticMutations,
    unexpectedOutbound,
    browserErrors,
    unexpectedBrowserErrors,
    limits: [
      'One Chromium desktop pass; prior three-engine evidence was not repeated.',
      'Observed UI availability and fixture state do not prove all business behavior.',
      'No project, design, budget, share, credit, order, or AI job was created or changed.',
    ],
  };
  await writeFile('/app/evidence/result.json', `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({status: result.status, tabs: tabs.length, aiMode: account.aiMode, paymentsMode: account.paymentsMode})}\n`);
} catch (error) {
  const failure = {
    status: 'failed', startedAt, finishedAt: new Date().toISOString(), buildRevision,
    message: error instanceof Error ? error.message : String(error),
    dashboard, account, tabs, billing, network, forbiddenMutations, blockedAutomaticMutations, unexpectedOutbound, browserErrors,
  };
  await writeFile('/app/evidence/failure.json', `${JSON.stringify(failure, null, 2)}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
