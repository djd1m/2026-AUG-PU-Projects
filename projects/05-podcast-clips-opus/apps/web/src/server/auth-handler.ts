import { z } from 'zod';
import { type AuthService, LOGIN_FAILURE, SESSION_TTL_SECONDS } from './auth';
import { clientIp, ipPrefix } from './ip';

const inputSchema = z.object({
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).refine((v) => Buffer.byteLength(v, 'utf8') <= 72,
    'Пароль превышает безопасную длину bcrypt'),
}).strict();
const COOKIE_NAME = '__Host-n5_session';
function json(body: object, status = 200, cookie?: string): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}
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
  trustedProxyHops: number;
  allowMutation: (ip: string) => Promise<boolean>;
}
export function createAuthHandler(action: 'login' | 'register' | 'logout', deps: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const ip = clientIp(request.headers, deps.trustedProxyHops);
      if (!await deps.allowMutation(ip)) return json({ error: 'Слишком много запросов. Повторите через минуту' }, 429);
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(deps.publicOrigin).origin) return json({ error: 'Источник запроса не разрешён' }, 403);
      if (action === 'logout') {
        const token = readSessionCookie(request);
        if (token) await deps.auth.logout(token);
        return json({ ok: true }, 200, cookie('', 0));
      }
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return json({ error: 'Ожидается JSON с почтой и паролем' }, 422);
      }
      // Ограничение потока действительно и при отсутствии/подделке Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Укажите почту и пароль' }, 422);
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return json({ error: 'Тело запроса слишком велико' }, 413); }
        chunks.push(value);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json({ error: 'Непригодный JSON' }, 422); }
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) return json({ error: 'Укажите корректную почту и пароль от 8 символов до 72 байт' }, 422);
      const { email, password } = parsed.data;
      const token = await deps.auth[action](email, password, ipPrefix(ip));
      if (!token) return json(LOGIN_FAILURE, 401);
      return json({ ok: true }, 200, cookie(token));
    } catch {
      return json({ error: 'Вход временно недоступен. Повторите позже' }, 503);
    }
  };
}
