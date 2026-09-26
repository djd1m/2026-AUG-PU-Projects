import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, loadFixture, preflight, exitCode } from './responsive/input.mjs';
import { domRules, textZoomRule, axeRule, lintCSS, FIRST_SCREEN_VIEWPORTS, firstScreenSelectors, firstScreenRule } from './responsive/rules.mjs';

export function scenarios(engine, devices, widths) {
  const names = engine === 'webkit' ? ['iPhone 13', 'iPhone SE'] : ['Pixel 7'];
  return [...names.map(name => ({ name, options: { ...devices[name] } })), ...widths.map(width => ({ name: `width-${width}`, options: {
    viewport: { width, height: width === 1440 ? 900 : 844 }, isMobile: width <= 430, hasTouch: width <= 430,
  } }))];
}
async function navigate(page, url) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (!response || response.status() >= 400) throw new Error(`Маршрут недоступен: HTTP ${response?.status() ?? 'нет ответа'}`);
  if (new URL(page.url()).pathname !== new URL(url).pathname) throw new Error('Неожиданное перенаправление маршрута');
}
export async function login(browser, base, fixture) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    for (let attempt = 0; attempt < 2; attempt++) {
      await navigate(page, base + '/');
      await page.locator('form.auth-card input[name=email]').fill(fixture.email);
      await page.locator('form.auth-card input[name=password]').fill(fixture.password);
      const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login', { timeout: 15000 });
      const [response] = await Promise.all([responsePromise, page.locator('form.auth-card button:not([type=button])').click()]);
      if (response.status() === 429 && attempt === 0) { await page.waitForTimeout(60000); continue; }
      if (response.status() >= 400) throw new Error(`Вход не удался: HTTP ${response.status()}`);
      try { await page.waitForURL('**/dashboard', { timeout: 15000 }); }
      catch { throw new Error('Вход не удался: нет перехода на /dashboard (форма/role=alert)'); }
      return await context.storageState();
    }
    throw new Error('Вход не удался: лимит частоты');
  } finally { await context.close(); }
}
// Theme is an OUTER dimension (A-2509-03): dark = no cookie (checks the default), light = cookie n5_theme=light.
// The cookie is Secure: a browser sends it only over https, so a --base http:// light run fails the precondition (code 2).
export const THEMES = ['dark', 'light'];
export async function themedContext(browser, options, theme, base) {
  const context = await browser.newContext(options);
  if (theme === 'light') await context.addCookies([{ name: 'n5_theme', value: 'light', url: base }]);
  return context;
}
export async function themePrecondition(page, theme) {
  const applied = await page.evaluate(() => document.documentElement.dataset.theme);
  if (applied !== theme) throw new Error(`Тема не применена — проверка не выполнена (ожидалась ${theme}, на странице ${applied ?? 'нет'})`);
}
export async function routePreconditions(page, route) {
  if (route.startsWith('/dashboard/videos/')) {
    try { await page.locator('.clip-card').first().waitFor({ timeout: 15000 }); await page.locator('.clip-card video').first().waitFor({ timeout: 15000 }); }
    catch { throw new Error('Фикстура непригодна: нет карточки клипа или video'); }
  }
  if (route.startsWith('/g/') && await page.locator('article video').count() < 1) throw new Error('Фикстура непригодна: гостевая страница без доступного клипа');
}
export function summary(report) {
  const key = f => `${f.engine}|${f.scenario}|${f.route}|${f.selector}|${f.theme}`;
  const r2 = new Set(report.findings.filter(f => f.rule === 'R2').map(key));
  const rows = report.findings.filter(f => !(f.axeRule === 'target-size' && r2.has(key(f))));
  return `# Responsive check\n\nКод: ${exitCode(report)}; завершено страниц: ${report.pages.length}.\n\n` +
    report.errors.map(e => `НЕ ВЫПОЛНЕНО: ${e}\n`).join('') + '\n' + rows.map(f => `- ${f.severity} ${f.rule}${f.axeRule ? '/' + f.axeRule : ''} ${f.route ?? 'CSS'} ${f.engine ?? ''} ${f.theme ?? ''} ${f.width ?? ''} ${f.selector}: ${f.message} ${JSON.stringify(f.size ?? null)}`).join('\n') +
    '\n\nR2/axe target-size с одинаковым селектором объединены только в summary. Скриншоты — улики, не ассерт.\nОткрытие /c/ пишет link_view (не чаще раза в сутки на префикс); /g/ пишет guest_opened.\nR5 не проверяет input[type=file], checkbox, radio, hidden.\n';
}
export async function main(args, { launchOptions = {} } = {}) {
  const report = { startedAt: new Date().toISOString(), pages: [], findings: [], errors: [] };
  let options, fixture;
  try {
    options = parseArgs(args);
    report.configuration = { base: options.base, engines: options.engines, widths: options.widths, themes: THEMES };
    fixture = await loadFixture(options.fixture, options.base);
    await mkdir(options.out, { recursive: true });
    await preflight(options.engines, launchOptions);
    for (const file of ['apps/web/src/app/globals.css', 'apps/web/src/server/guest-page.ts', 'apps/web/src/server/short-link-handler.ts']) report.findings.push(...lintCSS(await readFile(file, 'utf8'), file));
    const playwright = await import('playwright');
    for (const engine of options.engines) {
      const browser = await playwright[engine].launch({ headless: true, ...launchOptions });
      try {
        const storageState = await login(browser, options.base, fixture);
        for (const theme of THEMES) {
          const probe = await themedContext(browser, {}, theme, options.base);
          try {
            const page = await probe.newPage();
            await navigate(page, options.base + '/');
            await themePrecondition(page, theme);
          } catch (error) {
            report.errors.push(`${engine} ${theme} /: ${safeError(error)}`);
            continue;
          } finally { await probe.close(); }
          for (const scenario of scenarios(engine, playwright.devices, options.widths)) {
            for (const route of fixture.routes) {
              const context = await themedContext(browser, { ...scenario.options, ...(route.startsWith('/dashboard') ? { storageState } : {}) }, theme, options.base);
              const meta = { engine, theme, scenario: scenario.name, route, width: scenario.options.viewport.width, height: scenario.options.viewport.height };
              try {
                const page = await context.newPage();
                await navigate(page, options.base + route);
                await routePreconditions(page, route);
                await themePrecondition(page, theme);
                const findings = [...await domRules(page), ...await axeRule(page)];
                if (scenario.name === 'width-390' && !route.startsWith('/dashboard')) findings.push(...await textZoomRule(page));
                const screenshot = `${engine}-${theme}-${scenario.name}-${report.pages.length}.png`;
                await page.screenshot({ path: resolve(options.out, screenshot), fullPage: true });
                report.findings.push(...findings.map(f => ({ ...meta, ...f })));
                report.pages.push({ ...meta, screenshot });
              } catch (error) {
                // Browser errors can contain page content/URLs: report only controlled diagnostics.
                report.errors.push(`${engine} ${theme} ${scenario.name} ${route}: ${safeError(error)}`);
              } finally { await context.close(); }
            }
          }
          for (const { w, h } of FIRST_SCREEN_VIEWPORTS) {
            for (const route of fixture.routes) {
              const selectors = firstScreenSelectors(route);
              if (!selectors.length) continue;
              const scenario = `first-screen-${w}x${h}`;
              const meta = { engine, theme, scenario, route, width: w, height: h };
              const context = await themedContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, theme, options.base);
              try {
                const page = await context.newPage();
                await navigate(page, options.base + route);
                await routePreconditions(page, route);
                await themePrecondition(page, theme);
                // Каждый селектор — отдельная проверка до любой прокрутки: одна не подменяет другую.
                const findings = [];
                for (const selector of selectors) findings.push(...await firstScreenRule(page, selector));
                const screenshot = `${engine}-${theme}-${scenario}-${report.pages.length}.png`;
                await page.screenshot({ path: resolve(options.out, screenshot), fullPage: false });
                report.findings.push(...findings.map(f => ({ ...meta, ...f })));
                report.pages.push({ ...meta, screenshot });
              } catch (error) {
                report.errors.push(`${engine} ${theme} ${scenario} ${route}: ${safeError(error)}`);
              } finally { await context.close(); }
            }
          }
        }
      } finally { await browser.close(); }
    }
  } catch (error) { report.errors.push(safeError(error)); }
  report.finishedAt = new Date().toISOString();
  const out = options?.out ?? '.responsive-artifacts';
  try {
    await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    await writeFile(resolve(out, 'summary.md'), summary(report));
  } catch { report.errors.push('Не удалось записать отчёт'); }
  for (const error of report.errors) console.error(`НЕ ВЫПОЛНЕНО: ${error}`);
  return exitCode(report);
}
function safeError(error) {
  const message = error instanceof Error ? error.message : '';
  return /^(Нужен|Неверные аргументы|Неизвестный движок|Некорректные ширины|--base должен|Фикстура|Браузер (chromium|webkit) недоступен|Маршрут недоступен|Неожиданное перенаправление|Вход не удался|Нет выборки текста|Тема не применена)/.test(message)
    ? message : 'Ошибка выполнения браузера/сети/файла; проверка не выполнена';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
