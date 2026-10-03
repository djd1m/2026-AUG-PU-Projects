import { type Pool, readAnswerBot } from '@n6b/db';
import { answerQuestion, type PaidGateway } from '@n6b/rag';
import { readJson, readSessionCookie } from './auth-handler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface AskDeps {
  readonly authenticate: (token: string) => Promise<string | null>;
  readonly tenantPool: Pool;
  readonly servicePool: Pool;
  readonly publicBaseUrl: string;
  readonly gateway: PaidGateway;
  readonly minSimilarity: number;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}
const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } },
  { status, headers: { 'Cache-Control': 'no-store' } });

export function createAskHandler(deps: AskDeps) {
  const origin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request, botId: string): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== origin) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      if (!UUID_RE.test(botId)) return fail(404, 'not_found', 'Не найдено');
      const body = await readJson(request);
      if (body === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      const question = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { question?: unknown }).question : undefined;
      // Only question is accepted: account, visitor and channel are always server-derived.
      if (typeof question !== 'string' || !question.trim() || question.length > 500) {
        return fail(422, 'invalid_question', 'Введите вопрос от 1 до 500 символов');
      }
      const bot = await readAnswerBot(deps.tenantPool, accountId, botId);
      if (!bot) return fail(404, 'not_found', 'Не найдено');
      const result = await answerQuestion(deps, { bot, question,
        channel: { kind: 'sandbox', accountId: bot.accountId }, logChannel: 'sandbox' });
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
      if (result.status === 200) return Response.json({ data: result.data }, { headers });
      if (result.error.retryAfterSeconds !== undefined) headers['Retry-After'] = String(result.error.retryAfterSeconds);
      return Response.json({ error: { code: result.error.code, message: result.error.message }, contact: result.contact },
        { status: result.status, headers });
    } catch (error) {
      (deps.log ?? console.error)(`ask: ${(error as Error).name}`);
      return fail(503, 'answer_unavailable', 'Сервис ответа временно недоступен');
    }
  };
}
