// Маршруты предпросмотра (фича preview-flow): CreatePreview, чтение состояния, вопрос, ClaimPreview.
// Написано заново (ADR-016: донора нет); форма ответов — { data } | { error: { code, message } } (auth-handler N6).
//
// ПОРЯДОК — это и есть защита (security-operation-order, Specification §1):
//   создание: лимит двери → Origin → тело (≤ 4 КиБ, закрытый набор ключей) → Idempotency-Key → повтор? та же задача →
//             CheckAddress (SSRF) ДО квоты и ДО любой записи → квота 3 scope + строки одной транзакцией →
//             очередь ПОСЛЕ коммита → 202 { index_job_id } ДО первой страницы.
//   вопрос:   лимит двери → Origin → токен из cookie + задача из адреса → бот ИЗ ПРЕДПРОСМОТРА (не из тела) →
//             тело: ТОЛЬКО { question } (история — на сервере; ходы ассистента от клиента не принимаются) → ядро
//             answerQuestion (квота :answers ДО эмбеддинга, порог ДО модели, проверка цитат ПОСЛЕ).
// Чужой и несуществующий предпросмотр — один ответ 404 (канон: «Чужой ресурс — 404»).
import type { AnswerResult, HistoryTurn, VisitorRequest } from '@n6/rag';
import type { ClaimOutcome, CreatePreviewResult, IndexJobView, PreviewAccess, PreviewSite } from '@n6/db';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { BROWSER_COOKIE, PREVIEW_COOKIE, browserCookie, clearPreviewCookie, draftName, isPlainObject, newToken, normalizeSiteUrl,
  previewCookie, readCookie, readJsonBody, tokenHash } from './preview-session';

export const PREVIEW_LIMIT_MESSAGE = 'Бесплатный предпросмотр на сегодня исчерпан — зарегистрируйтесь, чтобы продолжить';
const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AddressRefusal extends Error {
  constructor(readonly reason: 'blocked_address' | 'unreachable') { super(`Адрес отвергнут: ${reason}`); this.name = 'AddressRefusal'; }
}
export interface PreviewDependencies {
  publicOrigin: string;
  secret: string;
  budget: { pageBudget: number; embedBudget: number };
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  // CheckAddress: отказ — AddressRefusal; сетевой вызов DNS внутри.
  checkAddress: (url: string) => Promise<{ url: URL }>;
  findRepeat: (browserSession: string, idempotencyKey: string, newTokenHash: string) => Promise<string | null>;
  createPreview: (input: { browserSession: string; ipPrefix: string; tokenHash: string; idempotencyKey: string; rootUrl: string;
    companyName: string; publicKey: string; budget: { pageBudget: number; embedBudget: number } }) => Promise<CreatePreviewResult>;
  isUniqueViolation: (error: unknown) => boolean;
  enqueue: (message: { index_job_id: string; generation: number }) => Promise<void>;
  newPublicKey: () => string;
  readAccess: (tokenHash: string, indexJobId: string) => Promise<PreviewAccess | null>;
  readJob: (indexJobId: string, botId: string) => Promise<IndexJobView | null>;
  readSite: (botId: string) => Promise<PreviewSite | null>;
  answersLeft: (browserSession: string) => Promise<number>;
  // Ядро ответа со связкой предпросмотра: квота :answers + preview_answers по сессии ИЗ СТРОКИ предпросмотра.
  answer: (botId: string, browserSession: string, request: VisitorRequest) => Promise<AnswerResult>;
  appendTurn: (previewId: string, turn: HistoryTurn) => Promise<void>;
  shareCtaShown: (botId: string) => Promise<boolean>;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  claim: (input: { tokenHash: string; accountId: string; indexJobId?: string }) => Promise<ClaimOutcome>;
  log?: (line: string) => void;
}

function json(body: object, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(body, { status, headers });
}
const fail = (status: number, code: string, message: string, cookies: string[] = []) => json({ error: { code, message } }, status, cookies);
const notFound = () => fail(404, 'not_found', 'Предпросмотр не найден');
const unavailable = () => fail(503, 'unavailable', 'Предпросмотр временно недоступен. Повторите позже');
const sameOrigin = (request: Request, publicOrigin: string) => request.headers.get('origin') === new URL(publicOrigin).origin;

// Общий вход мутаций: лимит двери ДО тела, затем Origin (мутация без Origin — отказ, а не «видимо, свой»).
async function guard(request: Request, deps: PreviewDependencies): Promise<{ ip: string } | Response> {
  const ip = clientIp(request.headers);
  if (!await deps.allowMutation(ip)) return fail(429, 'limit', 'Слишком много запросов. Повторите через минуту');
  if (!sameOrigin(request, deps.publicOrigin)) return fail(403, 'origin_not_allowed', 'Источник запроса не разрешён');
  return { ip };
}

// POST /api/preview — CreatePreview.
export function createPreviewCreateHandler(deps: PreviewDependencies) {
  const log = deps.log ?? ((line: string) => console.error(line));
  return async (request: Request): Promise<Response> => {
    try {
      const entry = await guard(request, deps);
      if (entry instanceof Response) return entry;
      const read = await readJsonBody(request, MAX_BODY_BYTES);
      if (!read.ok) return read.code === 'too_large' ? fail(413, 'too_large', 'Тело запроса слишком велико') : fail(400, 'invalid', 'Ожидается JSON с адресом сайта');
      const body = read.body;
      if (!isPlainObject(body) || Object.keys(body).some((k) => k !== 'url')) return fail(400, 'invalid', 'Ожидается ровно одно поле — адрес сайта');
      const siteUrl = normalizeSiteUrl(body.url);
      if (!siteUrl) return fail(400, 'invalid', 'Укажите адрес сайта, например example.ru');
      const idempotencyKey = request.headers.get('idempotency-key') ?? '';
      if (!UUID.test(idempotencyKey)) return fail(400, 'invalid', 'Заголовок Idempotency-Key обязан быть UUID');
      const known = readCookie(request, BROWSER_COOKIE);
      const browserToken = known ?? newToken();
      const cookies = known ? [] : [browserCookie(browserToken)];
      const browserSession = tokenHash(deps.secret, 'browser', browserToken);
      const token = newToken();
      const hash = tokenHash(deps.secret, 'preview', token);
      // Повтор того же запроса — та же задача, квота не списывается, токен перевыпущен (первый ответ мог потеряться).
      const repeat = async () => {
        const existing = await deps.findRepeat(browserSession, idempotencyKey, hash);
        return existing ? json({ data: { index_job_id: existing } }, 202, [...cookies, previewCookie(token)]) : null;
      };
      const repeated = await repeat();
      if (repeated) return repeated;
      // SSRF: адрес частной сети — отказ ДО квоты, ДО записи и ДО постановки (ADR-010; краулер проверит снова).
      let checked;
      try { checked = await deps.checkAddress(siteUrl); }
      catch (error) {
        if (!(error instanceof AddressRefusal)) throw error;
        return error.reason === 'blocked_address'
          ? fail(422, 'blocked_address', 'Этот адрес ведёт во внутреннюю или служебную сеть — такие адреса мы не читаем', cookies)
          : fail(422, 'unreachable', 'Сайт с таким адресом не найден. Проверьте написание', cookies);
      }
      let result: CreatePreviewResult;
      try {
        result = await deps.createPreview({ browserSession, ipPrefix: ipPrefix(entry.ip), tokenHash: hash, idempotencyKey,
          rootUrl: checked.url.href, companyName: draftName(checked.url), publicKey: deps.newPublicKey(), budget: deps.budget });
      } catch (error) {
        // Одновременный двойник с тем же ключом успел закоммитить: наша транзакция (и списание) откатилась целиком.
        if (!deps.isUniqueViolation(error)) throw error;
        return await repeat() ?? fail(409, 'conflict', 'Этот запрос уже обработан. Создайте предпросмотр заново', cookies);
      }
      if (result.kind === 'refused') return fail(429, 'limit_preview', PREVIEW_LIMIT_MESSAGE, cookies);
      // Очередь — ПОСЛЕ коммита. Сбой транспорта не теряет задачу: она queued, сторож доставит её снова.
      try { await deps.enqueue({ index_job_id: result.indexJobId, generation: 0 }); }
      catch { log('Предпросмотр: транспорт заданий недоступен — задача останется queued до повторной доставки сторожем'); }
      return json({ data: { index_job_id: result.indexJobId } }, 202, [...cookies, previewCookie(token)]);
    } catch (error) {
      log(`Предпросмотр: создание не завершено (${error instanceof Error ? error.name : 'ошибка'})`);
      return unavailable();
    }
  };
}

// Доступ по токену из cookie И задаче из адреса. Истёк — «создайте заново» (узнаёт только держатель токена).
async function access(request: Request, deps: PreviewDependencies, indexJobId: string): Promise<PreviewAccess | Response> {
  const token = readCookie(request, PREVIEW_COOKIE);
  if (!token || !UUID.test(indexJobId)) return notFound();
  const found = await deps.readAccess(tokenHash(deps.secret, 'preview', token), indexJobId);
  if (!found) return notFound();
  if (found.claimed) return fail(404, 'preview_saved', 'Этот бот уже сохранён — он в вашем кабинете');
  if (found.expired) return fail(404, 'preview_expired', 'Предпросмотр истёк: он живёт 24 часа. Создайте бота заново', [clearPreviewCookie()]);
  return found;
}

// GET /api/preview/{index_job_id} — ReadIndexJob для держателя токена + макет страницы и подсказки после done.
export function createPreviewReadHandler(deps: PreviewDependencies) {
  return async (request: Request, indexJobId: string): Promise<Response> => {
    try {
      const found = await access(request, deps, indexJobId);
      if (found instanceof Response) return found;
      const view = await deps.readJob(indexJobId, found.botId);
      if (!view) return notFound();
      const data: Record<string, unknown> = { ...view, page_budget: deps.budget.pageBudget };
      if (view.state === 'done') {
        data.site = await deps.readSite(found.botId);
        data.questions_left = await deps.answersLeft(found.browserSession);
      }
      return json({ data });
    } catch {
      // Недоступность БД — отказ 503, а не «выполняется» и не пустой прогресс (long-running-job).
      return fail(503, 'unavailable', 'Состояние предпросмотра временно недоступно. Повторите через минуту');
    }
  };
}

// POST /api/preview/{index_job_id}/ask — вопрос владельца в предпросмотре.
const ASK_KEYS: readonly string[] = ['question'];
export function createPreviewAskHandler(deps: PreviewDependencies) {
  const log = deps.log ?? ((line: string) => console.error(line));
  return async (request: Request, indexJobId: string): Promise<Response> => {
    try {
      const entry = await guard(request, deps);
      if (entry instanceof Response) return entry;
      const found = await access(request, deps, indexJobId);
      if (found instanceof Response) return found;
      const read = await readJsonBody(request, MAX_BODY_BYTES);
      if (!read.ok) return read.code === 'too_large' ? fail(413, 'too_large', 'Вопрос слишком длинный') : fail(400, 'invalid', 'Ожидается JSON с вопросом');
      const body = read.body;
      if (!isPlainObject(body)) return fail(400, 'invalid', 'Ожидается JSON с вопросом');
      // Закрытый набор ключей: bot_id, history и любой другой ключ — отказ, а не «проигнорировать».
      if (Object.keys(body).some((k) => !ASK_KEYS.includes(k))) return fail(400, 'unexpected_field', 'Принимается только текст вопроса');
      if (typeof body.question !== 'string') return fail(400, 'invalid', 'Напишите вопрос');
      const botId = found.botId;
      const history = found.history;
      const result = await deps.answer(botId, found.browserSession, { question: body.question, history });
      switch (result.status) {
        case 'answered': {
          const question = body.question.trim();
          let firstAnswer = false;
          // Ответ уже оплачен и проверен: сбой записи истории или события не отнимает его у владельца.
          try { await deps.appendTurn(found.previewId, { question, answer: result.text }); }
          catch { log('Предпросмотр: ход истории не записан — следующий вопрос пойдёт без него'); }
          try { firstAnswer = await deps.shareCtaShown(botId); }
          catch { log('Предпросмотр: событие share_cta_shown не записано'); }
          const chip = ({ title, url, excerpt }: { title: string; url: string | null; excerpt: string }) => ({ title, url, excerpt });
          return json({ data: { status: 'answered', text: result.text, source: chip(result.sourceChip), sources: result.sources.map(chip), first_answer: firstAnswer } });
        }
        case 'unknown': return json({ data: { status: 'unknown', text: result.message, contact: result.contact } });
        case 'refused': return fail(429, 'limit_preview', PREVIEW_LIMIT_MESSAGE);
        case 'invalid': return fail(400, result.reason === 'unexpected_field' ? 'unexpected_field' : 'invalid',
          result.reason === 'question' ? 'Вопрос пустой или длиннее 500 символов' : 'Непригодный запрос');
        default: return notFound();
      }
    } catch (error) {
      log(`Предпросмотр: вопрос не обработан (${error instanceof Error ? error.name : 'ошибка'})`);
      return unavailable();
    }
  };
}

// Ответ ClaimPreview → HTTP (FR-PREVIEW-002: второй claim — 409, чужой или просроченный — 404).
export function claimResponse(outcome: ClaimOutcome): Response {
  switch (outcome.status) {
    case 'claimed': return json({ data: { bot_id: outcome.botId } }, 200, [clearPreviewCookie()]);
    case 'already_claimed': return fail(409, 'already_claimed', 'Этот бот уже сохранён в вашем кабинете', [clearPreviewCookie()]);
    case 'expired': return fail(404, 'preview_expired', 'Предпросмотр истёк: он живёт 24 часа. Создайте бота заново', [clearPreviewCookie()]);
    case 'plan_limit': return fail(403, 'plan_limit', `На плане ${outcome.plan} — не больше ${outcome.limit} бот(а). Удалите ненужного бота или смените план`);
    default: return notFound();
  }
}
// POST /api/preview/{index_job_id}/claim — сохранить бота уже вошедшему владельцу.
export function createPreviewClaimHandler(deps: PreviewDependencies) {
  return async (request: Request, indexJobId: string): Promise<Response> => {
    try {
      const entry = await guard(request, deps);
      if (entry instanceof Response) return entry;
      const session = readSessionCookie(request);
      const account = session ? await deps.authenticate(session) : null;
      if (!account) return fail(401, 'unauthorized', 'Войдите или зарегистрируйтесь, чтобы сохранить бота');
      const token = readCookie(request, PREVIEW_COOKIE);
      if (!token || !UUID.test(indexJobId)) return notFound();
      return claimResponse(await deps.claim({ tokenHash: tokenHash(deps.secret, 'preview', token), accountId: account.account_id, indexJobId }));
    } catch {
      return unavailable();
    }
  };
}

// ClaimPreview при регистрации/входе (Pseudocode AuthRegisterAndLogin п.5): cookie предпросмотра есть → сохранить.
// Сбой сохранения регистрацию НЕ валит (SC-US-003-2): вызывающий ловит исключение и отвечает «preview: unavailable».
export function createRegistrationClaim(deps: Pick<PreviewDependencies, 'secret' | 'authenticate' | 'claim'>) {
  return async (request: Request, sessionToken: string): Promise<{ status: ClaimOutcome['status']; clearCookie: boolean } | null> => {
    const token = readCookie(request, PREVIEW_COOKIE);
    if (!token) return null;
    // Регистрация занятого адреса выдаёт пустышку вместо сессии: такой «вход» чужой аккаунт не получает.
    const account = await deps.authenticate(sessionToken);
    if (!account) return null;
    const outcome = await deps.claim({ tokenHash: tokenHash(deps.secret, 'preview', token), accountId: account.account_id });
    return { status: outcome.status, clearCookie: outcome.status === 'claimed' || outcome.status === 'expired' || outcome.status === 'not_found' };
  };
}
