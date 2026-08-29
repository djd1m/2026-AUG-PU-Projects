// POST /api/auth/password — FR-010.
//
// Разбор тела ЗДЕСЬ, снаружи транзакции (NFR-010.8). Внутри он удерживал бы соединение
// пула, пока клиент дописывает запрос: длительностью этого чтения управляет КЛИЕНТ, и
// десять медленных POST положили бы вместе со сменой пароля дашборд, витрину и виджет.
//
// argon2 нового пароля здесь НЕ считается — он живёт в шаге 4 password-change.ts, после
// проверки текущего пароля. Ревизия 2 считала его тут и тем ставила ДО лимитера.

import { NextResponse } from 'next/server';
import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { changePassword, validNewPassword } from '@/lib/password-change';
import { extractClientIP } from '@/lib/client-ip';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { MAX_JSON_BODY, readBodyAtMost } from '@/lib/request-body';

export const dynamic = 'force-dynamic';

// Тот же ответ, что при отсутствии сессии (NFR-010.4). Совпадение достаётся даром,
// поэтому делается; различимость по ВРЕМЕНИ остаётся и принята осознанно — вор уже
// знает, что сессия жива, потому что ею же и дошёл до этого маршрута.
const UNAUTHORIZED = { error: 'неверный текущий пароль' } as const;
// ТОТ ЖЕ литерал, что у входа: два разных текста «слишком много попыток» разъехались бы.
const TOO_MANY = { error: 'слишком много попыток, попробуйте позже' } as const;
// Конкурентная смена — не перебор. 429 здесь вводил бы владельца в заблуждение.
const BUSY = { error: 'смена пароля уже выполняется, повторите через несколько секунд' } as const;

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

  // ЕДИНСТВЕННЫЙ источник accountId (NFR-010.7, AC-010.17). Поле account_id в теле, если
  // оно там есть, не читается никем и ни на что не влияет — это проверяет AC-010.18.
  // RLS к accounts/sessions НЕ применяется (007_rls.sql:31), а withAccount проверяет
  // только формат uuid: подстраховки, кроме этой строки, не существует.
  const accountId = await currentAccountId();
  if (accountId === null) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  const body = parsed as { current_password?: unknown; new_password?: unknown };
  // Нестроковые поля — пустая строка, а не исключение: мусорный ввод не роняет маршрут.
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';

  // Границы — ДО транзакции и ДО argon2 (NFR-010.8).
  if (!validNewPassword(next)) {
    return NextResponse.json(
      { error: 'новый пароль: от 8 до 200 символов' },
      { status: 400 },
    );
  }
  if (next === current) {
    return NextResponse.json({ error: 'новый пароль совпадает с текущим' }, { status: 400 });
  }

  const ip = extractClientIP(request);
  const result = await withAccount(accountId, (client) =>
    changePassword(client, { accountId, ip, current, next }),
  );

  if (!result.ok) {
    if (result.reason === 'too_many') return NextResponse.json(TOO_MANY, { status: 429 });
    if (result.reason === 'busy') return NextResponse.json(BUSY, { status: 409 });
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  // Новая cookie — в ТОМ ЖЕ HTTP-ответе (NFR-010.6), но за пределами транзакции: она уже
  // закоммичена. Токен уходит только в httpOnly-cookie и никогда в тело.
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  return response;
}
