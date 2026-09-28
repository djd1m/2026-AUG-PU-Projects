// POST /api/auth/forgot — FR-015.1.
//
// ОДИН ответ на все случаи: адрес есть, адреса нет, письмо не ушло. Различить их снаружи
// нечем, и это закреплено ФОРМОЙ ТИПА IssueResult — случая «аккаунта нет» в нём просто нет,
// поэтому маршрут физически не может ответить по-разному.
//
// ВРЕМЕНЕМ он тоже не отвечает по-разному (правка 28.09). До неё письмо ждалось внутри
// ответа (fetch к провайдеру до 8 с) только при выпущенном токене — то есть только для
// существующего адреса; тело совпадало, а секундомер различал: 1509 мс против 16 мс при
// провайдере в 1,5 с. Теперь отправка уходит ПОСЛЕ ответа, и её время ответа не касается.

import { after, NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { normalizeEmailFromInput } from '@/lib/validation';
import { extractClientIP } from '@/lib/client-ip';
import { MAX_JSON_BODY, readBodyAtMost } from '@/lib/request-body';
import { issueResetToken } from '@/lib/password-reset';
import {
  mailConfigured, resetEmail, sendViaResend, sendWithRetry, type EmailSender,
} from '@/lib/email';
import { passwordResetUrl } from '@/lib/urls';
import { TOO_MANY } from '../login/route';

export const dynamic = 'force-dynamic';

const SENT = {
  message: 'если такой адрес зарегистрирован, письмо со ссылкой отправлено',
} as const;

/** Как отложить работу на «после ответа». В маршруте — after() из Next: задача стартует,
 *  когда ответ уже отдан, и процесс её дожидается. Параметром — потому что after() вне
 *  запроса Next бросает, а тестам нужно дождаться письма явно. */
export type Defer = (task: () => Promise<void>) => void;

/** Отправитель — параметр с умолчанием, а не жёсткий импорт: тесты подставляют счётчик
 *  вызовов и проверяют «писем ноль» без всякой сети. */
export async function handleForgot(
  request: Request,
  sendEmail: EmailSender = sendViaResend,
  defer: Defer = after,
): Promise<NextResponse> {
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

  // ТА ЖЕ нормализация, что у входа и регистрации, ЕДИНСТВЕННЫМ объявлением. Своя копия
  // однажды разойдётся, и человек не получит письма на адрес, которым зарегистрировался.
  // ── ПОЧТА НЕ НАСТРОЕНА — отказ ЗДЕСЬ, до выпуска токена.
  //
  // Наблюдалось на стенде 2026-08-30: страница /forgot была живой при пустом ключе,
  // человеку отвечали «письмо отправлено», токен выпускался и оставался в БД навсегда,
  // а письма не было. Журнал писал reset_email_failed — то есть отказ БЫЛ виден нам и
  // НЕ был виден тому, кто ждёт письма.
  //
  // Разный ответ здесь НЕ является оракулом перечисления учёток: он зависит от состояния
  // КОНФИГУРАЦИИ, одинакового для всех адресов, а не от того, существует ли адрес. Это
  // ровно та граница, которая отделяет допустимое различие от утечки.
  if (!mailConfigured()) {
    return NextResponse.json(
      { error: 'восстановление по почте пока не настроено на этом стенде' },
      { status: 503 },
    );
  }

  const email = normalizeEmailFromInput((parsed as { email?: unknown }).email);
  const ip = extractClientIP(request);

  // Транзакция КОРОТКАЯ: сети внутри нет и быть не может — issueResetToken не принимает
  // отправителя вовсе.
  const issued = await withService((client) => issueResetToken(client, email, ip));

  if (!issued.ok && issued.tooMany) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  if (issued.ok) {
    // ── ПОСЛЕ ОТВЕТА, НЕ ВНУТРИ НЕГО ────────────────────────────────────────────
    // Ни await, ни ожидания исхода: время провайдера существует только у существующего
    // адреса, и любое его ожидание здесь снова делает секундомер оракулом перечисления.
    // Отказ провайдера НЕ откатывает токен и НЕ меняет ответ — его видно только в журнале
    // (reset_email_sent / _retry / _failed); человек, не дождавшись письма, повторяет запрос.
    const message = resetEmail(email, passwordResetUrl(issued.token));
    defer(async () => { await sendWithRetry(sendEmail, message, 'reset_email'); });
  }

  return NextResponse.json(SENT, { status: 200 });
}

export function POST(request: Request): Promise<NextResponse> {
  return handleForgot(request);
}
