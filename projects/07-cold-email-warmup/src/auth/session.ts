// Adapted N1 HMAC opaque-token pattern; N7 key validation and absolute TTL.
import { createHmac, randomBytes } from 'node:crypto';
export const COOKIE_NAME = 'n7_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export function tokenDigest(token: string, key: Buffer) { return createHmac('sha256', key).update(token).digest('hex'); }
export function newSession(key: Buffer) {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: tokenDigest(token, key), expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) };
}
export function readToken(cookie?: string): string | null {
  const values = (cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(COOKIE_NAME.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return Buffer.from(token, 'base64url').toString('base64url') === token ? token : null;
}
export function sessionCookie(token: string, secure: boolean, clear = false) {
  return `${COOKIE_NAME}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}
