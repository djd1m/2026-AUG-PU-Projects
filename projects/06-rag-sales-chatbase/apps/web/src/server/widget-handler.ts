// Маршруты виджета на ЧУЖОМ origin (фича widget-runtime-and-badge; FR-WIDGET-002, FR-TARIFF-001, FR-GROWTH-003,
// FR-BOT-003; SC-US-011-2; Pseudocode ResolveWidgetConfig, CheckOrigin, RecordWidgetInstall, RecordGrowthEvent).
// из N1: projects/01-testimonials-senja/apps/web/src/lib/widget-config.ts — адаптировано (см. packages/db/src/widget.ts):
// + CheckOrigin по списку бота, + OPTIONS, форма ответа N6 { data } | { error }, бот без контакта — 404.
//
// ПОРЯДОК (security-operation-order): бот по public_key (нет, не активен, владелец не активен, нет годного
// контакта — 404) → CheckOrigin (отказ — 403 БЕЗ Access-Control-Allow-Origin и без записи) → BadgeRequired по
// плану владельца из БД → RecordWidgetInstall(first_config) → токен сессии посетителя (visitor-token.ts; фича
// visitor-ask-and-limits) → ответ с `no-store`. Смена плана действует со
// следующего запроса конфигурации (ADR-004 «Последствия»). Лимит частоты — дверь (Caddy, 120 чтений/мин на IP);
// события — ещё и лимит мутаций приложения, как у остальных POST.
import { readAccountStatus, readBotStatus } from '@n6/rag';
import { readContact } from '@n6/rag/bot-settings';
import type { BadgeEventResult, BadgeEventType, InstallEvent, InstallResult, WidgetBotRow } from '@n6/db';
import { badgeHref, badgeRequired } from '../lib/badge-required';
import { checkOrigin, corsHeaders, PREFLIGHT_HEADERS, requestOrigin } from './check-origin';
import { clientIp, ipPrefix } from './ip';
import { isPlainObject, readJsonBody } from './preview-session';
import { issueVisitorToken, readVisitorToken } from './visitor-token';

export interface WidgetDependencies {
  publicOrigin: string;
  // Секрет подписи токена сессии посетителя (SESSION_SECRET web, своя метка домена в HMAC — visitor-token.ts).
  secret: string;
  loadBot: (publicKey: string) => Promise<WidgetBotRow | null>;
  originAllowedAnywhere: (origin: string) => Promise<boolean>;
  recordInstall: (input: { botId: string; origin: string; event: InstallEvent }) => Promise<InstallResult>;
  recordBadgeEvent: (input: { botId: string; visitorSession: string; ipPrefix: string; origin: string; type: BadgeEventType }) => Promise<BadgeEventResult>;
  allowMutation: (ip: string) => Promise<boolean>;
  log?: (line: string) => void;
}

const MAX_EVENT_BYTES = 1024;
const EVENT_TYPES: readonly BadgeEventType[] = ['badge_impression', 'badge_click'];
const BASE = { 'Cache-Control': 'no-store' };

export const reply = (status: number, body: object | null, origin?: string) =>
  new Response(body === null ? null : JSON.stringify(body), { status,
    headers: { ...BASE, ...(body === null ? {} : { 'Content-Type': 'application/json' }), ...(origin ? corsHeaders(origin) : {}) } });
export const fail = (status: number, code: string, message: string, origin?: string) => reply(status, { error: { code, message } }, origin);
export const notFound = () => fail(404, 'not_found', 'Бот не найден');
export const refused = () => fail(403, 'origin_not_allowed', 'Домен сайта не входит в список разрешённых для этого бота');

export interface WidgetBot { row: WidgetBotRow; contact: string }
// Бот, которому виджет вообще отвечает: активен, владелец активен, контакт для «не знаю» проходит проверку.
// Неизвестный статус читается как deleted (канон §4) — один и тот же 404.
export function usableBot(row: WidgetBotRow | null): WidgetBot | null {
  if (!row || readBotStatus(row.status) !== 'active' || readAccountStatus(row.accountStatus) !== 'active') return null;
  const contact = readContact(row.contact);
  return contact ? { row, contact } : null;
}

export function guard<T extends unknown[]>(deps: WidgetDependencies, what: string, handler: (...args: T) => Promise<Response>) {
  return (...args: T): Promise<Response> => handler(...args).catch((error: unknown) => {
    (deps.log ?? ((line: string) => console.error(line)))(`Виджет: ${what} не выполнено (${error instanceof Error ? error.name : 'ошибка'})`);
    return fail(503, 'unavailable', 'Сервис временно недоступен');
  });
}

// GET /w/v1/config?bot={public_key}
export function createWidgetConfigHandler(deps: WidgetDependencies) {
  return guard(deps, 'конфигурация', async (request: Request): Promise<Response> => {
    const key = new URL(request.url).searchParams.get('bot') ?? '';
    const bot = usableBot(await deps.loadBot(key));
    if (!bot) return notFound();
    const origin = checkOrigin(requestOrigin(request.headers), bot.row, deps.publicOrigin);
    if (!origin) return refused();
    const required = badgeRequired(bot.row.plan);
    await deps.recordInstall({ botId: bot.row.botId, origin, event: 'first_config' });
    // Токен сессии посетителя: прежний (?vs= из sessionStorage виджета) продолжается, если годен для бота, origin и /24.
    const token = issueVisitorToken(deps.secret, { botId: bot.row.botId, origin, ipPrefix: ipPrefix(clientIp(request.headers)) },
      new URL(request.url).searchParams.get('vs'));
    return reply(200, { data: {
      company_name: bot.row.companyName, greeting: bot.row.greeting, contact: bot.contact,
      badge_required: required, badge_href: required ? badgeHref(deps.publicOrigin, origin) : null, visitor_session: token,
    } }, origin);
  });
}

// OPTIONS /w/v1/* — предполётный запрос POST. У /w/v1/ask бот в адресе (?bot=) — разрешение по списку ЭТОГО бота;
// у /w/v1/event бот в теле — origin из списка хотя бы одного бота (или свой origin); сам POST затем проверяется
// против списка СВОЕГО бота.
export function createWidgetPreflightHandler(deps: WidgetDependencies) {
  return guard(deps, 'предполётный запрос', async (request: Request): Promise<Response> => {
    const origin = requestOrigin(request.headers);
    const key = new URL(request.url).searchParams.get('bot');
    const found = key === null ? null : usableBot(await deps.loadBot(key));
    const allowed = origin !== null && (key !== null ? found !== null && checkOrigin(origin, found.row, deps.publicOrigin) !== null
      : origin === new URL(deps.publicOrigin).origin || await deps.originAllowedAnywhere(origin));
    if (!origin || !allowed) return new Response(null, { status: 403, headers: BASE });
    return new Response(null, { status: 204, headers: { ...BASE, ...corsHeaders(origin), ...PREFLIGHT_HEADERS } });
  });
}

// POST /w/v1/event { bot, visitor_session, type ∈ {badge_impression, badge_click} } → 204.
export function createWidgetEventHandler(deps: WidgetDependencies) {
  return guard(deps, 'событие бейджа', async (request: Request): Promise<Response> => {
    const ip = clientIp(request.headers);
    if (!await deps.allowMutation(ip)) return fail(429, 'limit', 'Слишком много запросов');
    const read = await readJsonBody(request, MAX_EVENT_BYTES);
    if (!read.ok) return read.code === 'too_large' ? fail(413, 'too_large', 'Тело слишком велико') : fail(400, 'invalid', 'Ожидается JSON');
    if (!isPlainObject(read.body) || typeof read.body.bot !== 'string') return fail(400, 'invalid', 'Ожидается { bot, visitor_session, type }');
    const body = read.body;
    const bot = usableBot(await deps.loadBot(body.bot as string));
    if (!bot) return notFound();
    const origin = checkOrigin(requestOrigin(request.headers), bot.row, deps.publicOrigin);
    if (!origin) return refused();
    const extra = Object.keys(body).find((k) => !['bot', 'visitor_session', 'type'].includes(k));
    if (extra) return fail(400, 'unexpected_field', `Поле «${extra.slice(0, 40)}» не принимается`, origin);
    const type = EVENT_TYPES.find((t) => t === body.type);
    if (!type) return fail(400, 'invalid', 'Неизвестное событие', origin);
    // Сессия — только из токена, выданного config для ЭТОГО бота, origin и /24 (visitor-token.ts).
    const session = readVisitorToken(deps.secret, body.visitor_session, { botId: bot.row.botId, origin, ipPrefix: ipPrefix(ip) });
    if (!session) return fail(400, 'invalid_session', 'Сессия посетителя непригодна — обновите страницу', origin);
    // Бот без бейджа (платный план) — показа не было, писать нечего: метрика i не должна считать чужие клики.
    if (!badgeRequired(bot.row.plan)) return reply(204, null, origin);
    const result = await deps.recordBadgeEvent({ botId: bot.row.botId, visitorSession: session, ipPrefix: ipPrefix(ip), origin, type });
    if (result === 'foreign_session') return fail(400, 'invalid_session', 'Сессия посетителя принадлежит другому виджету', origin);
    return reply(204, null, origin);
  });
}
