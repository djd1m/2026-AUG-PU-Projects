import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error('Missing argument: ' + name);
  return process.argv[i + 1];
}
const fixture = JSON.parse(await readFile(arg('--fixture'), 'utf8'));
const base = arg('--base');
const output = arg('--output');
const report = { source_revision: arg('--source'), build_image_id: arg('--image'),
  started_at: new Date().toISOString(), scope: 'Local UI E2E; indexing completion and deployed full CJM excluded',
  endpoint: 'Docker codex-ui-playwright', base, status: 'running', checks: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.connect('ws://127.0.0.1:9320/');
let stage = 'start';
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    const email = 'n6b-ui-' + width + '-' + randomUUID() + '@example.test';
    const name = 'Тестовый бот ' + width;
    stage = 'register-' + width;
    await page.goto(base + '/register');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await page.waitForURL(base + '/cabinet');
    await page.getByRole('heading', { name: 'Кабинет', exact: true }).waitFor();
    const form = page.getByRole('form', { name: 'Создание бота' });
    await form.getByLabel('Имя бота').fill(name);
    await form.getByLabel('Адрес сайта').fill('http://127.0.0.1/');
    stage = 'private-url-' + width;
    let response = page.waitForResponse((r) => r.url() === base + '/api/bots' && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Создать бота', exact: true }).click();
    if ((await response).status() !== 422) throw new Error('Private URL was not rejected with 422');
    await page.waitForFunction(() => {
      const status = document.querySelector('form[aria-label="Создание бота"] [role="status"]');
      return Boolean(status?.textContent?.trim());
    });
    if (await page.getByRole('heading', { name, exact: true }).count() !== 0) throw new Error('Rejected URL created a bot');
    await page.screenshot({ path: path.join(output, 'private-url-' + width + '.png'), fullPage: true });
    stage = 'create-bot-' + width;
    await form.getByLabel('Адрес сайта').fill('https://93.184.216.34/');
    response = page.waitForResponse((r) => r.url() === base + '/api/bots' && r.request().method() === 'POST');
    await form.getByRole('button', { name: 'Создать бота', exact: true }).click();
    const created = await response;
    if (created.status() !== 202) throw new Error('Bot creation did not return 202');
    const data = (await created.json()).data;
    if (!data?.bot_id || !data?.job_id || !data?.public_id) throw new Error('Creation identifiers missing');
    await page.getByRole('heading', { name, exact: true }).waitFor();
    const jobResponse = await page.request.get(base + '/api/jobs/' + data.job_id);
    if (jobResponse.status() !== 200 || (await jobResponse.json()).data.state !== 'running') throw new Error('Job state unavailable');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('Horizontal overflow at ' + width);
    await page.screenshot({ path: path.join(output, 'cabinet-' + width + '.png'), fullPage: true });
    stage = 'logout-' + width;
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.waitForURL(base + '/login');
    stage = 'login-' + width;
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password + '-wrong');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByLabel('Пароль', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.waitForURL(base + '/cabinet');
    await page.getByRole('heading', { name, exact: true }).waitFor();
    if (jsErrors.length) throw new Error('Browser JavaScript errors: ' + jsErrors.length);
    report.checks.push({ viewport: width, registration: 'pass', private_url_422: 'pass',
      create_bot_202: 'pass', job_visible: 'pass', logout_login: 'pass', layout: 'pass', javascript_errors: 0 });
    await context.close();
  }
  report.status = 'pass';
} catch (error) {
  report.status = 'fail';
  report.failure = { stage, message: String(error.message).split(fixture.password).join('[redacted-test-password]') };
  process.exitCode = 1;
} finally {
  await browser.close();
  report.finished_at = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
