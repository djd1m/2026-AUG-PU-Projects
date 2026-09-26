// Маршруты партнёра и студии (фича partner-and-studio; FR-PARTNER-001…003, FR-GROWTH-004; SC-US-012-1/2). Порядок входа —
// общий для мутаций владельца (cabinet-handler guardMutation): лимит двери → Origin → сессия → тело (закрытый набор ключей)
// → поля → запись. Партнёр и студия — ТОЛЬКО из сессии; id партнёра из запроса не читается (N4 routes/earnings.ts).
// Кабинет партнёра N4 по сессии — АДАПТИРОВАНО в Next; кабинет по токену N1 не берётся (у N6 есть вход).
import type { AcceptInviteResult, CreateInviteResult, PartnerCabinet, StudioCabinet } from '@n6/db';
import { PAYOUT_DETAILS_MESSAGES, validatePayoutDetails, type PayoutDetails } from '@n6/rag/payout-details';
import { z } from 'zod';
import { readSessionCookie } from './auth-handler';
import { body, guardMutation } from './cabinet-handler';
import { clientIp, ipPrefix } from './ip';

export interface PartnerDependencies {
  publicOrigin: string;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  partnerCabinet: (accountId: string) => Promise<PartnerCabinet | null>;
  savePayoutDetails: (accountId: string, details: PayoutDetails) => Promise<boolean>;
  studioCabinet: (accountId: string) => Promise<StudioCabinet | null>;
  createInvite: (input: { studioAccountId: string; botId: string; email: string }) => Promise<CreateInviteResult>;
  acceptInvite: (input: { token: string; clientAccountId: string; ipPrefix: string }) => Promise<AcceptInviteResult>;
  log?: (line: string) => void;
}

const json = (payload: object, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string, field?: string) => json({ error: { code, message, ...(field ? { field } : {}) } }, status);
const unauthorized = () => fail(401, 'unauthorized', 'Войдите, чтобы продолжить');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const email = z.string().trim().email().max(254).transform((v) => v.toLowerCase());

function run(deps: PartnerDependencies, what: string, handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    (deps.log ?? console.error)(`Партнёрка: ${what} не выполнено (${error instanceof Error ? error.name : 'ошибка'})`);
    return fail(503, 'unavailable', 'Временно недоступно. Повторите через минуту');
  });
}
async function sessionOf(request: Request, deps: PartnerDependencies): Promise<string | null> {
  const token = readSessionCookie(request);
  return token ? (await deps.authenticate(token))?.account_id ?? null : null;
}

// GET /api/partner/summary — код, когорта, деньги («к выплате 5-го / перенесено / долг»). Не партнёр — 404.
export function createPartnerSummaryHandler(deps: PartnerDependencies) {
  return (request: Request) => run(deps, 'сводка партнёра', async () => {
    const accountId = await sessionOf(request, deps);
    if (!accountId) return unauthorized();
    const cabinet = await deps.partnerCabinet(accountId);
    return cabinet ? json({ data: cabinet }) : fail(404, 'not_partner', 'У аккаунта нет кода партнёра');
  });
}

// POST /api/partner/payout-details { method: 'sbp', phone, bank? } — реквизиты выплаты; номер карты — отказ (AC-13).
export function createPayoutDetailsHandler(deps: PartnerDependencies) {
  return (request: Request) => run(deps, 'реквизиты выплаты', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    const input = await body(request, ['method', 'phone', 'bank']);
    if (input instanceof Response) return input;
    const checked = validatePayoutDetails(input);
    if (!checked.ok) return fail(422, checked.error, PAYOUT_DETAILS_MESSAGES[checked.error], checked.error === 'invalid_bank' ? 'bank' : 'phone');
    if (!await deps.partnerCabinet(entry.accountId)) return fail(404, 'not_partner', 'У аккаунта нет кода партнёра');
    return await deps.savePayoutDetails(entry.accountId, checked.value) ? json({ data: { saved: true } }) : unauthorized();
  });
}

// GET /api/studio/summary — боты студии и переданные клиентам (только числа), когорта по коду студии.
export function createStudioSummaryHandler(deps: PartnerDependencies) {
  return (request: Request) => run(deps, 'сводка студии', async () => {
    const accountId = await sessionOf(request, deps);
    if (!accountId) return unauthorized();
    const cabinet = await deps.studioCabinet(accountId);
    return cabinet ? json({ data: cabinet }) : unauthorized();
  });
}

// POST /api/bots/{bot_id}/invite { email } — «Передать клиенту» (SC-US-012-1). Ссылка возвращается студии ОДИН раз: почтового
// провайдера в продукте нет, студия пересылает её клиенту сама.
export function createInviteHandler(deps: PartnerDependencies) {
  return (request: Request, botId: string) => run(deps, 'приглашение клиента', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return fail(404, 'not_found', 'Бот не найден');
    const input = await body(request, ['email']);
    if (input instanceof Response) return input;
    const parsed = email.safeParse(input.email);
    if (!parsed.success) return fail(422, 'invalid', 'Укажите почту клиента', 'email');
    const result = await deps.createInvite({ studioAccountId: entry.accountId, botId, email: parsed.data });
    switch (result.kind) {
      case 'created': return json({ data: { url: new URL(`/invite/${result.token}`, deps.publicOrigin).href, expires_at: result.expiresAt } }, 201);
      case 'not_studio': return fail(403, 'plan_required', 'Передавать ботов клиентам можно на плане «Студия»');
      case 'transferred': return fail(409, 'transferred', 'Бот уже передан клиенту');
      case 'contact_required': return fail(409, 'contact_required', 'Укажите контакт для «не знаю» в настройках бота — без него бот клиенту не ответит', 'contact');
      default: return fail(404, 'not_found', 'Бот не найден');
    }
  });
}

// POST /api/invites/{token}/accept — приём (SC-US-012-2): истёкшее 410, использованное 409, предел ботов клиента 409.
export function createAcceptInviteHandler(deps: PartnerDependencies) {
  return (request: Request, token: string) => run(deps, 'приём приглашения', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    if (!TOKEN.test(token)) return fail(404, 'not_found', 'Приглашение не найдено');
    const result = await deps.acceptInvite({ token, clientAccountId: entry.accountId, ipPrefix: ipPrefix(clientIp(request.headers)) });
    switch (result.kind) {
      case 'accepted': return json({ data: { bot_id: result.botId } });
      case 'used': return fail(409, 'used', 'Приглашение уже использовано');
      case 'expired': return fail(410, 'expired', 'Срок приглашения истёк — попросите студию прислать новое');
      case 'own_invite': return fail(409, 'own_invite', 'Это ваше приглашение: его принимает клиент');
      case 'plan_limit': return fail(409, 'plan_limit', `Предел плана ${result.plan}: не больше ${result.limit} ${result.limit === 1 ? 'бота' : 'ботов'}. Смените план на странице «Тарифы» и примите приглашение снова`);
      default: return fail(404, 'not_found', 'Приглашение не найдено');
    }
  });
}
