export type PublicSupport = { mode: 'disabled' | 'test' | 'libredesk'; baseURL: string | null; inboxID: string | null; identifiedEnabled: boolean; contactEmail: string | null; synthetic: boolean };
export type SupportAccount = { id: string; email: string; verified: boolean } | null;
export type SafeContext = { accountId?: string; videoId?: string; status?: string; failureCode?: string; at: string };
export type WidgetAPI = { show(): void; hide?(): void; setUser(jwt: string): void; logout(): void; destroy?(): void };
declare global { interface Window { Libredesk?: WidgetAPI; n5SupportUnavailable?: boolean; LibredeskSettings?: { baseURL: string; inboxID: string; hideLauncher: boolean }; } }
export class SupportError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function supportRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new SupportError(0, 'network', 'Нет связи с сервером. Повторите позже.'); }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new SupportError(response.status, value?.error?.code ?? 'unavailable',
    response.status === 404 ? 'Данные недоступны.' : response.status === 401 ? 'Войдите в аккаунт и повторите действие.' : value?.error?.message ?? 'Сервис временно недоступен.');
  return value as T;
}
// Only the fragment is read. Clear it before any asynchronous work, never persist it.
export function takeFragmentToken(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string {
  const fragment = location.hash;
  if (fragment) history.replaceState(null, '', location.pathname + location.search);
  const token = new URLSearchParams(fragment.replace(/^#/, '')).get('token') ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
export const validPassword = (password: string) => password.length >= 8 && new TextEncoder().encode(password).length <= 72;
export function clearSupportIdentity(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);
  const failed = () => {
    window.n5SupportUnavailable = true;
    try { window.Libredesk?.destroy?.(); } catch {}
    delete window.Libredesk;
    return false;
  };
  let cleanup: void;
  try { cleanup = window.Libredesk?.logout(); }
  catch { failed(); }
  finally {
    delete window.LibredeskSettings;
    window.dispatchEvent(new Event('n5:support-clear'));
  }
  // Official SDKs may return a promise even though older APIs declare logout as void.
  return Promise.resolve(cleanup).then(() => !window.n5SupportUnavailable, failed);
}
export function loadSupportWidget(settings: PublicSupport): Promise<WidgetAPI> {
  if (settings.mode === 'disabled' || !settings.baseURL || !settings.inboxID) return Promise.reject(new Error('Чат поддержки пока не подключён.'));
  if (window.n5SupportUnavailable) return Promise.reject(new Error('Не удалось очистить чат. Перезагрузите страницу перед новым обращением.'));
  return new Promise((resolve, reject) => {
    const script = window.Libredesk ? null : document.createElement('script');
    const baseURL = new URL(settings.baseURL!);
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer); observer.disconnect();
      if (script) { script.onload = null; script.onerror = null; }
    };
    const fail = () => {
      if (settled) return; settled = true; cleanup();
      script?.remove(); delete window.LibredeskSettings;
      reject(new Error('Не удалось загрузить чат. Используйте доступный способ связи ниже.'));
    };
    const ready = () => {
      if (settled) return;
      const api = window.Libredesk, frame = document.getElementById(`libredesk-widget-${settings.inboxID}`);
      if (!api || typeof api.show !== 'function' || typeof api.setUser !== 'function' || typeof api.logout !== 'function'
        || frame?.tagName !== 'IFRAME' || !frame.isConnected) return;
      // The SDK creates its iframe asynchronously after loading widget.js; show() is a no-op before that.
      let source: URL;
      try { source = new URL((frame as HTMLIFrameElement).src); } catch { return; }
      if (source.origin !== baseURL.origin || source.pathname !== '/widget' || source.searchParams.get('inbox_id') !== settings.inboxID) return;
      settled = true; cleanup(); resolve(api);
    };
    const observer = new MutationObserver(ready);
    const timer = setTimeout(fail, 8000);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ready();
    if (script && !settled) {
      window.LibredeskSettings = { baseURL: settings.baseURL!, inboxID: settings.inboxID!, hideLauncher: true };
      script.src = new URL('/widget.js', settings.baseURL!).href; script.async = true; script.referrerPolicy = 'no-referrer';
      script.onload = ready; script.onerror = fail; document.head.append(script);
    }
  });
}

// Shared anonymous transition, also exercised by the widget regression fixture.
export async function openAnonymousSupport(settings: PublicSupport, epoch: { current: number }): Promise<boolean> {
  const cleanup = clearSupportIdentity();
  // The synchronous clear event resets opt-in and advances the epoch intentionally.
  const version = epoch.current;
  if (!await cleanup) throw new Error('Не удалось очистить чат. Перезагрузите страницу перед новым обращением.');
  if (epoch.current !== version) return false;
  const widget = await loadSupportWidget(settings);
  if (epoch.current !== version) return false;
  widget.show();
  return true;
}

// Hide only: the vendor retains the current conversation and unsent draft.
export function closeSupportWidget(opener: Pick<HTMLElement, 'focus'> | null): void {
  const widget = window.Libredesk;
  if (!widget?.hide) throw new Error('Не удалось закрыть чат. Повторите действие.');
  widget.hide();
  opener?.focus();
}
