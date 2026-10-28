import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { domRules, axeRule } from './responsive/rules.mjs';
import { privateFixtureOrigin, runContainer } from './responsive/container-run.mjs';
function options(args) {
  const value = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--base', '--fixture', '--out'].includes(args[i]) || !args[i + 1]) throw new Error();
    value[args[i].slice(2)] = args[i + 1];
  }
  const u = new URL(value.base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash || !value.fixture || !value.out) throw new Error();
  return { ...value, base: u.origin };
}
export async function main(args, { contextOptions = {} } = {}) {
  const report = { startedAt: new Date().toISOString(), checks: [], findings: [], errors: [] };
  let config, browser;
  const check = (name, ok) => { report.checks.push({ name, pass: !!ok }); if (!ok) throw new Error(); };
  try {
    config = options(args);
    if (contextOptions.ignoreHTTPSErrors && !privateFixtureOrigin(config.base)) throw new Error();
    const f = JSON.parse(await readFile(config.fixture, 'utf8')), s = f.support;
    if (f.synthetic !== true || !s || !s.accountA?.id || !s.accountB?.id || s.accountA.id === s.accountB.id || !s.operator || !s.verifyToken || !s.resetToken || !s.newPassword || !s.videoId || !s.foreignVideoId) throw new Error();
    const { chromium } = await import('playwright'); browser = await chromium.launch({ headless: true });
    await mkdir(config.out, { recursive: true });
    async function context() { return browser.newContext(contextOptions); }
    async function login(page, account) {
      await page.goto(config.base + '/'); await page.locator('#auth input[name=email]').fill(account.email);
      await page.locator('#auth input[name=password]').fill(account.password);
      await page.locator('#auth button:not([type=button])').click(); await page.waitForURL('**/dashboard');
    }
    const anonymous = await context(), anon = await anonymous.newPage();
    check('staff SSR anonymous denial', (await anon.goto(config.base + '/admin/support/accounts')).status() === 404);
    let confirmPosts = 0;
    anon.on('request', r => { if (new URL(r.url()).pathname === '/api/auth/email/confirm') confirmPosts++; });
    await anon.goto(config.base + '/verify-email#token=' + s.verifyToken);
    await anon.getByText('Войдите в тот же аккаунт', { exact: false }).first().waitFor();
    check('fragment removed; GET does not consume proof', !new URL(anon.url()).hash && confirmPosts === 0);
    await anon.goto(config.base + '/forgot'); await anon.locator('input[name=email]').fill(s.accountA.email);
    const forgot = anon.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/forgot');
    await anon.getByRole('button', { name: 'Отправить инструкцию' }).click(); check('forgot uniform accepted', (await forgot).status() === 202);
    await anonymous.close();
    const customer = await context(), page = await customer.newPage();
    const widgetEvents = [];
    if (s.widgetMode === 'test') {
      await page.exposeFunction('__n5SyntheticWidgetEvent', event => widgetEvents.push(event));
      await page.route('https://support.test/**', route => {
        if (new URL(route.request().url()).pathname !== '/widget.js') return route.abort();
        return route.fulfill({ contentType: 'text/javascript', body: `/* SYNTHETIC fixture: official API shape only, no vendor history assertions. */
          window.Libredesk={
            show(){window.__n5SyntheticWidgetEvent({method:'show'});},
            setUser(jwt){const payload=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); window.__n5SyntheticWidgetEvent({method:'setUser',accountId:payload.external_user_id});},
            logout(){window.__n5SyntheticWidgetEvent({method:'logout'});},
            destroy(){window.__n5SyntheticWidgetEvent({method:'destroy'});}
          };` });
      });
    }
    await login(page, s.accountA);
    check('customer staff SSR denial', (await page.goto(config.base + '/admin/support/accounts')).status() === 404);
    await page.goto(config.base + '/verify-email#token=' + s.verifyToken);
    await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).waitFor();
    check('signed-in proof still needs explicit POST', confirmPosts === 0 && !new URL(page.url()).hash);
    const confirmed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/email/confirm');
    await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click(); check('explicit proof confirmation', (await confirmed).status() === 200);
    let sessions = 0;
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/support/session') sessions++; });
    await page.goto(config.base + '/support?videoId=' + s.videoId);
    await page.getByRole('button', { name: 'Показать контекст' }).waitFor(); check('page-open never requests JWT', sessions === 0);
    await page.getByRole('button', { name: 'Показать контекст' }).click(); await page.locator('.support-preview').waitFor();
    check('context copy gated by consent', await page.getByRole('button', { name: 'Скопировать контекст' }).isDisabled());
    const preview = JSON.parse(await page.locator('.support-preview').textContent());
    check('safe owned context projection', preview.videoId === s.videoId && Object.keys(preview).every(k => ['accountId','videoId','status','failureCode','at'].includes(k)));
    await page.goto(config.base + '/support?videoId=' + s.foreignVideoId);
    const foreign = page.waitForResponse(r => new URL(r.url()).pathname === '/api/support/context');
    await page.getByRole('button', { name: 'Показать контекст' }).click(); check('foreign context indistinguishable missing', (await foreign).status() === 404);
    for (const width of [360, 1440]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await customer.clearCookies({ name: 'n5_theme' });
      if (theme === 'light') await customer.addCookies([{ name: 'n5_theme', value: 'light', url: config.base }]);
      for (const route of ['/support', '/verify-email', '/forgot', '/reset']) {
        await page.goto(config.base + route); await page.locator('h1').waitFor();
        check(`theme ${theme} ${width} ${route}`, await page.locator('html').getAttribute('data-theme') === theme);
        report.findings.push(...(await domRules(page)).map(x => ({ ...x, route, width, theme })), ...(await axeRule(page)).map(x => ({ ...x, route, width, theme })));
        await page.screenshot({ path: resolve(config.out, `${theme}-${width}-${route.slice(1)}.png`), fullPage: true });
      }
    }
    await page.goto(config.base + '/support');
    if (s.widgetMode === 'test') {
      await page.getByText('СИНТЕТИЧЕСКИЙ СТЕНД', { exact: false }).waitFor();
      await page.getByRole('button', { name: 'Открыть анонимный чат' }).click();
      check('anonymous chat does not request JWT', sessions === 0);
      await page.getByLabel('Разрешаю представить мой аккаунт', { exact: false }).check();
      const identity = page.waitForResponse(r => new URL(r.url()).pathname === '/api/support/session');
      await page.getByRole('button', { name: 'Представить аккаунт в чате' }).click();
      check('explicit identified session', (await identity).status() === 200 && sessions === 1);
      await page.getByText('Аккаунт представлен в чате.', { exact: true }).waitFor();
      check('fixture receives immutable A identity', widgetEvents.some(e => e.method === 'setUser' && e.accountId === s.accountA.id));
      const beforeAnonymous = widgetEvents.length, beforeAnonymousSessions = sessions;
      await page.getByRole('button', { name: 'Открыть анонимный чат' }).click();
      await page.getByText('Чат открыт без передачи почты аккаунта.', { exact: true }).waitFor();
      const anonymousEvents = widgetEvents.slice(beforeAnonymous);
      check('identified A to anonymous logs out before show', anonymousEvents[0]?.method === 'logout' && anonymousEvents[1]?.method === 'show');
      check('anonymous transition requests no JWT and clears opt-in', sessions === beforeAnonymousSessions && !await page.getByLabel('Разрешаю представить мой аккаунт', { exact: false }).isChecked());
      await page.getByLabel('Разрешаю представить мой аккаунт', { exact: false }).check();
      await page.getByRole('button', { name: 'Представить аккаунт в чате' }).click();
      await page.getByText('Аккаунт представлен в чате.', { exact: true }).waitFor();
      check('A re-identification obtains fresh explicit session', sessions === 2);

    } else await page.getByText('Чат поддержки пока не подключён.', { exact: true }).waitFor();
    const beforeLogout = widgetEvents.length;
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click(); await page.waitForURL('**/#auth');
    if (s.widgetMode === 'test') check('official logout precedes account switch', widgetEvents.slice(beforeLogout).some(e => e.method === 'logout'));
    await login(page, s.accountB); await page.goto(config.base + '/support');
    check('account switch clears opt-in', !(await page.getByLabel('Разрешаю представить мой аккаунт', { exact: false }).isChecked()));
    if (s.widgetMode === 'test') {
      await page.getByLabel('Разрешаю представить мой аккаунт', { exact: false }).check();
      await page.getByRole('button', { name: 'Представить аккаунт в чате' }).click(); await page.getByText('Аккаунт представлен в чате.', { exact: true }).waitFor();
      check('second account obtains separate explicit session', sessions === 3);
      const identities = widgetEvents.filter(e => e.method === 'setUser');
      check('synthetic second identity differs from A', identities.length === 3 && identities[0].accountId === s.accountA.id && identities[1].accountId === s.accountA.id && identities[2].accountId === s.accountB.id);
      await page.goto(config.base + '/support');
      await page.route('https://support.test/widget.js', route => route.abort());
      await page.getByRole('button', { name: 'Открыть анонимный чат' }).click();
      await page.getByRole('alert').filter({ hasText: 'Не удалось загрузить чат' }).waitFor();
      check('SDK failure has visible fallback', await page.getByText('Адрес поддержки пока не настроен.', { exact: false }).isVisible());
    }
    await customer.close();
    const operator = await context(), staff = await operator.newPage(); await login(staff, s.operator);
    check('enrolled operator SSR access', (await staff.goto(config.base + '/admin/support/accounts')).status() === 200);
    await staff.locator('.support-records').waitFor(); check('staff page bounded 25', await staff.locator('.support-records > li').count() <= 25);
    await staff.getByLabel('Точная почта или UUID').fill(s.accountA.email);
    const search = staff.waitForRequest(r => new URL(r.url()).pathname === '/api/admin/support/search');
    await staff.getByRole('button', { name: 'Найти', exact: true }).click(); const searched = await search;
    check('staff exact search uses POST body', searched.method() === 'POST' && JSON.parse(searched.postData()).query === s.accountA.email && !new URL(staff.url()).search);
    await staff.getByRole('link', { name: s.accountA.email, exact: true }).click(); await staff.getByRole('heading', { name: 'Баланс', exact: true }).waitFor();
    check('staff diagnostics read-only', await staff.getByRole('button').count() === 0);
    for (const width of [360, 1440]) for (const theme of ['dark', 'light']) {
      await staff.setViewportSize({ width, height: 900 });
      await operator.clearCookies({ name: 'n5_theme' });
      if (theme === 'light') await operator.addCookies([{ name: 'n5_theme', value: 'light', url: config.base }]);
      for (const [kind, route] of [['list', '/admin/support/accounts'], ['card', '/admin/support/accounts/' + s.accountA.id]]) {
        await staff.goto(config.base + route);
        if (kind === 'card') await staff.getByRole('heading', { name: 'Баланс', exact: true }).waitFor();
        else await staff.locator('.support-records').waitFor();
        check(`staff theme ${theme} ${width} ${kind}`, await staff.locator('html').getAttribute('data-theme') === theme);
        report.findings.push(...(await domRules(staff)).map(x => ({ ...x, route, width, theme })), ...(await axeRule(staff)).map(x => ({ ...x, route, width, theme })));
        await staff.screenshot({ path: resolve(config.out, `staff-${kind}-${theme}-${width}.png`), fullPage: true });
      }
    }
    await operator.close();
    const reset = await context(), resetPage = await reset.newPage();
    await resetPage.goto(config.base + '/reset#token=' + s.resetToken); await resetPage.locator('input[name=password]').fill(s.newPassword);
    await resetPage.locator('input[name=repeat]').fill(s.newPassword);
    check('reset fragment removed', !new URL(resetPage.url()).hash);
    const resetResponse = resetPage.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/reset');
    await resetPage.getByRole('button', { name: 'Сменить пароль' }).click(); check('explicit reset requires ordinary login', (await resetResponse).status() === 200);
    await resetPage.getByText('Пароль изменён. Войдите с новым паролем.', { exact: true }).waitFor(); await reset.close();
  } catch { report.errors.push('Проверка support journey не завершена; чувствительные URL и данные исключены.'); }
  finally { await browser?.close(); }
  report.finishedAt = new Date().toISOString();
  const code = report.errors.length ? 2 : report.findings.some(x => x.severity === 'error') || report.checks.some(x => !x.pass) ? 1 : 0;
  if (config?.out) { await mkdir(config.out, { recursive: true }); await writeFile(resolve(config.out, 'report.json'), JSON.stringify({ ...report, code }, null, 2), { mode: 0o600 }); }
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = process.env.N5_PLAYWRIGHT_CONTAINER ? await runContainer('support', process.argv.slice(2)) : await main(process.argv.slice(2));
