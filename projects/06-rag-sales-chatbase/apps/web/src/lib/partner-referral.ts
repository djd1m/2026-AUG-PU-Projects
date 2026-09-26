// Cookie реферала `/r/{code}` (фича partner-and-studio; FR-PARTNER-001, FR-GROWTH-002). Донор — N5
// projects/05-podcast-clips-opus/apps/web/src/lib/partner-referral.ts — АДАПТИРОВАНО: 30 дней вместо 14, форма кода N6
// `^[A-Za-z0-9_-]{3,40}$`, без `guest_link` (у N6 третий источник — приглашение студии, оно не в cookie).
//
// Значение: `<код>.<срок, unix-секунды>.<HMAC-SHA256(SESSION_SECRET, "referral:<код>:<срок>")>`. Подпись сравнивается
// постоянным временем; срок в прошлом или дальше 30 дней — cookie игнорируется. Ставит её СЕРВЕР (Safari ITP гасит
// JS-cookie): HttpOnly; Secure; SameSite=Lax. Действующую cookie ДРУГОГО кода новая ссылка не перезаписывает — первая
// ссылка сильнее (как у донора), а явный код при регистрации сильнее cookie.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const REFERRAL_COOKIE = '__Host-n6_ref';
export const REFERRAL_TTL_SECONDS = 30 * 86400;
const CODE = /^[A-Za-z0-9_-]{3,40}$/;
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`referral:${payload}`).digest();

export function readReferral(cookieHeader: string | null, secret: string, now = Date.now()): string | null {
  const values = (cookieHeader ?? '').split(';').map((s) => s.trim()).filter((s) => s.startsWith(`${REFERRAL_COOKIE}=`));
  if (values.length !== 1) return null;
  const match = /^([A-Za-z0-9_-]{3,40})\.(\d{10})\.([a-f0-9]{64})$/.exec(values[0]!.slice(REFERRAL_COOKIE.length + 1));
  if (!match) return null;
  const expected = sign(`${match[1]}:${match[2]}`, secret);
  if (!timingSafeEqual(expected, Buffer.from(match[3]!, 'hex'))) return null;
  const expires = Number(match[2]);
  if (expires <= now / 1000 || expires > Math.floor(now / 1000) + REFERRAL_TTL_SECONDS) return null;
  return match[1]!;
}

// null — cookie не ставится: код непригоден или уже действует cookie (того же или другого кода — первая ссылка сильнее).
export function referralSetCookie(cookieHeader: string | null, code: string, secret: string, now = Date.now()): string | null {
  if (!CODE.test(code) || readReferral(cookieHeader, secret, now) !== null) return null;
  const expires = Math.floor(now / 1000) + REFERRAL_TTL_SECONDS;
  const value = `${code}.${expires}.${sign(`${code}:${expires}`, secret).toString('hex')}`;
  return `${REFERRAL_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${REFERRAL_TTL_SECONDS}`;
}
