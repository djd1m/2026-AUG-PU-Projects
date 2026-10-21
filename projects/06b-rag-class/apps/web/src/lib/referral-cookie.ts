// Pure browser/Edge-safe referral boundary; do not import the DB barrel here.
export const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{12}$/;
export const REFERRAL_COOKIE = 'n6b_ref';
export const REFERRAL_TTL_SECONDS = 30 * 24 * 60 * 60;

export function referralId(value: string | null | undefined): string | null {
  return value && PUBLIC_ID_RE.test(value) ? value : null;
}

export function firstTouchReferral(ref: string | null, existingCookie: string | undefined): string | null {
  if (existingCookie !== undefined) return null;
  return referralId(ref);
}

export function readReferralCookie(request: Request): string | null {
  const value = request.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${REFERRAL_COOKIE}=`))?.slice(REFERRAL_COOKIE.length + 1);
  return referralId(value);
}
