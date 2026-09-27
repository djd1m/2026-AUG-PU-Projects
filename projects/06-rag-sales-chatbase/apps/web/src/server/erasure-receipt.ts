// из N5: projects/05-podcast-clips-opus/apps/web/src/server/erasure-receipt.ts — ПЕРЕНЕСЕНО, адаптировано имя cookie
// (__Host-n6_erasure) и формат id (uuid N6). Квитанция — право ТОЛЬКО видеть состояние удаления своего аккаунта: её не
// принимает ни вход, ни одна мутация (account-erasure, AC-13). Подпись — HMAC SESSION_SECRET с доменом «erasure:».
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ERASURE_COOKIE = '__Host-n6_erasure';
export const RECEIPT_SECONDS = 7 * 86_400;
const FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\d{10}\.[0-9a-f]{64}$/;

export function signErasureReceipt(account: string, secret: string, now = Date.now()): string {
  const payload = `${account}.${Math.floor(now / 1000) + RECEIPT_SECONDS}`;
  return `${payload}.${createHmac('sha256', secret).update(`erasure:${payload}`).digest('hex')}`;
}
// Подделка, чужой секрет, истёкший срок, мусор — null (ничего не показывается).
export function readErasureReceipt(value: string | undefined | null, secret: string, now = Date.now()): string | null {
  if (!value || !FORM.test(value)) return null;
  const [account, expires, signature] = value.split('.') as [string, string, string];
  const expected = createHmac('sha256', secret).update(`erasure:${account}.${expires}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')) || Number(expires) <= now / 1000) return null;
  return account;
}
export function erasureCookie(account: string, secret: string, now = Date.now()): string {
  return `${ERASURE_COOKIE}=${signErasureReceipt(account, secret, now)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${RECEIPT_SECONDS}`;
}
export function readReceiptCookie(cookieHeader: string | null): string | null {
  return cookieHeader?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${ERASURE_COOKIE}=`))?.slice(ERASURE_COOKIE.length + 1) ?? null;
}
