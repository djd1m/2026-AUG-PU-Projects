import { createHmac, timingSafeEqual } from 'node:crypto';
export const ERASURE_COOKIE = '__Host-n5_erasure';
const RECEIPT_SECONDS = 7 * 86400;
// Status-only capability; never accepted by authentication or mutations.
export function signErasureReceipt(account: string, secret: string, now = Date.now()) {
  const payload = `${account}.${Math.floor(now / 1000) + RECEIPT_SECONDS}`;
  return `${payload}.${createHmac('sha256', secret).update(`erasure:${payload}`).digest('hex')}`;
}
export function readErasureReceipt(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || !/^[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(value)) return null;
  const [account, expires, signature] = value.split('.');
  const expected = createHmac('sha256', secret).update(`erasure:${account}.${expires}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature!, 'hex')) || Number(expires) <= now / 1000) return null;
  return account!;
}
export function erasureCookie(account: string, secret: string) {
  return `${ERASURE_COOKIE}=${signErasureReceipt(account, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${RECEIPT_SECONDS}`;
}
