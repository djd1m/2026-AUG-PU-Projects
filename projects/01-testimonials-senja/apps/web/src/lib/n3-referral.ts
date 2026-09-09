import type { PoolClient } from 'pg';
import { n3Config, N3_TOKEN, N3Error } from '../../../../services/worker/src/n3-client';

export interface N3Receipt { tenantId: string; visitToken?: string; promoCode?: string }
export function referralCookie(tenantId: string): string { return `n3_ref_${tenantId}`; }
export function readN3Receipt(cookie: string | null, now = Date.now()): string | undefined {
  const config = n3Config(); if (!config || !cookie || cookie.length > 8192) return;
  const prefix = `${referralCookie(config.tenantId)}=`;
  const values = cookie.split(';').map(p => p.trim()).filter(p => p.startsWith(prefix));
  if (values.length !== 1) return;
  const [token, expiry, extra] = values[0]!.slice(prefix.length).split('.');
  if (extra || !N3_TOKEN.test(token ?? '') || !/^\d{13}$/.test(expiry ?? '') || Number(expiry) <= now) return;
  return token;
}
export function signupReceipt(cookie: string | null, promo: unknown): N3Receipt | null {
  const config = n3Config();
  if (!config) {
    if (promo !== undefined && promo !== '') throw new N3Error('N3_DISABLED', 503);
    return null;
  }
  const visitToken = readN3Receipt(cookie);
  if (promo !== undefined && promo !== '') {
    if (typeof promo !== 'string' || promo.length > 64 || promo.trim() !== promo) throw new N3Error('N3_PROMO_INVALID', 400);
    return { tenantId: config.tenantId, ...(visitToken ? { visitToken } : {}), promoCode: promo };
  }
  return visitToken ? { tenantId: config.tenantId, visitToken } : null;
}
export async function captureSignup(client: PoolClient, accountId: string, receipt: N3Receipt | null): Promise<void> {
  if (!receipt) return;
  await client.query(`insert into n3_signup_contexts(account_id,tenant_id,visit_token,promo_code)
    values($1,$2,$3,$4) on conflict(account_id) do nothing`,
  [accountId, receipt.tenantId, receipt.visitToken ?? null, receipt.promoCode ?? null]);
}
