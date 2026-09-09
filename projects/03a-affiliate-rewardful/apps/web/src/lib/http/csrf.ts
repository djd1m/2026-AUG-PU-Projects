import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSessionToken } from '../auth/session';
import { HttpError } from './errors';
export const ANONYMOUS_COOKIE = '__Host-n3a_anonymous';
export const CSRF_TTL_SECONDS = 1_800;
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 8_192) throw new HttpError(422, 'invalid_input');
  const values = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length > 1) throw new HttpError(422, 'invalid_input');
  return values[0]?.slice(name.length + 1) ?? null;
}
export function anonymousCookie(token: string): string {
  if (!isSessionToken(token)) throw new HttpError(422, 'invalid_input');
  return `${ANONYMOUS_COOKIE}=${token}; Path=/; Max-Age=1800; Secure; HttpOnly; SameSite=Lax`;
}
export function clearAnonymousCookie(): string {
  return `${ANONYMOUS_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}
function mac(payload: string, binding: string, secret: Buffer): string {
  return createHmac('sha256', secret).update('n3a:csrf:v1:').update(binding).update(':').update(payload).digest('base64url');
}
export function csrfBinding(sessionHash: Buffer | null, anonymous: string | null): string | null {
  if (sessionHash) return `session:${sessionHash.toString('hex')}`;
  return isSessionToken(anonymous) ? `anonymous:${anonymous}` : null;
}
export function createCsrf(binding: string, secret: Buffer, now = Date.now()): { token: string; expires_at: string } {
  const issued = Math.floor(now / 1000); const expires = issued + CSRF_TTL_SECONDS;
  const payload = `${randomBytes(32).toString('base64url')}.${issued}.${expires}`;
  return { token: `${payload}.${mac(payload, binding, secret)}`, expires_at: new Date(expires * 1000).toISOString() };
}
export function verifyCsrf(request: Request, origin: string, binding: string | null, secret: Buffer, now = Date.now()): void {
  // Copied/adapted N2 server.ts originOk: exact equality, with no BASE_URL fallback or Secure downgrade.
  if (request.headers.get('origin') !== origin || !binding) throw new HttpError(403, 'csrf_rejected');
  const token = request.headers.get('x-csrf-token');
  if (!token || token.length > 128) throw new HttpError(403, 'csrf_rejected');
  const match = /^([A-Za-z0-9_-]{43})\.([0-9]{10})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || !isSessionToken(match[1]) || !isSessionToken(match[4])) throw new HttpError(403, 'csrf_rejected');
  const issued = Number(match[2]); const expires = Number(match[3]); const seconds = Math.floor(now / 1000);
  if (issued > seconds || expires <= seconds || expires - issued !== CSRF_TTL_SECONDS) throw new HttpError(403, 'csrf_rejected');
  const expected = mac(`${match[1]}.${match[2]}.${match[3]}`, binding, secret);
  if (!timingSafeEqual(Buffer.from(expected, 'base64url'), Buffer.from(match[4]!, 'base64url'))) throw new HttpError(403, 'csrf_rejected');
}
