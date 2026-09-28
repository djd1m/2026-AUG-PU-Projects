// Маршруты кабинета бота (фича bot-cabinet; FR-BOT-001, FR-BOT-002, FR-TARIFF-003, FR-INDEX-003; SC-US-005-2,
// SC-US-012-3). Написано заново (ADR-016); вход и сессии — перенесённые в foundation блоки N5 (ADR-012,
// auth-handler.ts), форма ответов — { data } | { error: { code, message } } как у остальных маршрутов N6.
//
// ПОРЯДОК — это и есть защита (security-operation-order): лимит двери ДО тела → Origin (мутация без него — отказ)
// → сессия → владение ботом (account_id ТОЛЬКО из сессии, bot_id из адреса) → тело (≤ 4 КиБ, закрытый набор
// ключей) → проверка полей → запись. Сайт-источник: CheckAddress ДО записи и постановки. Вопрос владельца: бот
// из сессии → ядро answerQuestion (квота ДО эмбеддинга, порог ДО модели, проверка цитат ПОСЛЕ).
// Чужой, несуществующий, удалённый бот и нет сессии на маршруте бота — ОДИН ответ 404 (канон: «Чужой ресурс — 404»).
import type { AnswerResult, VisitorRequest } from '@n6/rag';
import type { AccountBotList, AddOriginResult, BotSettingsPatch, BotSummary, CreateBotInput, CreateBotResult, CreateSiteSourceResult, PublishResult,
  ReindexSourceResult } from '@n6/db';
import { parseAllowedOrigin, parseCompanyName, parseContact, parseGreeting } from '@n6/rag/bot-settings';
import { readSessionCookie } from './auth-handler';
import { clientIp } from './ip';
import { AddressRefusal } from './preview-handler';
import { isPlainObject, normalizeSiteUrl, readJsonBody } from './preview-session';

const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CabinetDependencies {
  publicOrigin: string;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  listBots: (accountId: string) => Promise<AccountBotList | null>;
  createBot: (input: CreateBotInput) => Promise<CreateBotResult>;
  newPublicKey: () => string;
  updateSettings: (botId: string, accountId: string, patch: BotSettingsPatch) => Promise<{ company_name: string; contact: string | null; greeting: string } | null>;
  addOrigin: (botId: string, accountId: string, origin: string) => Promise<AddOriginResult>;
  // CheckAddress: отказ — AddressRefusal; сетевой вызов DNS внутри.
  checkAddress: (url: string) => Promise<{ url: URL }>;
  // Владение проверяется ДО CheckAddress (чужому боту — 404 без DNS-запроса) и ещё раз в транзакции создания.
  ownsBot: (botId: string, accountId: string) => Promise<boolean>;
  createSite: (input: { accountId: string; botId: string; rootUrl: string; idempotencyKey: string }) => Promise<CreateSiteSourceResult>;
  findJob: (botId: string, idempotencyKey: string) => Promise<string | null>;
  reindex: (sourceId: string, accountId: string) => Promise<ReindexSourceResult>;
  deleteSource: (sourceId: string, accountId: string) => Promise<{ deleted: true; chunks: number } | null>;
  enqueue: (message: { index_job_id: string; generation: number }) => Promise<void>;
  // Ядро ответа в режиме owner: бот — только по сессии владельца; чужой → { status: 'not_found' }.
  answer: (botId: string, accountId: string, request: VisitorRequest) => Promise<AnswerResult>;
  // A-N6-035: отметка «Я проверил ответы бота» (visitor-ask-and-limits). Чужой — null.
  setVerified: (botId: string, accountId: string, verified: boolean) => Promise<{ answers_verified: boolean } | { kind: 'indexing' } | null>;
  // Демо-страница /b/{slug} и сводка за 7 дней (фича public-page-and-summary). Чужой — null.
  publish: (botId: string, accountId: string, input: { enabled: boolean; indexable: boolean }) => Promise<PublishResult>;
  summary: (botId: string, accountId: string) => Promise<BotSummary | null>;
  log?: (line: string) => void;
}

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const notFound = () => fail(404, 'not_found', 'Бот не найден');
const unavailable = () => fail(503, 'unavailable', 'Кабинет временно недоступен. Повторите через минуту');
const PLAN_NAME = { free: 'free', nobadge: 'nobadge', studio: 'studio' } as const;
const indexStartsLimit = (limit: number) =>
  fail(429, 'index_starts', `Сегодня у этого бота уже ${limit} запусков индексации — это предел на сутки. Новые источники и обновления — завтра`);
export const botsLimitMessage = (plan: keyof typeof PLAN_NAME, limit: number) =>
  `Предел плана ${PLAN_NAME[plan]}: не больше ${limit} ${limit === 1 ? 'бота' : 'ботов'} на аккаунт. Чтобы добавить ещё, смените план на странице «Тарифы»`;

type Entry = { accountId: string } | Response;
// Вход мутации кабинета: лимит двери (по аккаунту, если сессия есть) → Origin → сессия. Экспортирован для маршрутов
// оплаты и интереса (tariffs-and-interest): один порядок входа на все мутации владельца.
export async function guardMutation(request: Request, deps: Pick<CabinetDependencies, 'authenticate' | 'allowMutation' | 'publicOrigin'>, noSession: () => Response): Promise<Entry> {
  const token = readSessionCookie(request);
  const session = token ? await deps.authenticate(token) : null;
  if (!await deps.allowMutation(clientIp(request.headers), session?.account_id)) return fail(429, 'limit', 'Слишком много запросов. Повторите через минуту');
  if (request.headers.get('origin') !== new URL(deps.publicOrigin).origin) return fail(403, 'origin_not_allowed', 'Источник запроса не разрешён');
  return session ? { accountId: session.account_id } : noSession();
}
const unauthorized = () => fail(401, 'unauthorized', 'Войдите, чтобы открыть кабинет');
export async function body(request: Request, keys: readonly string[]): Promise<Record<string, unknown> | Response> {
  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (!read.ok) return read.code === 'too_large' ? fail(413, 'too_large', 'Тело запроса слишком велико') : fail(400, 'invalid', 'Ожидается JSON');
  if (!isPlainObject(read.body)) return fail(400, 'invalid', 'Ожидается JSON-объект');
  const extra = Object.keys(read.body).find((k) => !keys.includes(k));
  if (extra) return fail(400, 'unexpected_field', `Поле «${extra.slice(0, 40)}» не принимается`);
  return read.body;
}
const field = (name: string, message: string) => json({ error: { code: name === 'contact' ? 'invalid_contact' : 'invalid', message, field: name } }, 422);

function run(log: (line: string) => void, what: string, handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    log(`Кабинет: ${what} не выполнено (${error instanceof Error ? error.name : 'ошибка'})`);
    return unavailable();
  });
}
const logOf = (deps: CabinetDependencies) => deps.log ?? ((line: string) => console.error(line));

// GET /api/bots — свои боты и предел плана (для кнопки «Создать» и названия предела).
export function createBotsListHandler(deps: CabinetDependencies) {
  return (request: Request) => run(logOf(deps), 'список ботов', async () => {
    const token = readSessionCookie(request);
    const session = token ? await deps.authenticate(token) : null;
    if (!session) return unauthorized();
    const list = await deps.listBots(session.account_id);
    return list ? json({ data: list }) : unauthorized();
  });
}

// POST /api/bots — CreateBot (SC-US-012-3: 11-й бот на studio — отказ с названием предела).
export function createBotCreateHandler(deps: CabinetDependencies) {
  return (request: Request) => run(logOf(deps), 'создание бота', async () => {
    const entry = await guardMutation(request, deps, unauthorized);
    if (entry instanceof Response) return entry;
    const input = await body(request, ['company_name', 'contact', 'greeting']);
    if (input instanceof Response) return input;
    const name = parseCompanyName(input.company_name);
    if (!name.ok) return field('company_name', name.message);
    let contact: string | null = null;
    if (input.contact !== undefined && input.contact !== '') {
      const parsed = parseContact(input.contact);
      if (!parsed.ok) return field('contact', parsed.message);
      contact = parsed.value;
    }
    const greeting = parseGreeting(input.greeting ?? '');
    if (!greeting.ok) return field('greeting', greeting.message);
    const result = await deps.createBot({ accountId: entry.accountId, companyName: name.value, contact, greeting: greeting.value, publicKey: deps.newPublicKey() });
    if (result.kind === 'plan_limit') return fail(403, 'plan_limit', botsLimitMessage(result.plan, result.limit));
    if (result.kind === 'not_found') return unauthorized();
    return json({ data: { bot_id: result.botId, public_key: result.publicKey } }, 201);
  });
}

// PATCH /api/bots/{bot_id} — настройки (FR-BOT-001). Контакт стереть нельзя: без него виджет не отвечает, а код
// установки не показывается — пустое значение отвергается, а не сохраняется молча.
export function createBotPatchHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'сохранение настроек', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return notFound();
    const input = await body(request, ['company_name', 'contact', 'greeting']);
    if (input instanceof Response) return input;
    if (!Object.keys(input).length) return fail(400, 'invalid', 'Нечего сохранять');
    const patch: BotSettingsPatch = {};
    if (input.company_name !== undefined) {
      const name = parseCompanyName(input.company_name);
      if (!name.ok) return field('company_name', name.message);
      patch.companyName = name.value;
    }
    if (input.contact !== undefined) {
      const contact = parseContact(input.contact);
      if (!contact.ok) return field('contact', contact.message);
      patch.contact = contact.value;
    }
    if (input.greeting !== undefined) {
      const greeting = parseGreeting(input.greeting);
      if (!greeting.ok) return field('greeting', greeting.message);
      patch.greeting = greeting.value;
    }
    const saved = await deps.updateSettings(botId, entry.accountId, patch);
    return saved ? json({ data: saved }) : notFound();
  });
}

// POST /api/bots/{bot_id}/origins — AddAllowedOrigin (SC-US-005-2): «shop.example» → https://shop.example.
export function createOriginAddHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'добавление домена', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return notFound();
    const input = await body(request, ['domain']);
    if (input instanceof Response) return input;
    const parsed = parseAllowedOrigin(input.domain, deps.publicOrigin);
    if (!parsed.ok) return json({ error: { code: 'invalid_origin', message: parsed.message, field: 'domain' } }, 422);
    const result = await deps.addOrigin(botId, entry.accountId, parsed.origin);
    if (!result) return notFound();
    if (result.kind === 'limit') return fail(403, 'plan_limit', `Не больше ${result.limit} доменов на бота. Удалите ненужный домен`);
    return json({ data: { origin: result.origin } }, result.kind === 'added' ? 201 : 200);
  });
}

// POST /api/bots/{bot_id}/sources с JSON { url } — CreateSource для сайта (FR-SOURCE-001). PDF (multipart) —
// source-upload-handler (pdf-source); маршрут выбирает обработчик по Content-Type.
export function createSiteSourceHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'добавление сайта', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId) || !await deps.ownsBot(botId, entry.accountId)) return notFound();
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    if (!UUID.test(idempotencyKey)) return fail(400, 'invalid', 'Заголовок Idempotency-Key обязан быть UUID');
    const existing = await deps.findJob(botId, idempotencyKey);
    if (existing) return json({ data: { index_job_id: existing } }, 202);
    const input = await body(request, ['url']);
    if (input instanceof Response) return input;
    const siteUrl = normalizeSiteUrl(input.url);
    if (!siteUrl) return json({ error: { code: 'invalid', message: 'Укажите адрес сайта, например example.ru', field: 'url' } }, 400);
    // SSRF: адрес внутренней сети — отказ ДО записи и ДО постановки (ADR-010; краулер проверит снова).
    let checked;
    try { checked = await deps.checkAddress(siteUrl); }
    catch (error) {
      if (!(error instanceof AddressRefusal)) throw error;
      return error.reason === 'blocked_address'
        ? fail(422, 'blocked_address', 'Этот адрес ведёт во внутреннюю или служебную сеть — такие адреса мы не читаем')
        : fail(422, 'unreachable', 'Сайт с таким адресом не найден. Проверьте написание');
    }
    const result = await deps.createSite({ accountId: entry.accountId, botId, rootUrl: checked.url.href, idempotencyKey });
    if (result.kind === 'not_found') return notFound();
    if (result.kind === 'daily_limit') return indexStartsLimit(result.limit);
    if (result.kind === 'created') {
      // Очередь — ПОСЛЕ коммита. Сбой транспорта не теряет задачу: она queued, сторож доставит её снова.
      try { await deps.enqueue({ index_job_id: result.indexJobId, generation: 0 }); }
      catch { logOf(deps)('Кабинет: транспорт заданий недоступен — задача останется queued до повторной доставки сторожем'); }
    }
    return json({ data: { index_job_id: result.indexJobId } }, 202);
  });
}

// POST /api/sources/{source_id}/reindex — «Повторить» отказавшую задачу (FR-INDEX-003): тот же index_job_id.
// «Обновить» готовый сайт и «Повторить» отказавший (FR-INDEX-004, FR-INDEX-003, ADR-009): та же задача, новая серия;
// идущая задача — тот же index_job_id без второй серии; PDF — новая загрузка; предел запусков на сутки — 429.
export function createSourceReindexHandler(deps: CabinetDependencies) {
  return (request: Request, sourceId: string) => run(logOf(deps), 'обновление источника', async () => {
    const entry = await guardMutation(request, deps, () => fail(404, 'not_found', 'Источник не найден'));
    if (entry instanceof Response) return entry;
    if (!UUID.test(sourceId)) return fail(404, 'not_found', 'Источник не найден');
    const result = await deps.reindex(sourceId, entry.accountId);
    if (!result) return fail(404, 'not_found', 'Источник не найден');
    if (result.kind === 'running') return json({ data: { index_job_id: result.indexJobId } }, 202);
    if (result.kind === 'pdf_reupload') return fail(409, 'reupload', 'Файл PDF удаляется после индексации — чтобы обновить, загрузите его заново');
    if (result.kind === 'daily_limit') return indexStartsLimit(result.limit);
    try { await deps.enqueue(result.message); }
    catch { logOf(deps)('Кабинет: транспорт заданий недоступен — обновление останется queued до доставки сторожем'); }
    return json({ data: { index_job_id: result.message.index_job_id } }, 202);
  });
}

// DELETE /api/sources/{id} (DeleteSource): источник, его страницы и фрагменты — одной транзакцией; бот перестаёт
// ссылаться на них сразу (SC-US-014-2). Чужой и несуществующий — одинаковый 404. Тела у запроса нет.
export function createSourceDeleteHandler(deps: CabinetDependencies) {
  return (request: Request, sourceId: string) => run(logOf(deps), 'удаление источника', async () => {
    const entry = await guardMutation(request, deps, () => fail(404, 'not_found', 'Источник не найден'));
    if (entry instanceof Response) return entry;
    if (!UUID.test(sourceId)) return fail(404, 'not_found', 'Источник не найден');
    const result = await deps.deleteSource(sourceId, entry.accountId);
    if (!result) return fail(404, 'not_found', 'Источник не найден');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}

const SCOPE_TEXT: Readonly<Record<string, string>> = {
  bot_day_answers: 'ответов бота в сутки', bot_month_answers: 'ответов бота в месяц', global_answers: 'ответов сервиса в сутки',
};
// POST /api/bots/{bot_id}/ask — тестовый чат владельца (FR-BOT-001: «тот же чат, что у посетителя, с развёрнутыми
// цитатами»; A-N6-033). Тело — ровно { question }: история и bot_id от клиента не принимаются.
export function createOwnerAskHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'вопрос владельца', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return notFound();
    const input = await body(request, ['question']);
    if (input instanceof Response) return input;
    if (typeof input.question !== 'string') return fail(400, 'invalid', 'Напишите вопрос');
    const result = await deps.answer(botId, entry.accountId, { question: input.question, history: [] });
    const chip = ({ title, url, excerpt }: { title: string; url: string | null; excerpt: string }) => ({ title, url, excerpt });
    switch (result.status) {
      case 'answered': return json({ data: { status: 'answered', text: result.text, source: chip(result.sourceChip), sources: result.sources.map(chip) } });
      case 'small_talk': return json({ data: { status: 'small_talk', text: result.text } });   // A-N6-074
      case 'unknown': return json({ data: { status: 'unknown', text: result.message, contact: result.contact, reason: result.reason } });
      case 'refused': return fail(429, 'limit', `Исчерпан предел «${SCOPE_TEXT[result.scope] ?? 'ответов'}» — тестовые вопросы расходуют тот же лимит, что и вопросы посетителей`);
      case 'invalid': return fail(400, result.reason === 'unexpected_field' ? 'unexpected_field' : 'invalid', 'Вопрос пустой или длиннее 500 символов');
      default: return notFound();
    }
  });
}

// POST /api/bots/{bot_id}/verify { verified: boolean } — отметка владельца «Я проверил ответы бота» (A-N6-035). Пока её
// нет, посетитель виджета вместо ответа модели видит «Бот ещё настраивается» и контакт. Значение — строго boolean:
// строка «true» или число — отказ, а не догадка (fail-closed).
export function createBotVerifyHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'отметка проверки ответов', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return notFound();
    const input = await body(request, ['verified']);
    if (input instanceof Response) return input;
    if (typeof input.verified !== 'boolean') return fail(400, 'invalid', 'Ожидается { verified: true | false }');
    const saved = await deps.setVerified(botId, entry.accountId, input.verified);
    if (!saved) return notFound();
    if ('kind' in saved) return fail(409, 'indexing', 'Дождитесь окончания загрузки материалов и проверьте ответы по ним');
    return json({ data: saved });
  });
}

// POST /api/bots/{bot_id}/publish { enabled, indexable } — PublishPublicPage (FR-GROWTH-005, SC-US-013-1/3). Порядок входа —
// как у остальных мутаций кабинета; значения строго boolean (строка «true» — отказ, а не «включить»).
export function createBotPublishHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'публикация демо-страницы', async () => {
    const entry = await guardMutation(request, deps, notFound);
    if (entry instanceof Response) return entry;
    if (!UUID.test(botId)) return notFound();
    const input = await body(request, ['enabled', 'indexable']);
    if (input instanceof Response) return input;
    if (typeof input.enabled !== 'boolean' || typeof input.indexable !== 'boolean') return fail(400, 'invalid', 'Ожидается { enabled: true | false, indexable: true | false }');
    const saved = await deps.publish(botId, entry.accountId, { enabled: input.enabled, indexable: input.indexable });
    if (!saved) return notFound();
    if (saved.kind === 'contact_required') return fail(409, 'contact_required', 'Укажите контакт для «не знаю» в настройках — без него бот не отвечает и страницу публиковать нечем');
    return json({ data: { url: new URL(`/b/${saved.slug}`, deps.publicOrigin).href, slug: saved.slug, enabled: saved.enabled, indexable: saved.indexable } });
  });
}

// GET /api/bots/{bot_id}/summary — BotSummary (FR-BOT-004, SC-US-010-1/2). Нет сессии, чужой бот — 404.
export function createBotSummaryHandler(deps: CabinetDependencies) {
  return (request: Request, botId: string) => run(logOf(deps), 'сводка бота', async () => {
    const token = readSessionCookie(request);
    const session = token ? await deps.authenticate(token) : null;
    if (!session || !UUID.test(botId)) return notFound();
    const summary = await deps.summary(botId, session.account_id);
    return summary ? json({ data: summary }) : notFound();
  });
}
