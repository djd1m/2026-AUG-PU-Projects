export type Auth = { access: string; refresh: string; email: string; userId?: string } | null;

const KEY = 'grelka-auth';

export function loadAuth(): Auth {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveAuth(a: Auth): void {
  if (a === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(a));
}

export async function call(path: string, body: unknown, auth: Auth): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth?.access ? { Authorization: `Bearer ${auth.access}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

export async function get(path: string, auth: Auth): Promise<unknown> {
  const res = await fetch(path, { headers: auth?.access ? { Authorization: `Bearer ${auth.access}` } : {} });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}
