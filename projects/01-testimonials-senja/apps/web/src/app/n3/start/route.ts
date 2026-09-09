import { NextResponse } from 'next/server';
import { baseUrl } from '@/lib/urls';
import { readN3Receipt, referralCookie } from '@/lib/n3-referral';
import { n3Config, N3_TOKEN } from '@/lib/n3-runtime';

export const dynamic = 'force-dynamic';
export function GET(request: Request): NextResponse {
  const config = n3Config();
  const response = NextResponse.redirect(`${baseUrl()}/`, 302);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  if (!config || readN3Receipt(request.headers.get('cookie'))) return response;
  const url = new URL(request.url), token = url.searchParams.get('n3_ref'), rawExpiry = url.searchParams.get('n3_ref_expires');
  if (url.searchParams.getAll('n3_ref').length !== 1 || url.searchParams.getAll('n3_ref_expires').length !== 1) return response;
  const expiry = new Date(rawExpiry ?? '');
  if (!N3_TOKEN.test(token ?? '') || !Number.isFinite(expiry.getTime()) || expiry.toISOString() !== rawExpiry || expiry.getTime() <= Date.now()) return response;
  response.cookies.set(referralCookie(config.tenantId), `${token}.${expiry.getTime()}`, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: expiry,
  });
  return response;
}
