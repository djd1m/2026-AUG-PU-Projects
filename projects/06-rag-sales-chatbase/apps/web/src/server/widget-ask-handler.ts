// POST /w/v1/ask?bot={public_key} — вопрос посетителя виджета на ЧУЖОМ сайте (фича visitor-ask-and-limits; FR-WIDGET-002,
// FR-LIMIT-001, FR-ANSWER-003, FR-BOT-003, FR-GROWTH-006; SC-US-006-1/2, SC-US-007-1/2/3, SC-US-008-1/2, SC-US-009-1/2;
// ADR-005, ADR-008, ADR-013, ADR-014; A-N6-029, A-N6-035). Написано заново (ADR-016): у донора N1 вопросов не было.
//
// ПОРЯДОК — это и есть защита (Specification §1, security-operation-order):
//   лимит двери (приложение; Caddy — 30 мутаций/мин ДО тела) → бот по public_key ИЗ АДРЕСА (нет — 404) →
//   CheckOrigin по списку ЭТОГО бота (отказ — 403 БЕЗ Access-Control-Allow-Origin, без чтения тела и без списания) →
//   тело ≤ 4 КиБ, ЗАКРЫТЫЙ набор { visitor_session, question } (history/bot_id и любой другой ключ — 422: ходы
//   ассистента от клиента не принимаются вовсе, история — на сервере) → токен сессии (подпись по боту, origin и /24;
//   чужой — 409, виджет берёт новый) → бейдж показан этой сессии, если план его требует (ADR-004; иначе 409) →
//   отметка владельца «проверено» (A-N6-035; нет — «Бот ещё настраивается» + контакт, БЕЗ модели и без списания) →
//   ядро answerQuestion (5 scope квоты одной транзакцией ДО эмбеддинга, порог ДО модели, проверка цитат ПОСЛЕ) →
//   answered: ход истории, RecordWidgetInstall(first_answer), RecordGrowthEvent(first_answer).
// Ровно ОДИН Access-Control-Allow-Origin ставит только web (corsHeaders), Caddy его не трогает; без Allow-Credentials.
import type { AnswerResult, HistoryTurn, VisitorRequest } from '@n6/rag';
import type { VisitorSessionState } from '@n6/db';
import { badgeRequired } from '../lib/badge-required';
import { checkOrigin, requestOrigin } from './check-origin';
import { clientIp, ipPrefix } from './ip';
import { isPlainObject, readJsonBody } from './preview-session';
import { readVisitorToken } from './visitor-token';
import { fail, guard, notFound, refused, reply, usableBot, type WidgetBot, type WidgetDependencies } from './widget-handler';

export interface WidgetAskDependencies extends WidgetDependencies {
  openSession: (input: { id: string; botId: string; origin: string; ipPrefix: string }) => Promise<VisitorSessionState | null>;
  // Ядро ответа в режиме widget: квота 5 scope по сессии из ПРОВЕРЕННОГО токена и префиксу адреса; история — серверная.
  answer: (input: { bot: WidgetBot; visitorSession: string; ipPrefix: string; request: VisitorRequest }) => Promise<AnswerResult>;
  appendTurn: (sessionId: string, turn: HistoryTurn) => Promise<void>;
  recordFirstAnswer: (input: { botId: string; visitorSessionId: string; origin: string }) => Promise<boolean>;
  // security.md «Чужой сайт»: отказ по origin — исход refused_origin в журнале, БЕЗ текста вопроса (тело не читается).
  logRefusedOrigin: (botId: string) => Promise<void>;
}

const MAX_ASK_BYTES = 4096;
const ASK_KEYS: readonly string[] = ['visitor_session', 'question'];
export const NOT_VERIFIED_MESSAGE = 'Бот ещё настраивается и пока не отвечает на вопросы.';
const withContact = (message: string, contact: string) => `${message} Напишите: ${contact}`;
const chip = ({ title, url, excerpt }: { title: string; url: string | null; excerpt: string }) => ({ title, url, excerpt });

export function createWidgetAskHandler(deps: WidgetAskDependencies) {
  const log = deps.log ?? ((line: string) => console.error(line));
  return guard(deps, 'вопрос посетителя', async (request: Request): Promise<Response> => {
    const ip = clientIp(request.headers);
    if (!await deps.allowMutation(ip)) return fail(429, 'rate', 'Слишком много запросов');
    const bot = usableBot(await deps.loadBot(new URL(request.url).searchParams.get('bot') ?? ''));
    if (!bot) return notFound();
    // SC-US-008-1: чужой origin — 403 без ACAO, тело не читается, квота не списывается, модель не зовётся.
    const origin = checkOrigin(requestOrigin(request.headers), bot.row, deps.publicOrigin);
    if (!origin) {
      try { await deps.logRefusedOrigin(bot.row.botId); } catch { log('Виджет: исход refused_origin не записан'); }
      return refused();
    }

    const read = await readJsonBody(request, MAX_ASK_BYTES);
    if (!read.ok) return read.code === 'too_large' ? fail(413, 'too_large', 'Вопрос слишком длинный', origin) : fail(400, 'invalid', 'Ожидается JSON', origin);
    if (!isPlainObject(read.body)) return fail(400, 'invalid', 'Ожидается { visitor_session, question }', origin);
    const body = read.body;
    const extra = Object.keys(body).find((k) => !ASK_KEYS.includes(k));
    if (extra) return fail(422, 'unexpected_field', `Поле «${extra.slice(0, 40)}» не принимается`, origin);
    if (typeof body.question !== 'string') return fail(422, 'invalid_question', 'Напишите вопрос', origin);

    const prefix = ipPrefix(ip);
    const sessionId = readVisitorToken(deps.secret, body.visitor_session, { botId: bot.row.botId, origin, ipPrefix: prefix });
    if (!sessionId) return fail(409, 'session_expired', 'Сессия посетителя устарела — обновите страницу', origin);
    const session = await deps.openSession({ id: sessionId, botId: bot.row.botId, origin, ipPrefix: prefix });
    if (!session) return fail(409, 'session_expired', 'Сессия посетителя устарела — обновите страницу', origin);
    // ADR-004 на сервере: на плане с бейджем вопрос принимается только от сессии, которой бейдж был показан.
    if (badgeRequired(bot.row.plan) && !session.badgeShown) return fail(409, 'badge_required', 'Виджет показан без бейджа', origin);
    // A-N6-035: пока владелец не отметил «Я проверил ответы бота», ответ модели посетителю не показывается — и модель
    // не зовётся вовсе (платить за ответ, который не покажут, незачем).
    if (!bot.row.answersVerified) {
      return reply(200, { data: { status: 'unknown', reason: 'not_verified', text: withContact(NOT_VERIFIED_MESSAGE, bot.contact), contact: bot.contact } }, origin);
    }

    const result = await deps.answer({ bot, visitorSession: sessionId, ipPrefix: prefix, request: { question: body.question, history: session.history } });
    switch (result.status) {
      case 'answered': {
        // Ответ уже оплачен и проверен: сбой записи истории, установки или события не отнимает его у посетителя.
        try { await deps.appendTurn(sessionId, { question: body.question.trim(), answer: result.text }); }
        catch { log('Виджет: ход истории не записан — следующий вопрос пойдёт без него'); }
        // FR-BOT-003/SC-US-009-1: первый ответ на этом origin — установка; свой origin (демо-страница) — нет (SC-US-009-2).
        try { await deps.recordInstall({ botId: bot.row.botId, origin, event: 'first_answer' }); }
        catch { log('Виджет: установка first_answer не записана'); }
        try { await deps.recordFirstAnswer({ botId: bot.row.botId, visitorSessionId: sessionId, origin }); }
        catch { log('Виджет: событие first_answer не записано'); }
        return reply(200, { data: { status: 'answered', text: result.text, source: chip(result.sourceChip), sources: result.sources.map(chip) } }, origin);
      }
      case 'unknown': return reply(200, { data: { status: 'unknown', reason: result.reason, text: result.message, contact: result.contact } }, origin);
      // FR-LIMIT-001: отказ, не деградация — с контактом компании; исход refused_limit записало ядро.
      case 'refused': return reply(429, { error: { code: 'limit', message: result.message, contact: result.contact } }, origin);
      case 'invalid': return fail(422, result.reason === 'question' ? 'invalid_question' : 'invalid', 'Вопрос пустой или длиннее 500 символов', origin);
      default: return notFound();
    }
  });
}
