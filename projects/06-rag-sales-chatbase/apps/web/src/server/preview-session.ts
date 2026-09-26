// Предпросмотр без входа (фича preview-flow): два cookie и их хэши. Написано заново (ADR-016); форма cookie —
// как у __Host-n6_session (auth-handler.ts, донор N5).
//  • __Host-n6_browser — сессия браузера: ключ квоты preview_session (канон §7). В БД — только HMAC.
//  • __Host-n6_preview — токен предпросмотра (FR-PREVIEW-001: HttpOnly на 24 ч). В БД — только HMAC (token_hash).
// Токен в адрес НЕ попадает (ни в путь, ни в query): адрес уходит в журналы и Referer. В адресе — index_job_id
// (SC-US-001-1), который доступа не даёт.
import { createHmac, randomBytes } from 'node:crypto';
import { PREVIEW_TTL_HOURS } from '@n6/rag';

export const PREVIEW_COOKIE = '__Host-n6_preview';
export const BROWSER_COOKIE = '__Host-n6_browser';
const BROWSER_TTL_SECONDS = 30 * 24 * 60 * 60;
export const PREVIEW_TTL_SECONDS = PREVIEW_TTL_HOURS * 60 * 60;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function readCookie(request: Request, name: string): string | null {
  const value = request.headers.get('cookie')?.split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1);
  return value && TOKEN.test(value) ? value : null;
}
export const newToken = () => randomBytes(32).toString('base64url');
// Назначение входит в HMAC: хэш сессии браузера не годится как хэш токена предпросмотра и наоборот.
export const tokenHash = (secret: string, kind: 'browser' | 'preview', token: string) =>
  createHmac('sha256', secret).update(`${kind}:${token}`).digest('hex');

const cookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const previewCookie = (token: string) => cookie(PREVIEW_COOKIE, token, PREVIEW_TTL_SECONDS);
export const clearPreviewCookie = () => cookie(PREVIEW_COOKIE, '', 0);
export const browserCookie = (token: string) => cookie(BROWSER_COOKIE, token, BROWSER_TTL_SECONDS);

// Адрес с лендинга: «stomatologia-ulybka.ru» → https://…; форму и сеть проверяет CheckAddress, здесь — только длина.
export const SITE_URL_MAX_CHARS = 2048;
export function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SITE_URL_MAX_CHARS || /\s/.test(trimmed)) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
// Имя черновика — хост без www. (bot.company_name 1…200 символов); владелец поменяет его в кабинете.
export function draftName(url: URL): string {
  const host = url.hostname.replace(/^www\./, '');
  return Array.from(host || 'Мой сайт').slice(0, 200).join('');
}

// Тело JSON с потолком по ФАКТИЧЕСКИ принятым байтам (заголовок Content-Length не доверяется).
export async function readJsonBody(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; code: 'too_large' | 'invalid' }> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return { ok: false, code: 'invalid' };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, code: 'invalid' };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return { ok: false, code: 'too_large' }; }
    chunks.push(value);
  }
  try { return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
  catch { return { ok: false, code: 'invalid' }; }
}
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
