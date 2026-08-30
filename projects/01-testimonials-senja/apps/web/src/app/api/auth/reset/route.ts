// POST /api/auth/reset — FR-015.2.
//
// СЕССИЮ НЕ ВЫДАЁТ. Ответ не несёт Set-Cookie вовсе — человек идёт на форму входа и входит
// новым паролем. Причина не в удобстве: ссылка, выдающая сессию, функционально есть вход
// через владение почтовым ящиком, а п.10 ст.8 149-ФЗ такого способа не называет.

import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { MAX_JSON_BODY, readBodyAtMost } from '@/lib/request-body';
import { resetPassword } from '@/lib/password-reset';
import { validNewPassword } from '@/lib/password-change';

export const dynamic = 'force-dynamic';

// Один ответ на «неизвестный токен», «уже использован» и «истёк»: различать их значило бы
// подсказывать перебирающему, какая ссылка когда-то существовала.
const INVALID = { error: 'ссылка недействительна или устарела' } as const;

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

  const body = parsed as { token?: unknown; new_password?: unknown };
  const token = typeof body.token === 'string' ? body.token : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';

  // Границы — ДО транзакции и ДО argon2, ТОЙ ЖЕ функцией, что у регистрации и смены пароля.
  if (!validNewPassword(next)) {
    return NextResponse.json({ error: 'новый пароль: от 8 до 200 символов' }, { status: 400 });
  }

  const ok = await withService((client) => resetPassword(client, token, next));
  if (!ok) return NextResponse.json(INVALID, { status: 400 });

  // Ни cookie, ни токена в теле. Только подтверждение.
  return NextResponse.json({ ok: true }, { status: 200 });
}
