// HTTP-ручки POST /api/auth/{register,login,logout} — перенос N5 apps/web/src/server/auth-handler.ts (#24),
// адаптирован под Pseudocode «Register and login» и API Contracts N6b. Порядок (security-operation-order.md):
//   1) Origin ≠ наш ИЛИ Origin отсутствует → 403 (чужая страница не сжигает счётчик посетителя и не входит от его
//      имени; браузер шлёт Origin на каждый POST fetch, поэтому его отсутствие — не браузер нашей формы, 08_review.md);
//   2) предел попыток на адрес — атомарно, отдельной закоммиченной транзакцией, ДО разбора тела, bcrypt и записи
//      аккаунта; общий ключ регистрации и входа; попытка засчитывается при любом дальнейшем исходе (SC-US-001-4);
//   3) разбор и валидация тела; 4) bcrypt и запись.

import { z } from 'zod';
import { accountKindOf, moscowHour, type QuotaDecision, type QuotaKey } from '@n6b/db';
import { type AuthService, SESSION_TTL_SECONDS } from './auth';
import { addrHash, ClientAddressUnavailable, clientIp } from './ip';

export const SESSION_COOKIE = 'n6b_session';
const MAX_BODY_BYTES = 4096;

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'пароль длиннее 72 байт'),
  kind: z.unknown().optional(),
});

export interface AuthHandlerDeps {
  readonly auth: AuthService;
  readonly publicBaseUrl: string;
  readonly visitorSecret: string;
  readonly authLimitPerHour: number;
  readonly production: boolean;
  readonly reserve: (keys: readonly QuotaKey[]) => Promise<QuotaDecision>;
  readonly now?: () => Date;
}

function json(status: number, body: object, cookie?: string): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(body, { status, headers });
}
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

export function sessionCookie(token: string, production: boolean, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
}

/** Токен сессии — 32 случайных байта в base64url (43 символа); всё прочее не токен и в БД не ищется. */
export function sessionTokenOrNull(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function readSessionCookie(request: Request): string | null {
  return sessionTokenOrNull(request.headers.get('cookie')?.split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1));
}

/** Ключ почасового предела входа: HMAC адреса (IPv4 целиком, IPv6 /64) + час по Москве. */
export function authQuotaKey(visitorSecret: string, ip: string, limit: number, at: Date): QuotaKey {
  return { scope: `auth:addr:${addrHash(visitorSecret, ip)}:${moscowHour(at)}`, limit };
}

export async function readJson(request: Request, options: { objectOnly?: boolean } = {}): Promise<unknown | 'too-large' | 'invalid'> {
  const contentType = request.headers.get('content-type')?.toLowerCase();
  if (options.objectOnly ? contentType?.split(';')[0]?.trim() !== 'application/json'
    : !contentType?.startsWith('application/json')) return 'invalid';
  const reader = request.body?.getReader();
  if (!reader) return 'invalid';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); return 'too-large'; }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Object-only callers cannot confuse a JSON string "too-large" with the byte-limit sentinel.
    if (options.objectOnly && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) return 'invalid';
    return parsed;
  } catch { return 'invalid'; }
}

export function createAuthHandler(action: 'register' | 'login' | 'logout', deps: AuthHandlerDeps) {
  const ownOrigin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request): Promise<Response> => {
    try {
      const origin = request.headers.get('origin');
      if (origin !== ownOrigin) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');

      if (action === 'logout') {
        const token = readSessionCookie(request);
        if (token) await deps.auth.logout(token);
        return json(200, { data: { ok: true } }, sessionCookie('', deps.production, 0));
      }

      const ip = clientIp(request.headers);
      const decision = await deps.reserve([
        authQuotaKey(deps.visitorSecret, ip, deps.authLimitPerHour, deps.now?.() ?? new Date())]);
      if (!decision.ok) return fail(429, 'too_many_attempts', 'Слишком много попыток, повторите через час');

      const body = await readJson(request);
      if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      const parsed = credentials.safeParse(body === 'invalid' ? undefined : body);
      if (!parsed.success) {
        return fail(422, 'invalid_credentials_format', 'Укажите корректный e-mail и пароль от 10 символов');
      }
      const { email, password, kind } = parsed.data;

      if (action === 'register') {
        const result = await deps.auth.register(email, password, accountKindOf(kind));
        if (!result.ok) return fail(409, 'email_taken', 'Аккаунт с этим e-mail уже есть — войдите');
        return json(201, { data: { ok: true } }, sessionCookie(result.token, deps.production));
      }
      const token = await deps.auth.login(email, password);
      if (!token) return fail(401, 'invalid_login', 'Неверный e-mail или пароль');
      return json(200, { data: { ok: true } }, sessionCookie(token, deps.production));
    } catch (error) {
      if (error instanceof ClientAddressUnavailable) {
        console.error('auth: адрес клиента недоступен — запрос не через прокси; вход отклонён');
        return fail(503, 'client_address_unavailable', 'Вход временно недоступен. Повторите позже');
      }
      console.error(`auth: ${action} не завершён: ${(error as Error).name}`);
      return fail(503, 'auth_unavailable', 'Вход временно недоступен. Повторите позже');
    }
  };
}
