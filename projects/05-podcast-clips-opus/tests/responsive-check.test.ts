import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, validateFixture, exitCode } from '../scripts/responsive/input.mjs';
import { lintCSS, firstScreenSelector, firstScreenSelectors, FIRST_SCREEN_VIEWPORTS } from '../scripts/responsive/rules.mjs';
import { login, main, summary, themedContext, themePrecondition, THEMES } from '../scripts/check-responsive.mjs';

const fixture = { origin: 'http://localhost', email: 'fixture@example.test', password: 'never-log-this-password', video_id: 'video-1', short_code: 'short-1', clip_ids: ['clip-1'], screens: { guest: '/g/guest-1' } };
describe('responsive — без браузера', () => {
  it('разбирает матрицу и отвергает неверные аргументы', () => {
    expect(parseArgs(['--base', fixture.origin, '--fixture', 'f.json']).widths).toEqual([320, 360, 390, 414, 768, 1024, 1440]);
    for (const extra of [['--engines', 'firefox'], ['--widths', 'NaN'], ['--unknown', 'x'], ['--out']]) expect(() => parseArgs(['--base', fixture.origin, '--fixture', 'f.json', ...extra])).toThrow();
  });
  it('проверяет обязательные данные и запрещает чужой origin', () => {
    expect(validateFixture(fixture, fixture.origin).routes).toContain('/c/short-1');
    expect(() => validateFixture({ ...fixture, password: '' }, fixture.origin)).toThrow();
    expect(() => validateFixture({ ...fixture, screens: { guest: 'https://other.test/g/abc' } }, fixture.origin)).toThrow();
  });
  it('R7: чистый CSS и внедрённые 100vh/clamp(px), включая SSR', () => {
    expect(lintCSS('main {height:100svh;font-size:clamp(1rem,2vw,2rem)}', 'x.css')).toEqual([]);
    expect(lintCSS('main {height:100vh;font-size:clamp(12px,2vw,20px)}', 'x.css')).toHaveLength(2);
    expect(lintCSS('const x=`<style>main{height:100vh}</style>`', 'guest-page.ts')).toHaveLength(1);
    expect(lintCSS('// 100vh', 'x.ts')).toEqual([]);
  });
  it('коды 0/1/2 и приоритет НЕ ВЫПОЛНЕНО', () => {
    expect(exitCode({ errors: [], findings: [] })).toBe(0);
    expect(exitCode({ errors: [], findings: [{ severity: 'error' }] })).toBe(1);
    expect(exitCode({ errors: ['failed'], findings: [{ severity: 'error' }] })).toBe(2);
  });
  it('фикстура без пароля → 2, пароль не попадает в отчёт', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'responsive-input-'));
    try {
      const file = join(dir, 'fixture.json');
      await writeFile(file, JSON.stringify({ ...fixture, password: '' }));
      expect(await main(['--base', fixture.origin, '--fixture', file, '--out', dir])).toBe(2);
      expect(await readFile(join(dir, 'report.json'), 'utf8')).not.toContain(fixture.email);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('подставной путь браузера → 2 (без установленного движка)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'responsive-browser-'));
    try {
      const file = join(dir, 'fixture.json');
      await writeFile(file, JSON.stringify(fixture));
      expect(await main(['--base', fixture.origin, '--fixture', file, '--out', dir], { launchOptions: { executablePath: join(dir, 'missing-browser') } })).toBe(2);
      const report = await readFile(join(dir, 'report.json'), 'utf8');
      expect(report).not.toContain(fixture.password);
      expect(report).toContain('Браузер chromium недоступен');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('summary объединяет R2 и target-size по селектору, JSON остаётся полным', () => {
    const common = { engine: 'webkit', scenario: 'phone', route: '/', selector: '#small', severity: 'error', message: 'small' };
    const report = { errors: [], pages: [], findings: [{ ...common, rule: 'R2' }, { ...common, rule: 'R4', axeRule: 'target-size' }] };
    expect(summary(report)).not.toContain('R4/target-size');
    expect(report.findings).toHaveLength(2);
  });
});

describe('responsive — измерение темы', () => {
  it('summary: тема входит в ключ объединения R2/target-size', () => {
    const common = { engine: 'webkit', scenario: 'phone', route: '/', selector: '#small', severity: 'error', message: 'small' };
    const report = { errors: [], pages: [], findings: [{ ...common, theme: 'dark', rule: 'R2' }, { ...common, theme: 'light', rule: 'R4', axeRule: 'target-size' }] };
    expect(summary(report)).toContain('R4/target-size');
    expect(summary({ ...report, findings: [report.findings[0]!, { ...report.findings[1]!, theme: 'dark' }] })).not.toContain('R4/target-size');
    expect(summary(report)).toContain(' light ');
  });
  it('тёмная — без cookie, светлая — cookie n5_theme=light на --base', async () => {
    expect(THEMES).toEqual(['dark', 'light']);
    const added: unknown[] = [];
    const browser = { newContext: async (o: unknown) => ({ o, addCookies: async (c: unknown[]) => { added.push(...c); } }) };
    await themedContext(browser, { viewport: { width: 1, height: 1 } }, 'dark', 'https://x.test');
    expect(added).toEqual([]);
    const context = await themedContext(browser, { storageState: { cookies: [] } }, 'light', 'https://x.test');
    expect(added).toEqual([{ name: 'n5_theme', value: 'light', url: 'https://x.test' }]);
    expect(context.o).toEqual({ storageState: { cookies: [] } });
  });
  it('предусловие: не та тема на странице → ошибка «не выполнена», не зелёный', async () => {
    const page = (theme: string | undefined) => ({ evaluate: async () => theme });
    await expect(themePrecondition(page('dark'), 'dark')).resolves.toBeUndefined();
    await expect(themePrecondition(page('light'), 'light')).resolves.toBeUndefined();
    for (const [applied, expected] of [['dark', 'light'], ['light', 'dark'], [undefined, 'dark'], ['', 'light']] as const)
      await expect(themePrecondition(page(applied), expected)).rejects.toThrow('Тема не применена — проверка не выполнена');
  });
});

// Execute the seed with an HTTP transport stub; no service/socket is required.
it('seed: link.create один раз, немедленное сохранение, без повторной загрузки', async () => {
  const { spawn } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'responsive-seed-'));
  const file = join(dir, 'fixture.json'), preload = join(dir, 'transport.mjs'), log = join(dir, 'calls.json');
  try {
    await writeFile(file, JSON.stringify({ ...fixture, short_code: undefined, screens: {} }));
    await writeFile(log, '[]');
    await writeFile(preload, `
      import { readFileSync, writeFileSync } from 'node:fs';
      globalThis.fetch = async url => {
        const path = new URL(url).pathname;
        const calls = JSON.parse(readFileSync(process.env.CALL_LOG, 'utf8'));
        calls.push(path); writeFileSync(process.env.CALL_LOG, JSON.stringify(calls));
        if (path === '/api/auth/login') return new Response('{}', { headers: { 'set-cookie': 'session=test; Path=/' } });
        let data = {};
        if (path === '/api/trpc/video.get') data = { status: 'done' };
        if (path === '/api/trpc/clip.list') data = [{ clip_id: 'clip-1' }];
        if (path === '/api/trpc/link.create') data = { code: 'saved-code', url: '/c/saved-code' };
        if (path === '/api/trpc/guest.create') {
          if (process.env.FAIL_GUEST === '1') return new Response('{}', { status: 500 });
          data = { guest_pack_id: 'pack-1', url: '/g/guest-1' };
        }
        if (path === '/api/trpc/guest.send') {
          if (process.env.FAIL_GUEST === 'send') return new Response('{}', { status: 500 });
          data = { url: '/g/guest-1' };
        }
        return new Response(JSON.stringify({ result: { data: { data } } }));
      };
    `);
    const run = (fail: boolean | 'send') => new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', preload, 'scripts/seed-ui-fixture.mjs', '/does-not-exist.mp4', file], {
        env: { ...process.env, BASE: fixture.origin, ORIGIN: fixture.origin, CALL_LOG: log, FAIL_GUEST: fail === 'send' ? 'send' : fail ? '1' : '0' }, stdio: 'ignore',
      });
      child.on('error', reject); child.on('exit', resolve);
    });
    expect(await run(true)).toBe(1);
    expect(JSON.parse(await readFile(file, 'utf8')).short_code).toBe('saved-code');
    expect(await run('send')).toBe(1);
    const partial = JSON.parse(await readFile(file, 'utf8'));
    expect(partial.guest_pack_id).toBe('pack-1');
    expect(partial.screens?.guest).toBeUndefined();
    expect(await run(false)).toBe(0);
    const beforeRepeat = JSON.parse(await readFile(log, 'utf8'));
    expect(await run(false)).toBe(0);
    const afterRepeat: string[] = JSON.parse(await readFile(log, 'utf8'));
    expect(afterRepeat.slice(beforeRepeat.length)).not.toContain('/api/trpc/guest.create');
    expect(afterRepeat.slice(beforeRepeat.length)).not.toContain('/api/trpc/guest.send');
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.short_code).toBe('saved-code');
    expect(saved.guest_pack_id).toBe('pack-1');
    expect(saved.screens.guest).toBe('/g/guest-1');
    expect(saved.screens).not.toHaveProperty('short_links');
    const calls: string[] = JSON.parse(await readFile(log, 'utf8'));
    expect(calls.filter(p => p === '/api/trpc/link.create')).toHaveLength(1);
    expect(calls.filter(p => p === '/api/trpc/guest.create')).toHaveLength(2); // failed create + successful create
    expect(calls.filter(p => p === '/api/trpc/guest.send')).toHaveLength(2); // failed send + resumed send
    expect(calls).not.toContain('/api/trpc/video.create');
    expect(calls).not.toContain('/api/upload/complete');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('вход: максимум один повтор после 429, storageState и закрытие контекста', async () => {
  let attempts = 0, closed = 0;
  const waits: number[] = [];
  const page = {
    goto: async () => ({ status: () => 200 }), url: () => fixture.origin + '/',
    locator: () => ({ fill: async () => {}, click: async () => {} }),
    waitForResponse: async () => { const status = ++attempts === 1 ? 429 : 200; return { status: () => status }; },
    waitForTimeout: async (ms: number) => { waits.push(ms); },
    waitForURL: async (pattern: string) => { expect(pattern).toBe('**/dashboard'); },
  };
  const browser = { newContext: async () => ({ newPage: async () => page,
    storageState: async () => ({ cookies: ['session'] }), close: async () => { closed++; } }) };
  expect(await login(browser, fixture.origin, fixture)).toEqual({ cookies: ['session'] });
  expect(attempts).toBe(2); expect(waits).toEqual([60000]); expect(closed).toBe(1);
  attempts = 0;
  page.waitForResponse = async () => { attempts++; return { status: () => 429 }; };
  await expect(login(browser, fixture.origin, fixture)).rejects.toThrow('HTTP 429');
  expect(attempts).toBe(2);
});

it('R9: explicit route and viewport coverage', () => {
  expect(firstScreenSelector('/')).toEqual(['.landing-cta', '.landing-demo video']);
  expect(firstScreenSelectors('/')).toEqual(['.landing-cta', '.landing-demo video']);
  expect(firstScreenSelectors('/c/abc')).toEqual(['.cta']);
  expect(firstScreenSelectors('/dashboard')).toEqual([]);
  expect(firstScreenSelector('/c/abc')).toBe('.cta');
  for (const route of ['/c/', '/g/x', '/dashboard']) expect(firstScreenSelector(route)).toBeNull();
  expect(FIRST_SCREEN_VIEWPORTS).toEqual([{ w: 390, h: 844 }, { w: 375, h: 667 }, { w: 360, h: 740 }]);
});
it('R9 экран записи (фича 29): панель действий первой карточки; прогон первого экрана несёт вход', async () => {
  const id = '8f0c2a4e-1b2c-4d5e-8f90-123456789abc';
  expect(firstScreenSelectors(`/dashboard/videos/${id}`)).toEqual(['.clip-card:first-of-type .clip-actions']);
  for (const route of ['/dashboard/videos/', `/dashboard/videos/${id}/x`, `/videos/${id}`, `/dashboard/videos/${id}?a=1`]) expect(firstScreenSelector(route)).toBeNull();
  // Страж по исходнику: цикл FIRST_SCREEN_VIEWPORTS создаёт контекст СО storageState для /dashboard —
  // без него R9 экрана записи проверил бы форму входа (или упал бы на ней), а не экран записи.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('scripts/check-responsive.mjs', 'utf8');
  const loop = source.slice(source.indexOf('for (const { w, h } of FIRST_SCREEN_VIEWPORTS)'));
  const creation = loop.slice(0, loop.indexOf('try {'));
  expect(creation).toMatch(/themedContext\(browser, \{[^;]*route\.startsWith\('\/dashboard'\) \? \{ storageState \} : \{\}/);
});
