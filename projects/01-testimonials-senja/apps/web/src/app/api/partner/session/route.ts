// POST /api/partner/session — FR-011.3.
//
// Токен приходит в ТЕЛЕ, а не в адресе. Адрес утекает тремя путями: Referer любому
// внешнему ресурсу на странице, история браузера с облачной синхронизацией, журналы
// прокси. Ни один не касается тела POST.
//
// Обёртки поверх resolvePartner здесь нет и быть не должно: withService нереентрантен,
// а вложение даёт самоблокировку на пуле — при 31 одновременном запросе внешние обёртки
// занимают все 30 соединений, и внутренние транзакции ждут их же.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { extractClientIP } from '@/lib/client-ip';
import { MAX_JSON_BODY, readBodyAtMost } from '@/lib/request-body';
import { PARTNER_COOKIE, resolvePartner } from '@/lib/partner-auth';
import { TOO_MANY } from '../../auth/login/route';

export const dynamic = 'force-dynamic';

// ОДИН ответ на все отказы: неизвестный токен, отозванный код, мусорная строка.
// «Такой партнёр есть, но код отозван» отдельным текстом было бы оракулом.
const UNAUTHORIZED = { error: 'ключ доступа не подошёл' } as const;

/** 30 дней, как у сессии владельца. Путь ограничен /partner: остальные маршруты этой
 *  cookie не видят вовсе, и она не мешается с сессией владельца. */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  const raw = await readBodyAtMost(request, MAX_JSON_BODY);
  if (raw === null) {
    return NextResponse.json({ error: 'тело запроса слишком большое' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'тело запроса: ожидается JSON' }, { status: 400 });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return NextResponse.json({ error: 'тело запроса: ожидается объект' }, { status: 400 });
  }

  // Нестроковый токен — пустая строка, а не исключение: мусорный ввод не роняет маршрут
  // и получает тот же ответ, что неизвестный ключ.
  const token = typeof (parsed as { token?: unknown }).token === 'string'
    ? (parsed as { token: string }).token
    : '';
  const ip = extractClientIP(request);

  const result = await withService((client) => resolvePartner(client, token, ip));

  if (!result.ok) {
    return result.tooMany
      ? NextResponse.json(TOO_MANY, { status: 429 })
      : NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  // Токен уходит ТОЛЬКО в httpOnly-cookie и никогда в тело: иначе его прочитал бы любой
  // скрипт на странице. Идентификатор партнёра в тело тоже не уходит — по нему ничего
  // не открывается, но и печатать его незачем.
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(PARTNER_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/partner',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
