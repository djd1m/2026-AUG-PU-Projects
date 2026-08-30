// GET /api/auth/yandex/callback — FR-016, шаг 2.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПОРЯДОК ШАГОВ ЗДЕСЬ — ЭТО И ЕСТЬ ЗАЩИТА (.claude/rules/security-operation-order.md).
// Что именно нельзя менять местами:
//
//   1. Лимит — ДО сетевых вызовов. Иначе кто угодно заставляет нас ходить в Яндекс
//      бесплатно: маршрут неаутентифицированный, а каждый вызов держит обработчик до 8 с.
//   2. state гасится ДО обмена кода. Одна начатая попытка = одна возможность обмена;
//      негашеный state оставлял бы окно на повтор.
//   3. ОБА сетевых вызова — СНАРУЖИ транзакции. Соединение пула не удерживается всё время
//      ответа чужого сервиса. Обеспечено тем, что withService открывается ПОСЛЕ них.
//   4. Транзакция — последней и короткой: только чтение, вставка и выдача сессии.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { rateLimit, withService } from '@proofwall/db';
import { exchangeCode, fetchProfile, SSO_STATE_COOKIE, SsoNotConfiguredError, SsoUnavailableError, unpackState } from '@/lib/sso';
import { resolveSsoAccount } from '@/lib/sso-account';
import { normalizeEmail, hashKey } from '@/lib/login';
import { extractClientIP } from '@/lib/client-ip';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { baseUrl } from '@/lib/urls';

export const dynamic = 'force-dynamic';

/** Грубый счётчик по машине. Учётки на этом пути ещё нет, ключа тоньше IP не существует. */
export const SSO_IP_SCOPE = 'sso_ip';
export const SSO_IP_THRESHOLD = 30;
export const SSO_WINDOW = { seconds: 3600 } as const;

/** Отказ уводит на форму входа с пометкой — человеку нужен путь дальше, а не JSON. */
function back(reason: string): NextResponse {
  return NextResponse.redirect(`${baseUrl()}/login?sso=${encodeURIComponent(reason)}`, {
    status: 302,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');

  // Человек нажал «Отказать» на странице согласия — не ошибка, тихо возвращаем.
  if (url.searchParams.get('error')) return back('cancelled');

  // ── ШАГ 1: лимит, ДО всякой сети.
  const ip = extractClientIP(request);
  const overLimit = await withService(async (client) => {
    const key = hashKey(SSO_IP_SCOPE, ip);
    if (await rateLimit.exceeded(SSO_IP_SCOPE, key, SSO_WINDOW, SSO_IP_THRESHOLD, client)) {
      return true;
    }
    await rateLimit.record(SSO_IP_SCOPE, key, client);
    return false;
  });
  if (overLimit) return back('too_many');

  // ── ШАГ 2: state. Гасим cookie СРАЗУ и безусловно — до любой сетевой работы.
  const saved = unpackState(request.headers.get('cookie')?.match(
    new RegExp(`(?:^|;\\s*)${SSO_STATE_COOKIE}=([^;]+)`),
  )?.[1]);

  const clearState = (response: NextResponse): NextResponse => {
    response.cookies.set(SSO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  };

  if (!saved || !stateParam || !code) return clearState(back('invalid_state'));
  // Сравнение обычное, не константное по времени: state — не секрет доступа, а привязка
  // возврата к начатой попытке, и он уже подписан HMAC при упаковке.
  if (saved.state !== stateParam) return clearState(back('invalid_state'));

  // ── ШАГ 3: сеть. СНАРУЖИ транзакции — оба вызова.
  let profile: { externalId: string; email: string };
  try {
    const accessToken = await exchangeCode(code, saved.verifier);
    profile = await fetchProfile(accessToken);
  } catch (error) {
    if (error instanceof SsoNotConfiguredError) return clearState(back('not_configured'));
    if (error instanceof SsoUnavailableError) return clearState(back('provider_unavailable'));
    throw error;
  }

  // Нормализация — КАНОНИЧЕСКАЯ, той же функцией, что у регистрации и входа. Свой
  // toLowerCase здесь развёл бы адреса и не дал бы человеку попасть в свою учётку.
  const email = normalizeEmail(profile.email);
  if (email === '') return clearState(back('no_email'));

  // ── ШАГ 4: транзакция — последней и короткой.
  const resolution = await withService((client) =>
    resolveSsoAccount(client, 'yandex', profile.externalId, email),
  );

  if (resolution.kind === 'needs_password_login') {
    // ГЛАВНЫЙ ОТКАЗ ФИЧИ. Учётка с этим адресом существует и у неё есть пароль — связать
    // её по совпадению адреса значило бы отдать её тому, кто вписал адрес в свой яндексовый
    // профиль. Человек входит паролем и привязывает Яндекс из настроек, где владение обеими
    // сторонами доказано разом.
    return clearState(back('password_account_exists'));
  }

  const response = NextResponse.redirect(`${baseUrl()}/dashboard`, { status: 302 });
  response.cookies.set(SESSION_COOKIE, resolution.token, sessionCookieOptions());
  return clearState(response);
}
