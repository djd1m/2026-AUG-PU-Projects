import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { domRules, axeRule, textZoomRule } from '../../scripts/responsive/rules.mjs';
import { preflight } from '../../scripts/responsive/input.mjs';
import { chromium, webkit, type Browser, type Page } from 'playwright';
let server: Server;
let base: string;
beforeAll(async () => {
  // Loud failure, never a skip: this suite only runs in the Playwright container.
  try { await preflight(['chromium', 'webkit']); }
  catch (error) { throw new Error(`НЕ ВЫПОЛНЕНО: ${String(error)}`); }
  server = createServer(async (req, res) => {
    const name = (req.url ?? '').slice(1);
    if (!/^[a-z0-9-]+\.html$/.test(name)) { res.writeHead(404).end(); return; }
    try { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(await readFile(resolve('tests/fixtures/responsive', name))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Нет loopback порта');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
for (const [name, engine] of Object.entries({ chromium, webkit })) describe(name, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await engine.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function fixture(name: string, run: (page: Page) => Promise<void>) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try { const page = await context.newPage(); await page.goto(`${base}/${name}.html`); await run(page); }
    finally { await context.close(); }
  }
  it('чистая страница: все отказы отсутствуют', () => fixture('clean', async page => {
    expect([...await domRules(page), ...await axeRule(page), ...await textZoomRule(page)].filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
  }));
  for (const rule of ['R1', 'R2', 'R5']) it(`${rule}: внедрённый дефект`, () => fixture(rule.toLowerCase(), async page => {
    const found = await domRules(page, ['R1', 'R2', 'R5']);
    expect([...new Set(found.map((f: { rule: string }) => f.rule))]).toEqual([rule]);
  }));
  it('R4: контраст', () => fixture('r4', async page => {
    expect((await axeRule(page)).some((f: { axeRule: string; severity: string }) => f.axeRule === 'color-contrast' && f.severity === 'error')).toBe(true);
  }));
  it('R4: теги сохраняются при явном target-size', () => fixture('r4-both', async page => {
    const ids = (await axeRule(page)).map((f: { axeRule: string }) => f.axeRule);
    expect(ids).toContain('color-contrast'); expect(ids).toContain('target-size');
  }));
  it('R8: rem растёт и переполняет только на 200%', () => fixture('r8-rem', async page => {
    expect(await domRules(page, ['R1'])).toEqual([]);
    const found = await textZoomRule(page);
    expect(found.map((f: { message: string }) => f.message)).toEqual(['Скролл при 200%']);
  }));
  it('R8: px не растёт', () => fixture('r8-px', async page => {
    expect((await textZoomRule(page)).some((f: { message: string }) => f.message === 'Текст не масштабируется')).toBe(true);
  }));
  it('карусель, checkbox+label, inline p/li и disabled — без ложных отказов', () => fixture('geometry', async page => {
    expect(await domRules(page, ['R1', 'R2'])).toEqual([]);
  }));
  it('R3: прокрутка перед hit-test', () => fixture('r3', async page => {
    expect(await domRules(page, ['R3'])).toEqual([]);
  }));
  for (const fallback of [false, true]) it(`details: закрытые цели исключены, открытые проверяются (fallback=${fallback})`, () => fixture('clean', async page => {
    await page.setContent(`
      <style>
        summary { width: 200px; height: 44px; }
        #content { position: relative; }
        #small { width: 20px; height: 20px; padding: 0; }
        #field { font-size: 14px; width: 150px; height: 44px; }
        #cover { position: absolute; inset: 0; z-index: 1; }
      </style>
      <details><summary><span>Настройки</span></summary><div id="content">
        <button id="small">X</button><input id="field" type="text"><div id="cover"></div>
      </div></details>`);
    if (fallback) await page.evaluate(() => Object.defineProperty(Element.prototype, 'checkVisibility', { value: undefined, configurable: true }));
    expect(await domRules(page, ['R2', 'R3', 'R5'])).toEqual([]);
    // The visible summary must remain an interactive target even when details is closed.
    await page.locator('summary').evaluate(el => { el.style.height = '20px'; });
    expect((await domRules(page, ['R2'])).map((f: { rule: string }) => f.rule)).toEqual(['R2']);
    await page.locator('summary').evaluate(el => { el.style.height = '44px'; });
    await page.locator('details').evaluate(el => { el.setAttribute('open', ''); });
    const found = await domRules(page, ['R2', 'R3', 'R5']);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R2' && f.selector === '#small')).toBe(true);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R3' && f.selector === '#small')).toBe(true);
    expect(found.some((f: { rule: string; selector: string }) => f.rule === 'R5' && f.selector === '#field')).toBe(true);
  }));
  it('tabindex=-1 исключён, tabindex=0 проверяется', () => fixture('clean', async page => {
    await page.setContent('<div id="target" tabindex="-1" style="width:44px;height:44px"></div><div style="position:absolute;inset:0"></div>');
    expect(await domRules(page, ['R3'])).toEqual([]);
    await page.locator('#target').evaluate(el => { el.setAttribute('tabindex', '0'); });
    expect((await domRules(page, ['R3'])).map((f: { rule: string }) => f.rule)).toEqual(['R3']);
  }));
  it('R6: высокое превью — предупреждение', () => fixture('r6', async page => {
    expect((await domRules(page, ['R6'])).map((f: { severity: string }) => f.severity)).toEqual(['warning']);
  }));
});
