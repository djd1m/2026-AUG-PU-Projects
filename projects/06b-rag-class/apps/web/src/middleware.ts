import { NextResponse, type NextRequest } from 'next/server';
import { firstTouchReferral, REFERRAL_COOKIE, REFERRAL_TTL_SECONDS } from './lib/referral-cookie';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  if (request.nextUrl.pathname.startsWith('/handover/')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (request.nextUrl.pathname !== '/') return response;
  const ref = firstTouchReferral(request.nextUrl.searchParams.get('ref'), request.cookies.get(REFERRAL_COOKIE)?.value);
  if (ref) response.cookies.set(REFERRAL_COOKIE, ref, { httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production', maxAge: REFERRAL_TTL_SECONDS });
  return response;
}

export const config = { matcher: ['/', '/b/:path*', '/handover/:path*'] };
