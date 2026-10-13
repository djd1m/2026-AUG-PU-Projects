import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { acceptHandover, issueHandover, type Pool, type QuotaDecision, type QuotaKey } from '@n6b/db';
import { type AuthService, BCRYPT_COST, type PasswordHasher } from './auth';
import { authQuotaKey, credentials, readJson, readSessionCookie, sessionCookie } from './auth-handler';
import { clientIp } from './ip';

export const HANDOVER_EMAIL_TAKEN = 'этот e-mail уже зарегистрирован: передача создаёт отдельный аккаунт, укажите другой e-mail';
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inputSchema = credentials.omit({ kind: true }).extend({ keep_studio_access: z.boolean() });
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'" };
const json = (status: number, body: object, cookie?: string) => Response.json(body,
  { status, headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
interface BaseDeps {
  servicePool: Pool; publicBaseUrl: string; log?: (line: string) => void;
}
export interface IssueHandoverDeps extends BaseDeps { authenticate: (token: string) => Promise<string | null> }
export interface AcceptHandoverDeps extends BaseDeps {
  auth: Pick<AuthService, 'prepareSession'>; hasher: PasswordHasher;
  visitorSecret: string; authLimitPerHour: number; production: boolean;
  reserve: (keys: readonly QuotaKey[]) => Promise<QuotaDecision>;
  now?: () => Date;
}
/** Accept Next's real empty ReadableStream; inspect actual bytes rather than Content-Length. */
async function optionalIssueBody(request: Request): Promise<'ok' | 'invalid' | 'too-large'> {
  const reader = request.body?.getReader();
  if (!reader) return 'ok';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); return 'too-large'; }
    if (value.byteLength) chunks.push(value);
  }
  if (!size) return 'ok';
  const body = await readJson(new Request(request, { body: Buffer.concat(chunks) }), { objectOnly: true });
  return body === 'invalid' || body === 'too-large' ? body : 'ok';
}
function safeUnavailable() { return fail(503, 'handover_unavailable', 'Сервис временно недоступен. Повторите позже'); }
export function createIssueHandoverHandler(deps: IssueHandoverDeps) {
  const ownOrigin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request, id: string): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== ownOrigin) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      const sessionToken = readSessionCookie(request);
      const actor = sessionToken ? await deps.authenticate(sessionToken) : null;
      if (!actor) return fail(401, 'unauthorized', 'Войдите в кабинет');
      if (!UUID.test(id)) return fail(403, 'handover_forbidden', 'Передача недоступна');
      const body = await optionalIssueBody(request);
      if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      if (body === 'invalid') return fail(422, 'invalid_body', 'Ожидается JSON-объект');
      const token = randomBytes(32).toString('base64url');
      const result = await issueHandover(deps.servicePool, actor, id, tokenHash(token));
      if (result === 'forbidden') return fail(403, 'handover_forbidden', 'Передача недоступна');
      return json(201, { data: { link: new URL(`/handover/${token}`, deps.publicBaseUrl).href,
        expires_at: result.expiresAt.toISOString() } });
    } catch { return safeUnavailable(); }
  };
}
export function createAcceptHandoverHandler(deps: AcceptHandoverDeps) {
  const ownOrigin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request, token: string): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== ownOrigin) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      if (!TOKEN.test(token) || Buffer.from(token, 'base64url').length !== 32
        || Buffer.from(token, 'base64url').toString('base64url') !== token) return fail(404, 'handover_missing', 'Ссылка не найдена');
      const body = await readJson(request, { objectOnly: true });
      if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      const parsed = inputSchema.safeParse(body === 'invalid' ? undefined : body);
      if (!parsed.success) return fail(422, 'invalid_handover', 'Укажите корректный e-mail, пароль от 10 символов и выбор доступа студии');
      const decision = await deps.reserve([authQuotaKey(deps.visitorSecret, clientIp(request.headers),
        deps.authLimitPerHour, deps.now?.() ?? new Date())]);
      if (!decision.ok) return fail(429, 'too_many_attempts', 'Слишком много попыток, повторите через час');
      const passwordHash = await deps.hasher.hash(parsed.data.password, BCRYPT_COST);
      const session = deps.auth.prepareSession();
      const result = await acceptHandover(deps.servicePool, { tokenHash: tokenHash(token), email: parsed.data.email,
        passwordHash, keepStudioAccess: parsed.data.keep_studio_access, session: session.record });
      if (result === 'missing') return fail(404, 'handover_missing', 'Ссылка не найдена');
      if (result === 'gone') return fail(410, 'handover_gone', 'Ссылка использована или срок её действия истёк');
      if (result === 'email-taken') return fail(409, 'email_taken', HANDOVER_EMAIL_TAKEN);
      // Audit failures cannot change a committed success or expose credentials/token/email.
      try { (deps.log ?? console.info)(`handover: accepted account=${result.accountId} keep=${parsed.data.keep_studio_access}`); } catch { /* committed */ }
      return json(200, { data: { ok: true } }, sessionCookie(session.token, deps.production));
    } catch { return safeUnavailable(); }
  };
}
