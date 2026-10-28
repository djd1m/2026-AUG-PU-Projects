import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeSupportWidget, clearSupportIdentity, openAnonymousSupport, loadSupportWidget, type PublicSupport, type WidgetAPI } from '../apps/web/src/lib/support-client';
import { SupportPanel } from '../apps/web/src/app/support/SupportPanel';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
type FakeBrowser = { Libredesk?: WidgetAPI; LibredeskSettings?: object; dispatchEvent?: ReturnType<typeof vi.fn> };
type FakeScript = { src?: string; referrerPolicy?: string; onload?: () => void; onerror?: () => void; remove: ReturnType<typeof vi.fn> };
const settings: PublicSupport = { mode: 'test', baseURL: 'https://support.test', inboxID: '00000000-0000-4000-8000-000000000001', identifiedEnabled: true, contactEmail: null, synthetic: true };
function widgetDOM(script: FakeScript = { remove: vi.fn() }, append = () => {}) {
  let frame: { id: string; tagName: string; isConnected: boolean; src: string; style: { display: string } } | null = null;
  let notify = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  vi.stubGlobal('document', { documentElement: {}, createElement: () => script,
    getElementById: (id: string) => id === frame?.id ? frame : null,
    head: { append } });
  return { disconnect, insert(src = `${settings.baseURL}/widget?inbox_id=${settings.inboxID}`, tagName = 'IFRAME', id = `libredesk-widget-${settings.inboxID}`) {
    frame = { id, tagName, isConnected: true, src, style: { display: 'none' } }; notify(); return frame;
  } };
}
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
    const dom = widgetDOM(script, () => { browser.Libredesk = api; queueMicrotask(() => { dom.insert(); script.onload?.(); }); });
    const loaded = await loadSupportWidget(settings);
    expect(script.src).toBe('https://support.test/widget.js'); expect(script.referrerPolicy).toBe('no-referrer');
    expect(browser.LibredeskSettings).toEqual({ baseURL: settings.baseURL, inboxID: settings.inboxID, hideLauncher: true });
    loaded.show(); loaded.setUser('SYNTHETIC_ACCOUNT_A'); clearSupportIdentity();
    expect(browser.LibredeskSettings).toBeUndefined(); loaded.setUser('SYNTHETIC_ACCOUNT_B'); loaded.show();
    expect(calls).toEqual(['show', 'SYNTHETIC_ACCOUNT_A', 'logout', 'SYNTHETIC_ACCOUNT_B', 'show']);
  });
  it('SDK load failures reject visibly and remove settings', async () => {
    const browser: FakeBrowser = {}, script: FakeScript = { remove: vi.fn() }; vi.stubGlobal('window', browser);
    widgetDOM(script, () => queueMicrotask(() => script.onerror?.()));
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
    const fetch = vi.fn(); vi.stubGlobal('window', browser); vi.stubGlobal('fetch', fetch); widgetDOM().insert();
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

describe('asynchronous vendor iframe readiness', () => {
  it('first click waits beyond script load, ignores wrong frames and shows once after owned insertion', async () => {
    vi.useFakeTimers();
    let frame: ReturnType<ReturnType<typeof widgetDOM>['insert']> | undefined;
    const show = vi.fn(() => { if (frame) frame.style.display = 'block'; });
    const browser: FakeBrowser = { dispatchEvent: vi.fn() }, script: FakeScript = { remove: vi.fn() };
    vi.stubGlobal('window', browser);
    const dom = widgetDOM(script, () => { browser.Libredesk = { show, setUser: vi.fn(), logout: vi.fn() }; script.onload?.(); });
    const opening = openAnonymousSupport(settings, { current: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(show).not.toHaveBeenCalled();
    dom.insert('https://unrelated.test/widget?inbox_id=' + settings.inboxID);
    dom.insert(settings.baseURL + '/widget?inbox_id=wrong');
    dom.insert(settings.baseURL + '/elsewhere?inbox_id=' + settings.inboxID);
    dom.insert(undefined, 'DIV');
    dom.insert(undefined, 'IFRAME', 'libredesk-widget-unrelated');
    await vi.advanceTimersByTimeAsync(100);
    expect(show).not.toHaveBeenCalled();
    frame = dom.insert();
    expect(await opening).toBe(true); expect(frame.style.display).toBe('block');
    dom.insert(); expect(show).toHaveBeenCalledTimes(1);
    expect(dom.disconnect).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(script.onload).toBeNull(); expect(script.onerror).toBeNull();
  });
  it('cached API waits for delayed iframe and preserves epoch cancellation', async () => {
    vi.useFakeTimers(); const epoch = { current: 0 }, show = vi.fn();
    vi.stubGlobal('window', { Libredesk: { show, setUser: vi.fn(), logout: vi.fn() }, dispatchEvent: vi.fn() });
    const dom = widgetDOM(); const opening = openAnonymousSupport(settings, epoch);
    await vi.advanceTimersByTimeAsync(0); expect(show).not.toHaveBeenCalled();
    epoch.current++; dom.insert(); expect(await opening).toBe(false);
    expect(show).not.toHaveBeenCalled(); expect(dom.disconnect).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])('times out and cleans up within total envelope (cached=%s)', async cached => {
    vi.useFakeTimers(); const api = { show: vi.fn(), setUser: vi.fn(), logout: vi.fn() };
    const browser: FakeBrowser = cached ? { Libredesk: api } : {}, script: FakeScript = { remove: vi.fn() };
    vi.stubGlobal('window', browser); const dom = widgetDOM(script);
    const loading = loadSupportWidget(settings);
    const rejected = expect(loading).rejects.toThrow('Не удалось загрузить чат');
    await vi.advanceTimersByTimeAsync(7000); browser.Libredesk = api; script.onload?.();
    dom.insert('https://unrelated.test/widget?inbox_id=' + settings.inboxID);
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(dom.disconnect).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(browser.LibredeskSettings).toBeUndefined();
    dom.insert(); expect(api.show).not.toHaveBeenCalled();
    if (!cached) { expect(script.remove).toHaveBeenCalledTimes(1); expect(script.onload).toBeNull(); expect(script.onerror).toBeNull(); }
  });
});

describe('chat close preserves the vendor session', () => {
  it('hides and returns focus without resetting identity or history; the same API can reopen', () => {
    const api = { hide: vi.fn(), show: vi.fn(), setUser: vi.fn(), logout: vi.fn(), destroy: vi.fn() };
    const focus = vi.fn(); vi.stubGlobal('window', { Libredesk: api });
    closeSupportWidget({ focus });
    expect(api.hide).toHaveBeenCalledTimes(1); expect(focus).toHaveBeenCalledTimes(1);
    api.show(); expect(api.show).toHaveBeenCalledTimes(1);
    expect(api.logout).not.toHaveBeenCalled(); expect(api.destroy).not.toHaveBeenCalled(); expect(api.setUser).not.toHaveBeenCalled();
  });
  it('describes human support and anonymous privacy even for a logged in account', () => {
    const html = renderToStaticMarkup(createElement(SupportPanel, { support: { ...settings, identifiedEnabled: false }, account: { id: 'A', email: 'private@example.test', verified: true } }));
    expect(html).toContain('Открыть чат поддержки'); expect(html).toContain('отвечает человек');
    expect(html).toContain('не передаёт туда почту'); expect(html).not.toContain('private@example.test');
    expect(html).not.toContain('Открыть анонимный чат');
  });
});

it('keeps the parent close control visible while the widget is open', () => {
  const source = readFileSync('apps/web/src/app/support/SupportPanel.tsx', 'utf8');
  expect(source).toMatch(/opened && <button[^>]*className="support-close"[^>]*onClick=\{close\}[^>]*aria-label="Закрыть чат поддержки"/);
  const css = readFileSync('apps/web/src/app/globals.css', 'utf8');
  expect(css).toMatch(/\.support-card > \.support-close \{[^}]*position:fixed;[^}]*z-index:2147483647;/);
});
