// Вход по бейджу / демо-странице (фича public-page-and-summary; FR-GROWTH-003, FR-GROWTH-006): `/?from=<домен>` или
// `/?from=b/<slug>` кладёт HttpOnly-cookie прихода на 7 суток; регистрация записывает его в аккаунт один раз
// (auth-handler recordArrival). Серверный компонент cookie выставить не может — поэтому middleware, и только на `/`.
// Решение — чистая функция arrivalSetCookie (lib/arrival.ts, модульный тест); непригодное значение cookie не трогает.
import { NextResponse, type NextRequest } from 'next/server';
import { arrivalSetCookie } from './lib/arrival';

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const cookie = arrivalSetCookie(request.nextUrl);
  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}
export const config = { matcher: '/' };
