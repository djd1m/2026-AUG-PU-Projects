import { type Pool, readDemoBot, DEMO_SLUG_RE, clientIp, visitorKey, ClientAddressUnavailable } from '@n6b/db';
import { answerQuestion, type PaidGateway } from '@n6b/rag';
import { readJson } from './auth-handler';
import { requestOrigin } from './widget-policy';

export interface DemoDeps {
  readonly servicePool: Pool;
  readonly publicBaseUrl: string;
  readonly visitorSecret: string;
  readonly gateway: PaidGateway;
  readonly minSimilarity: number;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

/** Simple cross-origin POSTs must be denied before body parsing, quota or provider work. */
export function demoRequestAllowed(request: Request, publicBaseUrl: string): boolean {
  return request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/json'
    && requestOrigin(request.headers.get('origin')) === new URL(publicBaseUrl).origin;
}

export function createDemoHandler(deps: DemoDeps) {
  return async (request: Request, slug: string): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status, headers });
    try {
      if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'Метод не разрешён');
      if (!demoRequestAllowed(request, deps.publicBaseUrl)) return fail(403, 'forbidden_origin', 'Источник или формат запроса не разрешён');
      if (!DEMO_SLUG_RE.test(slug)) return fail(404, 'not_found', 'Не найдено');
      const bot = await readDemoBot(deps.servicePool, slug);
      if (!bot) return fail(404, 'not_found', 'Не найдено');
      const raw = await readJson(request, { objectOnly: true });
      if (raw === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      const question = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as { question?: unknown }).question : undefined;
      if (typeof question !== 'string' || !question.trim() || question.length > 500) {
        return fail(422, 'invalid_question', 'Введите вопрос от 1 до 500 символов');
      }
      // Identity and visitor authority always come from the stored bot and trusted proxy address.
      const ip = clientIp(request.headers);
      const key = visitorKey(deps.visitorSecret, ip, bot.id);
      const result = await answerQuestion(deps, { bot, question, channel: { kind: 'visitor', ip, botId: bot.id },
        logChannel: 'demo', visitorKey: key });
      if (result.status === 200) return Response.json({ data: result.data }, { headers });
      if (result.error.retryAfterSeconds !== undefined) headers.set('Retry-After', String(result.error.retryAfterSeconds));
      return Response.json({ error: { code: result.error.code, message: result.error.message }, contact: result.contact },
        { status: result.status, headers });
    } catch (error) {
      (deps.log ?? console.error)(`demo: ${(error as Error).name}`);
      return fail(503, error instanceof ClientAddressUnavailable ? 'client_address_unavailable' : 'demo_unavailable',
        'Сервис временно недоступен. Повторите позже');
    }
  };
}
