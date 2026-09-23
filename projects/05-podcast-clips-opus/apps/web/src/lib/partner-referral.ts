import { createHmac, timingSafeEqual } from 'node:crypto';
export const REFERRAL_COOKIE = '__Host-n5_referral';
const TTL_SECONDS = 14 * 86400;
type Referral = { code: string; source: 'cookie' | 'guest_link' };
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`referral:${payload}`).digest();
export function readReferral(header: string, secret: string, now = Date.now()): Referral | null {
  const values = header.split(';').map(s => s.trim()).filter(s => s.startsWith(`${REFERRAL_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(REFERRAL_COOKIE.length + 1);
  const match = /^(cookie|guest_link):([A-Za-z0-9_-]{6,12}):(\d{10}):([a-f0-9]{64})$/.exec(value);
  if (!match) return null;
  const payload = `${match[1]}:${match[2]}:${match[3]}`;
  if (!timingSafeEqual(sign(payload, secret), Buffer.from(match[4]!, 'hex'))) return null;
  if (Number(match[3]) <= now / 1000 || Number(match[3]) > Math.floor(now / 1000) + TTL_SECONDS) return null;
  return { source: match[1] as Referral['source'], code: match[2]! };
}
export function referralCookie(header: string, code: string | null | undefined, source: Referral['source'], self: boolean,
  secret: string, now = Date.now()): string | null {
  if (self || !code || !/^[A-Za-z0-9_-]{6,12}$/.test(code)) return null;
  const existing = readReferral(header, secret, now);
  if (existing && (existing.source === 'guest_link' || source === 'cookie')) return null;
  const payload = `${source}:${code}:${Math.floor(now / 1000) + TTL_SECONDS}`;
  return `${REFERRAL_COOKIE}=${payload}:${sign(payload, secret).toString('hex')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}
export const clearReferralCookie = () => `${REFERRAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
