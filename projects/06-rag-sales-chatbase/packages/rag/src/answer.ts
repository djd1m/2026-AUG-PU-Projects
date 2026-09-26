// AnswerQuestion (Pseudocode, FR-ANSWER-001…005, NFR-SEC-001, ADR-003/006/011) — ЯДРО ответа без маршрута
// (маршрут /w/v1/ask и предпросмотр подключат фичи visitor-ask-and-limits и preview-flow). Написано заново
// (ADR-016: донора нет); клиент OpenRouter и meteredCall — уже перенесённые блоки N6 (ADR-012).
//
// ПОРЯДОК — это и есть защита (Specification §1, security-operation-order):
//   бот из ДОВЕРЕННОГО источника (аргумент ядра, не тело запроса) → вопрос ≤ 500 →
//   квота (все scope одной транзакцией) → attempt(fsync) → эмбеддинг вопроса → поиск ВНУТРИ бота →
//   свои фрагменты ≥ 0.40, иначе «не знаю» БЕЗ модели → промпт (данные в разделителях) → attempt(fsync) →
//   модель (JSON-схема, temperature 0, max_tokens 400, таймаут) → ValidateModelAnswer → показ только с источником.
// Квота списывается ОДИН раз на вопрос и покрывает эмбеддинг вопроса и ответ (контракт стоимости); отказ
// модели списанное не возвращает. Повторов нет: один ответ = одна попытка модели.
import { randomUUID } from 'node:crypto';
import { ANSWER_MODELS, EMBED_MODELS, HISTORY_TURNS, ANSWER_TEXT_MAX_CHARS, QUESTION_MAX_CHARS, SOURCE_EXCERPT_MAX_CHARS, isEmbeddingOfDimension } from './constants.js';
import { readBotStatus } from './enums.js';
import { ANSWER_TIMEOUT_MS, GatewayResponseError, type OpenRouter } from './openrouter.js';
import { buildAnswerPrompt, type HistoryTurn } from './prompt.js';
import { ownHit, selectRelevant, type SearchHit } from './search.js';
import { meteredCall, RetryableCallError, type ChargeDecision, type SpendRecorder } from './spend.js';
import { validateModelAnswer } from './validate-model-answer.js';

// Бот — ТОЛЬКО из серверного разрешения (виджет: public_key/Origin, проверенные сервером; предпросмотр: токен;
// кабинет: сессия) — см. loadAnswerBot в @n6/db. Тело запроса посетителя бота не выбирает: parseVisitorRequest
// отвергает любые ключи, кроме вопроса и истории.
export interface AnswerBot { id: string; status: unknown; companyName: string; contact: string | null }
// owner — тестовый чат владельца в кабинете (bot-cabinet, FR-BOT-001): активный бот, бот — из сессии владельца.
export type AnswerMode = 'widget' | 'preview' | 'owner';
export interface VisitorRequest { question: string; history: HistoryTurn[] }
export type QuestionOutcome = 'answered' | 'unknown' | 'refused_limit';
export interface QuestionLogEntry { botId: string; outcome: QuestionOutcome; text: string | null; citedChunkIds: string[] }
export interface AnswerDeps {
  client: Pick<OpenRouter, 'complete' | 'embed'>;
  models: { answerModel: string; embedModel: string };
  spend: SpendRecorder;
  // Списание квоты вопроса (виджет — 5 scope, предпросмотр — 2; строит вызывающий из ceilings.ts).
  chargeQuota: () => Promise<ChargeDecision>;
  // Поиск ВНУТРИ бота — searchChunks (packages/db/src/chunks.ts, A-N6-028).
  search: (botId: string, embedding: number[]) => Promise<SearchHit[]>;
  logQuestion: (entry: QuestionLogEntry) => Promise<void>;
  answerTimeoutMs?: number;
  signal?: (line: string) => void;       // сигнал оператору (чужой фрагмент из поиска)
}
export interface SourceChip { chunkId: string; title: string; url: string | null; excerpt: string }
export type UnknownReason = 'below_threshold' | 'not_found' | 'invalid_answer' | 'service_unavailable';
export type AnswerResult =
  | { status: 'answered'; text: string; sources: SourceChip[]; sourceChip: SourceChip }
  | { status: 'unknown'; reason: UnknownReason; message: string; contact: string | null }
  | { status: 'refused'; reason: 'limit'; scope: string; message: string; contact: string | null }
  | { status: 'invalid'; reason: 'question' | 'history' | 'unexpected_field' }
  | { status: 'not_found' };

export const UNKNOWN_MESSAGE = 'Не нашёл этого в материалах компании.';
export const UNAVAILABLE_MESSAGE = 'Сервис ответов временно недоступен — не могу ответить сейчас.';
export const LIMIT_MESSAGE = 'Лимит вопросов на сегодня исчерпан.';
const withContact = (message: string, contact: string | null) => (contact ? `${message} Напишите: ${contact}` : message);

const chars = (text: string) => Array.from(text).length;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function parseHistory(value: unknown): HistoryTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > HISTORY_TURNS) return null;
  const turns: HistoryTurn[] = [];
  for (const turn of value) {
    if (!isObject(turn) || Object.keys(turn).some((k) => k !== 'question' && k !== 'answer')) return null;
    if (typeof turn.question !== 'string' || typeof turn.answer !== 'string') return null;
    if (chars(turn.question) > QUESTION_MAX_CHARS || chars(turn.answer) > ANSWER_TEXT_MAX_CHARS) return null;
    turns.push({ question: turn.question, answer: turn.answer });
  }
  return turns;
}
// Граница тела запроса посетителя: ЗАКРЫТЫЙ набор ключей. bot_id / botId / любой другой ключ — отказ, а не
// «проигнорировать»: молча принятый bot_id однажды начнут читать.
export function parseVisitorRequest(body: unknown): { ok: true; request: VisitorRequest } | { ok: false; reason: 'question' | 'history' | 'unexpected_field' } {
  if (!isObject(body)) return { ok: false, reason: 'question' };
  if (Object.keys(body).some((k) => k !== 'question' && k !== 'history')) return { ok: false, reason: 'unexpected_field' };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || chars(question) > QUESTION_MAX_CHARS) return { ok: false, reason: 'question' };
  const history = parseHistory(body.history);
  if (!history) return { ok: false, reason: 'history' };
  return { ok: true, request: { question, history } };
}

function chipOf(hit: SearchHit): SourceChip {
  let url: string | null = null;
  try {
    const parsed = new URL(hit.urlOrPage);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.href;
  } catch { url = null; }   // PDF: «прайс.pdf#с. 3» — не ссылка, имя файла и страница в title
  return { chunkId: hit.chunkId, title: hit.pageTitle || hit.urlOrPage, url, excerpt: Array.from(hit.text).slice(0, SOURCE_EXCERPT_MAX_CHARS).join('') };
}
const gatewayFailure = (error: unknown) => error instanceof RetryableCallError || error instanceof GatewayResponseError;

export async function answerQuestion(deps: AnswerDeps, bot: AnswerBot, mode: AnswerMode, request: VisitorRequest): Promise<AnswerResult> {
  // Модели — из закрытого набора кода (ADR-011, CFG-I8): окружение выбирает, но не задаёт.
  if (!(ANSWER_MODELS as readonly string[]).includes(deps.models.answerModel) || !(EMBED_MODELS as readonly string[]).includes(deps.models.embedModel)) {
    throw new Error('Модель вне закрытого набора канона: ответ не выполняется');
  }
  // Виджет и кабинет отвечают только активным ботом, предпросмотр — только черновиком. Неизвестный статус — deleted.
  const status = readBotStatus(bot.status);
  if (status !== (mode === 'preview' ? 'draft' : 'active')) return { status: 'not_found' };
  // Повтор проверки границы: ядро не доверяет, что вызывающий звал parseVisitorRequest.
  const parsed = parseVisitorRequest({ question: request.question, history: request.history });
  if (!parsed.ok) return { status: 'invalid', reason: parsed.reason };
  const { question, history } = parsed.request;
  const contact = bot.contact && bot.contact.trim() ? bot.contact.trim() : null;
  const requestId = randomUUID();
  const unknown = async (reason: UnknownReason, keepText: boolean): Promise<AnswerResult> => {
    // 152-ФЗ: текст вопроса — только у unknown; сбой сервиса — не «чего нет в материалах», текст не храним.
    await deps.logQuestion({ botId: bot.id, outcome: 'unknown', text: keepText ? question : null, citedChunkIds: [] });
    return { status: 'unknown', reason, message: withContact(reason === 'service_unavailable' ? UNAVAILABLE_MESSAGE : UNKNOWN_MESSAGE, contact), contact };
  };

  // 1. Квота → attempt → эмбеддинг вопроса. Отказ квоты — ни одного вызова.
  let embedded;
  try {
    embedded = await meteredCall({
      charge: deps.chargeQuota, spend: deps.spend, retries: 0,
      event: { call: 'embed_question', model: deps.models.embedModel, request_id: requestId, bot_id: bot.id, unit: 'calls', quantity: 1 },
      run: async () => {
        const { vectors, tokens } = await deps.client.embed({ texts: [question] });
        if (vectors.length !== 1 || !isEmbeddingOfDimension(vectors[0])) throw new GatewayResponseError('dimension_mismatch', 'Эмбеддинг вопроса не 1536');
        return { value: vectors[0]!, tokens };
      },
    });
  } catch (error) {
    if (gatewayFailure(error)) return unknown('service_unavailable', false);
    throw error;
  }
  if (embedded.status === 'refused') {
    await deps.logQuestion({ botId: bot.id, outcome: 'refused_limit', text: null, citedChunkIds: [] });
    return { status: 'refused', reason: 'limit', scope: embedded.scope, message: withContact(LIMIT_MESSAGE, contact), contact };
  }

  // 2. Поиск внутри бота; порог ДО модели.
  const selection = selectRelevant(await deps.search(bot.id, embedded.value), bot.id);
  if (selection.foreign) (deps.signal ?? console.error)(`СИГНАЛ ОПЕРАТОРУ: поиск бота ${bot.id} вернул ${selection.foreign} чужих фрагментов — отброшены`);
  if (!selection.relevant.length) return unknown('below_threshold', true);

  // 3. Модель: данные в разделителях, JSON-схема, таймаут. Отказ поставщика — честный «не знаю», попытка списана.
  const prompt = buildAnswerPrompt({ companyName: bot.companyName, hits: selection.relevant, question, history });
  let completion;
  try {
    completion = await meteredCall({
      spend: deps.spend, retries: 0,
      event: { call: mode === 'widget' ? 'answer' : mode === 'owner' ? 'answer_owner' : 'answer_preview', model: deps.models.answerModel, request_id: requestId, bot_id: bot.id, unit: 'calls', quantity: 1 },
      run: () => deps.client.complete({ messages: prompt.messages, schemaName: 'answer', schema: prompt.schema,
        signal: AbortSignal.timeout(deps.answerTimeoutMs ?? ANSWER_TIMEOUT_MS) }),
    });
  } catch (error) {
    if (error instanceof GatewayResponseError && error.spendResult === 'schema_violation') return unknown('invalid_answer', true);
    if (gatewayFailure(error)) return unknown('service_unavailable', false);
    throw error;
  }
  if (completion.status !== 'ok') throw new Error('Ответ модели без квоты не выполняется');

  // 4. Проверка ПОСЛЕ модели: цитаты только из выданных меток, и каждый процитированный фрагмент — этого бота.
  const checked = validateModelAnswer(completion.value, prompt.labels);
  if (checked.status !== 'answered') return unknown(checked.why === 'not_found' ? 'not_found' : 'invalid_answer', true);
  const cited = checked.citations.flatMap((label) => prompt.byLabel.get(label) ?? []);
  if (!cited.length || !cited.every((hit) => ownHit(hit, bot.id))) return unknown('invalid_answer', true);

  await deps.logQuestion({ botId: bot.id, outcome: 'answered', text: null, citedChunkIds: cited.map((hit) => hit.chunkId) });
  const sources = cited.map(chipOf);
  return { status: 'answered', text: checked.text, sources, sourceChip: sources[0]! };
}
