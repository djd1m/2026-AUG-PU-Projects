import { NextResponse, type NextRequest } from 'next/server';

// Content-Security-Policy ставится ЗДЕСЬ и БОЛЬШЕ НИГДЕ.
//
// Почему не в Caddy: политика обязана нести nonce, а nonce знает только тот, кто отрисовал
// страницу. Заголовок, поставленный дважды, браузер пересекает — и страница ломается молча,
// ровно как от двойного CORS.
//
// `unsafe-inline` НЕ используется. Next.js вставляет инлайновые скрипты гидратации, поэтому
// каждому запросу выдаётся одноразовый nonce: увидев его в заголовке запроса, Next проставит
// его своим скриптам сам. `strict-dynamic` нужен, чтобы скрипты, загруженные доверенным
// скриптом с nonce, тоже исполнялись — иначе чанки Next не загрузятся.
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // стили Next инлайновые и nonce не поддерживают
    "img-src 'self' blob: data:",
    "media-src 'self' blob:", // поток камеры отдаётся как blob:
    "connect-src 'self'", // наружу фронт не ходит: у него нет ни одного чужого адреса
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Mini App исполняется внутри WebView Telegram — только эти предки допустимы.
    'frame-ancestors https://web.telegram.org https://telegram.org',
    'upgrade-insecure-requests',
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Статика и изображения политики не требуют и не должны получать новый nonce на каждый файл.
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico|icons).*)' }],
};
