import { isSessionToken, SESSION_TTL_MS } from './session';
export const SESSION_COOKIE = '__Host-n3a_session';
export function serializeSessionCookie(token: string): string {
  if (!isSessionToken(token)) throw new Error('invalid_input');
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_MS / 1_000}; Secure; HttpOnly; SameSite=Lax`;
}
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}
