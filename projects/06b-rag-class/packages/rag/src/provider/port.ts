// Порт провайдера модели — перенос N4 apps/recognizer/src/provider/types.ts (#16), адаптирован: vision → два метода
// (эмбеддинги и ответ JSON). Порт вызывается ТОЛЬКО из paid-call.ts (страж S-9): резерв и журнал до вызова обеспечивает
// там, а не здесь. Отказы — три класса-исключения; все три для вызывающего — 503 «сервис ответа временно недоступен»,
// попытка засчитана (SC-US-016-3, SC-US-005-4).

/** Дедлайны (Pseudocode «Answer question» шаги 3 и 7; «Chunk and embed»). */
export const DEADLINE_MS = { embed_question: 10_000, answer: 20_000, embed_index: 30_000 } as const;
export const EMBED_DIMENSIONS = 1536;

export interface ChatMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

export interface EmbedResult {
  readonly vectors: readonly (readonly number[])[];
  readonly tokensIn: number | null;
}

export interface AnswerPayload {
  readonly answer: string;
  readonly cited_ids: readonly string[];
  readonly unknown: boolean;
}

export interface AnswerResult extends AnswerPayload {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

export interface ModelProvider {
  embed(texts: readonly string[], signal: AbortSignal): Promise<EmbedResult>;
  answer(messages: readonly ChatMessage[], signal: AbortSignal): Promise<AnswerResult>;
}

/** Общий предок: вызывающий отвечает 503 на любой из трёх. */
export class ModelCallFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelCallFailed';
  }
}

export class ModelDeadlineExceeded extends ModelCallFailed {
  constructor() {
    super('дедлайн вызова модели истёк');
    this.name = 'ModelDeadlineExceeded';
  }
}

/** Сеть, HTTP ≠ 2xx, `error` в теле 200 (в т.ч. «no endpoints» при отказе закреплённого исполнителя), лимит ключа. */
export class ProviderUnavailableError extends ModelCallFailed {
  constructor(reason: string) {
    super(`провайдер модели недоступен: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

export class ModelSchemaViolationError extends ModelCallFailed {
  constructor(reason: string) {
    super(`ответ модели не по схеме: ${reason}`);
    this.name = 'ModelSchemaViolationError';
  }
}

/** Явная проверка ответа по схеме {answer, cited_ids, unknown} — без приведения типом (N4 #16). */
export function parseAnswerPayload(value: unknown): AnswerPayload {
  if (typeof value !== 'object' || value === null) throw new ModelSchemaViolationError('не объект');
  const v = value as Record<string, unknown>;
  if (typeof v.answer !== 'string') throw new ModelSchemaViolationError('answer не строка');
  if (typeof v.unknown !== 'boolean') throw new ModelSchemaViolationError('unknown не boolean');
  if (!Array.isArray(v.cited_ids) || !v.cited_ids.every((id) => typeof id === 'string')) {
    throw new ModelSchemaViolationError('cited_ids не массив строк');
  }
  return { answer: v.answer, cited_ids: v.cited_ids as string[], unknown: v.unknown };
}

/** Проверка эмбеддингов: ровно по одному вектору 1536 конечных чисел на вход. */
export function checkVectors(vectors: unknown, expected: number): (readonly number[])[] {
  if (!Array.isArray(vectors) || vectors.length !== expected) {
    throw new ModelSchemaViolationError(`ожидалось ${expected} векторов`);
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBED_DIMENSIONS || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      throw new ModelSchemaViolationError(`вектор не из ${EMBED_DIMENSIONS} чисел`);
    }
  }
  return vectors as number[][];
}
