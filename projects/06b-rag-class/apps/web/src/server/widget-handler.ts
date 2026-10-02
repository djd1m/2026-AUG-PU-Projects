import { type Pool, type WidgetBot, readWidgetBot, recordWidgetConfig, recordWidgetQuestion,
  recordWidgetEvent, clientIp, visitorKey, ClientAddressUnavailable } from '@n6b/db';
import { answerQuestion, type PaidGateway } from '@n6b/rag';
import { readJson } from './auth-handler';
import { metricHost, excludedMetricHost } from './metric-host';
import { badgeRequired, PRIVACY_NOTICE, PUBLIC_ID_RE, requestOrigin } from './widget-policy';

export interface WidgetDeps {
  readonly servicePool: Pool;
  readonly publicBaseUrl: string;
  readonly visitorSecret: string;
  readonly gateway: PaidGateway;
  readonly minSimilarity: number;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}
type Kind = 'config' | 'ask' | 'event';
const fail = (status: number, code: string, message: string, headers?: Headers) => Response.json(
  { error: { code, message } }, { status, headers: headers ?? { 'Cache-Control': 'no-store' } });

async function gate(request: Request, deps: WidgetDeps): Promise<Response | { bot: WidgetBot; origin: string }> {
  const ids = new URL(request.url).searchParams.getAll('bot');
  if (ids.length !== 1 || !PUBLIC_ID_RE.test(ids[0]!)) return fail(404, 'not_found', 'Не найдено');
  const bot = await readWidgetBot(deps.servicePool, ids[0]!);
  if (!bot) return fail(404, 'not_found', 'Не найдено');
  const origin = requestOrigin(request.headers.get('origin'));
  if (!origin || !bot.allowed_origins.includes(origin)) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
  return { bot, origin };
}

export function createWidgetHandler(kind: Kind, deps: WidgetDeps) {
  return async (request: Request): Promise<Response> => {
    let headers: Headers | undefined;
    try {
      const allowed = await gate(request, deps);
      if (allowed instanceof Response) return allowed;
      const { bot, origin } = allowed;
      headers = new Headers({ 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
      if (request.method === 'OPTIONS') {
        headers.set('Access-Control-Allow-Methods', kind === 'config' ? 'GET' : 'POST');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== (kind === 'config' ? 'GET' : 'POST')) return fail(405, 'method_not_allowed', 'Метод не разрешён', headers);
      const host = metricHost(origin)!;
      const metricEligible = bot.metric_eligible && !excludedMetricHost(host, deps.publicBaseUrl);
      if (kind === 'config') {
        const pages = new URL(request.url).searchParams.getAll('page');
        const page = pages.length === 1 ? pages[0]! : '';
        if (metricEligible && metricHost(page) === host) await recordWidgetConfig(deps.servicePool, bot, host, page);
        return Response.json({ data: { name: bot.name, badge_required: badgeRequired(bot.plan, bot.badge_removal),
          badge_url: new URL(`/r/b/${bot.public_id}`, deps.publicBaseUrl).href, privacy_notice: PRIVACY_NOTICE } }, { headers });
      }
      const raw = await readJson(request, { objectOnly: true });
      if (raw === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико', headers);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(422, 'invalid_body', 'Укажите корректный JSON', headers);
      const body = raw as { bot?: unknown; question?: unknown; kind?: unknown };
      if (body.bot !== undefined && body.bot !== bot.public_id) return fail(422, 'bot_mismatch', 'Бот не совпадает', headers);
      if (kind === 'ask' && (typeof body.question !== 'string' || !body.question.trim() || body.question.length > 500)) {
        return fail(422, 'invalid_question', 'Введите вопрос от 1 до 500 символов', headers);
      }
      if (kind === 'event' && body.kind !== 'impression' && body.kind !== 'tamper') {
        return fail(422, 'invalid_event', 'Событие не разрешено', headers);
      }
      const ip = clientIp(request.headers);
      const key = visitorKey(deps.visitorSecret, ip, bot.id);
      if (kind === 'event') {
        await recordWidgetEvent(deps.servicePool, bot, body.kind as 'impression' | 'tamper', key, deps.now?.() ?? new Date());
        return new Response(null, { status: 204, headers });
      }
      const result = await answerQuestion(deps, { bot, question: body.question as string,
        channel: { kind: 'visitor', ip, botId: bot.id }, logChannel: 'widget', visitorKey: key, originHost: host });
      if (result.status === 200) {
        if (metricEligible) await recordWidgetQuestion(deps.servicePool, bot, host);
        return Response.json({ data: result.data }, { headers });
      }
      if (result.error.retryAfterSeconds !== undefined) headers.set('Retry-After', String(result.error.retryAfterSeconds));
      return Response.json({ error: { code: result.error.code, message: result.error.message }, contact: result.contact },
        { status: result.status, headers });
    } catch (error) {
      (deps.log ?? console.error)(`widget: ${(error as Error).name}`);
      return fail(503, error instanceof ClientAddressUnavailable ? 'client_address_unavailable' : 'widget_unavailable',
        'Сервис временно недоступен. Повторите позже', headers);
    }
  };
}
