// Маршруты удаления (фича account-erasure; FR-AUTH-002, SC-US-015-1; A-N6-054). DELETE /api/account — удалить аккаунт;
// POST /api/bots/{bot_id}/question-log/erase — стереть журнал вопросов бота отдельно (FR-AUTH-002, вторая фраза).
// Донор N4 routes/account-delete.ts — АДАПТИРОВАНО в route handler Next с порядком входа кабинета; N5 erasure.ts —
// требование явного confirm: true (закрытое тело).
//
// ПОРЯДОК (security-operation-order): лимит двери → Origin → сессия → тело (≤ 4 КиБ, закрытый набор) → confirm → пароль
// (bcrypt ВНЕ транзакции, для отсутствующего хэша — фиктивный, равное время) → ОДНА транзакция RequestErasure. Ответ 202:
// удаление принято, стирание идёт отдельно (≤ 72 ч) — квитанция-cookie даёт видеть состояние без сессии, сессия снята.
import type { RequestErasureResult } from '@n6/db';
import { COOKIE_NAME } from './auth-handler';
import { body, guardMutation } from './cabinet-handler';

export interface AccountDependencies {
  publicOrigin: string;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  // Совпадает ли пароль активного аккаунта; сравнение ВСЕГДА выполняется (равное время), сетевых вызовов нет.
  checkPassword: (accountId: string, password: string) => Promise<boolean>;
  requestErasure: (accountId: string) => Promise<RequestErasureResult>;
  receiptCookie: (accountId: string) => string;
  eraseQuestionLog: (botId: string, accountId: string) => Promise<{ erased: number } | null>;
  log?: (line: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLEAR_SESSION = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function json(payload: object, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(payload, { status, headers });
}
const fail = (status: number, code: string, message: string, field?: string) => json({ error: { code, message, ...(field ? { field } : {}) } }, status);
const unauthorized = () => fail(401, 'unauthorized', 'Войдите, чтобы продолжить');
function run(deps: AccountDependencies, what: string, handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    (deps.log ?? console.error)(`Аккаунт: ${what} не выполнено (${error instanceof Error ? error.name : 'ошибка'})`);
    return fail(503, 'unavailable', 'Временно недоступно. Повторите через минуту');
  });
}

// DELETE /api/account { confirm: true, password } — RequestErasure (AC-1…AC-4).
export function createAccountDeleteHandler(deps: AccountDependencies) {
  return (request: Request) => run(deps, 'удаление аккаунта', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    const input = await body(request, ['confirm', 'password']);
    if (input instanceof Response) return input;
    if (input.confirm !== true) return fail(400, 'confirmation_required', 'Подтвердите необратимое удаление аккаунта', 'confirm');
    const password = input.password;
    if (typeof password !== 'string' || password.length === 0 || Buffer.byteLength(password, 'utf8') > 72) {
      return fail(400, 'invalid', 'Введите пароль от аккаунта', 'password');
    }
    if (!await deps.checkPassword(entry.accountId, password)) return fail(401, 'invalid_password', 'Неверный пароль', 'password');
    const result = await deps.requestErasure(entry.accountId);
    if (result.kind === 'already') return fail(409, 'erasure_already_running', 'Удаление уже запущено');
    if (result.kind === 'not_found') return unauthorized();
    return json({ data: { accepted: true, erase_deadline: result.eraseDeadline } }, 202, [deps.receiptCookie(entry.accountId), CLEAR_SESSION]);
  });
}

// POST /api/bots/{bot_id}/question-log/erase { confirm: true } — стереть журнал вопросов своего бота (AC-12). Чужой — 404.
export function createQuestionLogEraseHandler(deps: AccountDependencies) {
  return (request: Request, botId: string) => run(deps, 'стирание журнала вопросов', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return fail(404, 'not_found', 'Бот не найден');
    const input = await body(request, ['confirm']);
    if (input instanceof Response) return input;
    if (input.confirm !== true) return fail(400, 'confirmation_required', 'Подтвердите стирание журнала вопросов', 'confirm');
    const result = await deps.eraseQuestionLog(botId, entry.accountId);
    return result ? json({ data: result }) : fail(404, 'not_found', 'Бот не найден');
  });
}
