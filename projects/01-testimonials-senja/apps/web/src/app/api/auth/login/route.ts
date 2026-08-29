// POST /api/auth/login — FR-009.
//
// Разбор тела ЗДЕСЬ, снаружи транзакции (NFR-009.9). Внутри он удерживал бы соединение
// пула, пока клиент дописывает запрос, и десять медленных POST на этот неаутентифицированный
// маршрут положили бы вместе с входом дашборд, витрину, виджет и приём отзывов.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { attemptLogin, normalizeEmail, warmUpDummyHash } from '@/lib/login';
import { extractClientIP } from '@/lib/client-ip';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { MAX_JSON_BODY, readBodyAtMost } from '@/lib/request-body';

export const dynamic = 'force-dynamic';

// Прогрев заглушечного хеша при загрузке модуля, а не на первом запросе.
// Без него ПЕРВЫЙ вход после старта процесса платит ~50 мс за argon2 заглушки — и только
// в ветке «аккаунта нет», то есть ровно там, где разница во времени и есть оракул.
// Экспорт без единого вызова в проде (как было) — ложное обещание: функция выглядит мерой,
// а мерой не является.
void warmUpDummyHash();

// Один и тот же ответ для всех отказов аутентификации: неверный пароль, несуществующий
// email, пустой пароль, нестроковые поля. Различимость — оракул перечисления учёток.
const UNAUTHORIZED = { error: 'неверный email или пароль' } as const;
// Без счётчика и времени сброса — та же анти-перечислительная логика, что у формы отзыва.
export const TOO_MANY = { error: 'слишком много попыток, попробуйте позже' } as const;

export async function POST(request: Request): Promise<NextResponse> {
  const raw = await readBodyAtMost(request, MAX_JSON_BODY);
  if (raw === null) {
    return NextResponse.json({ error: 'тело запроса слишком большое' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 400 — ошибка формата, а не аутентификации; различимость здесь безопасна.
    return NextResponse.json({ error: 'тело запроса: ожидается JSON' }, { status: 400 });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return NextResponse.json({ error: 'тело запроса: ожидается объект' }, { status: 400 });
  }

  const body = parsed as { email?: unknown; password?: unknown };
  const email = normalizeEmail(body.email);
  // Нестроковый пароль — пустая строка, а не исключение: мусорный ввод не роняет маршрут
  // и получает тот же ответ, что неверный пароль.
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = extractClientIP(request);

  const result = await withService((client) => attemptLogin(client, email, password, ip));

  if (!result.ok) {
    return result.tooMany
      ? NextResponse.json(TOO_MANY, { status: 429 })
      : NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  // Токен уходит ТОЛЬКО в httpOnly-cookie и никогда в тело: иначе его прочитал бы любой
  // скрипт на странице, и httpOnly потерял бы смысл (тот же инвариант, что у регистрации).
  const response = NextResponse.json(
    { account_id: result.accountId, projects: result.projects },
    { status: 200 },
  );
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  return response;
}
