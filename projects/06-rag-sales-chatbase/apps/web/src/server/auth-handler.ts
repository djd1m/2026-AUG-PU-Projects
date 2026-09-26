// из N5: projects/05-podcast-clips-opus/apps/web/src/server/auth-handler.ts — адаптировано: cookie
// __Host-n6_session, ответы в форме API Contracts N6 ({ data } | { error: { code, message } }),
// адрес клиента из одного значения XFF, записанного дверью (без trustedProxyHops).
import { z } from 'zod';
import { type AuthService, LOGIN_FAILURE, SESSION_TTL_SECONDS } from './auth';
import { clientIp, ipPrefix } from './ip';

const credentials = {
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).refine((v) => Buffer.byteLength(v, 'utf8') <= 72,
    'Пароль превышает безопасную длину bcrypt'),
};
const inputSchema = z.object(credentials).strict();
// Регистрация принимает код партнёра (partner-and-studio, FR-PARTNER-001): пустая строка — «кода нет», форма кода проверяется
// хранилищем (неверный — ошибка поля, без отката к cookie). Вход поле кода не принимает.
const registerSchema = z.object({ ...credentials, partner_code: z.string().max(60).optional() }).strict();
export const COOKIE_NAME = '__Host-n6_session';
const MAX_BODY_BYTES = 4096;
function json(body: object, status = 200, cookies: string | string[] = []): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const value of typeof cookies === 'string' ? [cookies] : cookies) headers.append('Set-Cookie', value);
  return Response.json(body, { status, headers });
}
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
function cookie(token: string, ttl = SESSION_TTL_SECONDS): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;
}
export function readSessionCookie(request: Request): string | null {
  const token = request.headers.get('cookie')?.split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export interface HandlerDependencies {
  auth: AuthService;
  publicOrigin: string;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  // ClaimPreview при регистрации и входе (Pseudocode AuthRegisterAndLogin п.5, фича preview-flow): cookie
  // предпросмотра есть → бот сохраняется в аккаунт. null — сохранять нечего.
  claimPreview?: (request: Request, sessionToken: string) => Promise<{ status: string; clearCookie: boolean } | null>;
  // Приход по бейджу / демо-странице (фича public-page-and-summary, FR-GROWTH-006): только при РЕГИСТРАЦИИ — cookie
  // прихода пишется в новый аккаунт один раз. Сбой записи регистрацию не валит (метрика, а не доступ).
  recordArrival?: (request: Request, sessionToken: string) => Promise<void>;
  // Код из подписанной cookie /r/{code} (partner-and-studio): подпись и срок проверены, иначе null.
  referralCode?: (request: Request) => string | null;
}
const CLEAR_REFERRAL_COOKIE = '__Host-n6_ref=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const INVALID_CODE = { error: { code: 'invalid_partner_code', message: 'Код партнёра не найден или не действует. Проверьте код или оставьте поле пустым', field: 'partner_code' } };
const CLEAR_PREVIEW_COOKIE = '__Host-n6_preview=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
export function createAuthHandler(action: 'login' | 'register' | 'logout', deps: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      // Порядок — защита (security-operation-order): лимит ДО Origin и ДО чтения тела.
      const ip = clientIp(request.headers);
      const logoutToken = action === 'logout' ? readSessionCookie(request) : null;
      const session = logoutToken ? await deps.auth.authenticate(logoutToken) : null;
      if (!await deps.allowMutation(ip, session?.account_id)) return fail(429, 'limit', 'Слишком много запросов. Повторите через минуту');
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(deps.publicOrigin).origin) return fail(403, 'origin_not_allowed', 'Источник запроса не разрешён');
      if (action === 'logout') {
        if (logoutToken) await deps.auth.logout(logoutToken);
        return json({ data: { ok: true } }, 200, cookie('', 0));
      }
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return fail(422, 'invalid', 'Ожидается JSON с почтой и паролем');
      }
      // Ограничение потока действительно и при отсутствии/подделке Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return fail(422, 'invalid', 'Укажите почту и пароль');
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); return fail(413, 'too_large', 'Тело запроса слишком велико'); }
        chunks.push(value);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return fail(422, 'invalid', 'Непригодный JSON'); }
      const parsed = (action === 'register' ? registerSchema : inputSchema).safeParse(body);
      if (!parsed.success) return fail(422, 'invalid', 'Укажите корректную почту и пароль от 8 символов до 72 байт');
      const { email, password } = parsed.data;
      const rawCode = action === 'register' ? (parsed.data as { partner_code?: string }).partner_code : undefined;
      const explicit = rawCode?.trim() || null;
      const referral = action === 'register' ? deps.referralCode?.(request) ?? null : null;
      const token = action === 'register'
        ? await deps.auth.registerWithCode(email, password, ipPrefix(ip), { explicit, cookie: referral })
        : await deps.auth.login(email, password, ipPrefix(ip));
      // Регистрация отвечает null только на явный неверный код: ошибка поля, аккаунта нет, к cookie не откатываемся.
      if (!token) return action === 'register' ? json(INVALID_CODE, 422) : json(LOGIN_FAILURE, 401);
      const cookies = [cookie(token)];
      if (action === 'register' && referral) cookies.push(CLEAR_REFERRAL_COOKIE);
      let preview: string | undefined;
      if (deps.claimPreview) {
        // Сбой сохранения предпросмотра вход и регистрацию НЕ валит (SC-US-003-2): экран предложит повторить.
        try {
          const claimed = await deps.claimPreview(request, token);
          if (claimed) { preview = claimed.status; if (claimed.clearCookie) cookies.push(CLEAR_PREVIEW_COOKIE); }
        } catch { preview = 'unavailable'; console.error('Авторизация: предпросмотр не сохранён — вход выполнен без него'); }
      }
      if (action === 'register' && deps.recordArrival) {
        try { await deps.recordArrival(request, token); }
        catch { console.error('Авторизация: приход по бейджу не записан — регистрация выполнена без него'); }
      }
      return json({ data: { ok: true, ...(preview ? { preview } : {}) } }, 200, cookies);
    } catch (error) {
      console.error('Авторизация: запрос не завершён; вход временно недоступен', error instanceof Error ? error.message : '');
      return fail(503, 'unavailable', 'Вход временно недоступен. Повторите позже');
    }
  };
}
