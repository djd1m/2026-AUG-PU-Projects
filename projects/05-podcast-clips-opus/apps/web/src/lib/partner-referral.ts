export const REFERRAL_COOKIE = '__Host-n5_referral';
export function readReferral(header: string): { code: string; source: 'cookie' | 'guest_link' } | null {
  const value = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${REFERRAL_COOKIE}=`))?.slice(REFERRAL_COOKIE.length + 1);
  const match = /^(cookie|guest_link):([A-Za-z0-9_-]{6,12})$/.exec(value ?? '');
  return match ? { source: match[1] as 'cookie' | 'guest_link', code: match[2]! } : null;
}
export function referralCookie(header: string, code: string | null | undefined, source: 'cookie' | 'guest_link', self: boolean): string | null {
  if (self || !code || !/^[A-Za-z0-9_-]{6,12}$/.test(code)) return null;
  const existing = readReferral(header);
  if (existing && (existing.source === 'guest_link' || source === 'cookie')) return null;
  return `${REFERRAL_COOKIE}=${source}:${code}; Path=/; Secure; SameSite=Lax`;
}
