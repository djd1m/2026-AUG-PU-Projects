import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clearSupportIdentity, openAnonymousSupport, loadSupportWidget, type PublicSupport, type WidgetAPI } from '../apps/web/src/lib/support-client';
import { SupportPanel } from '../apps/web/src/app/support/SupportPanel';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
type FakeBrowser = { Libredesk?: WidgetAPI; LibredeskSettings?: object; dispatchEvent?: ReturnType<typeof vi.fn> };
type FakeScript = { src?: string; referrerPolicy?: string; onload?: () => void; onerror?: () => void; remove: ReturnType<typeof vi.fn> };
const settings: PublicSupport = { mode: 'test', baseURL: 'https://support.test', inboxID: '00000000-0000-4000-8000-000000000001', identifiedEnabled: true, contactEmail: null, synthetic: true };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('official widget API-shaped synthetic fixture', () => {
  it('disabled mode creates no script or identity request', async () => {
    const createElement = vi.fn(), fetch = vi.fn(); vi.stubGlobal('document', { createElement }); vi.stubGlobal('fetch', fetch);
    await expect(loadSupportWidget({ ...settings, mode: 'disabled' })).rejects.toThrow('не подключён');
    expect(createElement).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('uses configured official widget.js and anonymous settings; separate A/B identities clear', async () => {
    const calls: string[] = [], api = { show: () => calls.push('show'), setUser: (jwt: string) => calls.push(jwt), logout: () => calls.push('logout') };
    const browser: FakeBrowser = { dispatchEvent: vi.fn() }, script: FakeScript = { remove: vi.fn() };
    vi.stubGlobal('window', browser);
    vi.stubGlobal('document', { createElement: () => script, head: { append: () => { browser.Libredesk = api; queueMicrotask(() => script.onload?.()); } } });
    const loaded = await loadSupportWidget(settings);
    expect(script.src).toBe('https://support.test/widget.js'); expect(script.referrerPolicy).toBe('no-referrer');
    expect(browser.LibredeskSettings).toEqual({ baseURL: settings.baseURL, inboxID: settings.inboxID, hideLauncher: true });
    loaded.show(); loaded.setUser('SYNTHETIC_ACCOUNT_A'); clearSupportIdentity();
    expect(browser.LibredeskSettings).toBeUndefined(); loaded.setUser('SYNTHETIC_ACCOUNT_B'); loaded.show();
    expect(calls).toEqual(['show', 'SYNTHETIC_ACCOUNT_A', 'logout', 'SYNTHETIC_ACCOUNT_B', 'show']);
  });
  it('SDK load failures reject visibly and remove settings', async () => {
    const browser: FakeBrowser = {}, script: FakeScript = { remove: vi.fn() }; vi.stubGlobal('window', browser);
    vi.stubGlobal('document', { createElement: () => script, head: { append: () => queueMicrotask(() => script.onerror?.()) } });
    await expect(loadSupportWidget(settings)).rejects.toThrow('Не удалось загрузить чат'); expect(script.remove).toHaveBeenCalled(); expect(browser.LibredeskSettings).toBeUndefined();
  });
  it('vendor logout exception still clears local identity and broadcasts invalidation', () => {
    const browser: FakeBrowser = { Libredesk: { show: vi.fn(), setUser: vi.fn(), logout: () => { throw new Error(); } }, LibredeskSettings: {}, dispatchEvent: vi.fn() }; vi.stubGlobal('window', browser);
    expect(() => clearSupportIdentity()).not.toThrow(); expect(browser.LibredeskSettings).toBeUndefined(); expect(browser.dispatchEvent).toHaveBeenCalled();
  });
  it('SSR never loads SDK or requests JWT and leaves opt-in/copy unchecked', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const html = renderToStaticMarkup(createElement(SupportPanel, { support: settings, account: { id: 'synthetic-A', email: 'a@example.test', verified: true } }));
    expect(fetch).not.toHaveBeenCalled(); expect(html).toContain('СИНТЕТИЧЕСКИЙ СТЕНД'); expect(html).not.toContain('checked=""'); expect(html).not.toContain('<script'); expect(html).toContain('10 часов'); expect(html).toContain('Представить аккаунт в чате');
  });
});

describe('identified to anonymous transition', () => {
  it('logs out identified A, clears opt-in and then shows anonymous without requesting JWT', async () => {
    const calls: string[] = [], epoch = { current: 0 }; let identity: string | null = 'A', optedIn = true;
    const api: WidgetAPI = { setUser: vi.fn(), logout: () => { calls.push('logout'); identity = null; }, show: () => { calls.push('show'); expect(identity).toBeNull(); } };
    const browser: FakeBrowser = { Libredesk: api, LibredeskSettings: {}, dispatchEvent: vi.fn(() => { epoch.current++; optedIn = false; }) };
    const fetch = vi.fn(); vi.stubGlobal('window', browser); vi.stubGlobal('fetch', fetch);
    expect(await openAnonymousSupport(settings, epoch)).toBe(true);
    expect(calls).toEqual(['logout', 'show']); expect(optedIn).toBe(false); expect(browser.LibredeskSettings).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses show and success after an asynchronous logout failure', async () => {
    const show = vi.fn(), epoch = { current: 0 };
    const browser: FakeBrowser = { Libredesk: { setUser: vi.fn(), logout: () => Promise.reject(new Error('vendor cleanup failed')), show }, LibredeskSettings: {}, dispatchEvent: vi.fn(() => { epoch.current++; }) };
    vi.stubGlobal('window', browser);
    await expect(openAnonymousSupport(settings, epoch)).rejects.toThrow('Не удалось очистить чат');
    expect(show).not.toHaveBeenCalled(); expect(browser.LibredeskSettings).toBeUndefined();
  });
  it('cancels when another authority event occurs while official logout is pending', async () => {
    let finish: (() => void) | undefined; const epoch = { current: 0 }, show = vi.fn();
    const cleanup = new Promise<void>(resolve => { finish = resolve; });
    vi.stubGlobal('window', { Libredesk: { setUser: vi.fn(), logout: () => cleanup, show }, dispatchEvent: () => { epoch.current++; } });
    const opening = openAnonymousSupport(settings, epoch); epoch.current++; finish?.();
    expect(await opening).toBe(false); expect(show).not.toHaveBeenCalled();
  });
});
