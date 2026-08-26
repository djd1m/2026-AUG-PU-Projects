// POST /api/auth/register — FR-001. HTTP-обёртка над registerAccountAndProject.
// Роут отвечает только за транспорт: разбор тела, коды, cookie. Бизнес-правила — в lib/register.ts.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { registerAccountAndProject, type RegisterInput } from '@/lib/register';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

// Роут ходит в БД — статически его пререндерить нельзя.
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ['тело запроса: ожидается JSON'] }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ errors: ['тело запроса: ожидается объект'] }, { status: 400 });
  }

  // Каст безопасен: все поля RegisterInput объявлены как unknown и проверяются
  // внутри registerAccountAndProject — тип здесь описывает форму, а не доверие к вводу.
  const result = await withService((client) =>
    registerAccountAndProject(client, body as RegisterInput),
  );

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const response = NextResponse.json(
    {
      account_id: result.accountId,
      project_slug: result.slug,
      urls: result.urls,
    },
    { status: 201 },
  );
  // Токен уходит ТОЛЬКО в httpOnly-cookie и никогда в тело ответа: иначе его увидел бы
  // любой скрипт на странице, и httpOnly потерял бы смысл (Architecture §3.2).
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  return response;
}
