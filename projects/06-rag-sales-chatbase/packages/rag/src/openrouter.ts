// из N5: projects/05-podcast-clips-opus/apps/worker/src/llm/provider.ts — адаптировано: один путь OpenRouter
// без BYOK и фолбэков сохранён; добавлены эмбеддинги (POST /embeddings, dimensions 1536, ADR-001/002),
// ответ по JSON-схеме ADR-011 (temperature 0, max_tokens 400); повторяемые отказы (429/5xx/сеть/таймаут)
// выделены в RetryableCallError — повтор решает meteredCall, и каждая попытка списывается заново.
import { EMBED_BATCH_MAX, EMBED_DIMENSIONS, isEmbeddingOfDimension } from './constants.js';
import { RetryableCallError, type SpendResult } from './spend.js';

// Адрес шлюза — константа кода, не окружение (honest-configuration CFG-I8): ключ уходит только сюда.
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const ANSWER_TIMEOUT_MS = 20_000;
export const EMBED_TIMEOUT_MS = 30_000;
export const ANSWER_MAX_TOKENS = 400;

export class GatewayResponseError extends Error {
  readonly spendResult: SpendResult;
  constructor(result: SpendResult, message: string) { super(message); this.spendResult = result; }
}
export interface ModelConfig { apiKey: string; answerModel: string; embedModel: string }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface Completion { value: unknown; tokens?: number }
export interface Embeddings { vectors: number[][]; tokens?: number }
export interface OpenRouter {
  complete(input: { messages: ChatMessage[]; schemaName: string; schema: object; maxTokens?: number; signal?: AbortSignal }): Promise<Completion>;
  embed(input: { texts: string[]; signal?: AbortSignal }): Promise<Embeddings>;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
function usageTokens(body: Record<string, unknown>): number | undefined {
  const usage = body.usage;
  if (!isObject(usage)) return undefined;
  const total = usage.total_tokens ?? usage.prompt_tokens;
  return typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

export function createOpenRouter(config: ModelConfig, request: typeof fetch = fetch): OpenRouter {
  async function post(path: string, body: object, timeoutMs: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await request(`${OPENROUTER_BASE}${path}`, {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Тело ошибки не журналируется: в нём может оказаться заголовок с ключом.
      throw new RetryableCallError(combined.aborted ? 'timeout' : 'provider_error', 'Шлюз OpenRouter недоступен');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw new RetryableCallError('rate_limited', 'Шлюз OpenRouter: 429');
      if (response.status >= 500) throw new RetryableCallError('provider_error', `Шлюз OpenRouter: ${response.status}`);
      throw new GatewayResponseError('provider_error', `Шлюз OpenRouter отказал: ${response.status}`);
    }
    let parsed: unknown;
    try { parsed = await response.json(); }
    catch { throw new GatewayResponseError('schema_violation', 'Шлюз OpenRouter вернул не JSON'); }
    if (!isObject(parsed)) throw new GatewayResponseError('schema_violation', 'Шлюз OpenRouter вернул не объект');
    return parsed;
  }
  return {
    async complete({ messages, schemaName, schema, maxTokens = ANSWER_MAX_TOKENS, signal }) {
      if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > ANSWER_MAX_TOKENS) throw new Error('max_tokens вне канона (≤ 400)');
      const body = await post('/chat/completions', {
        model: config.answerModel, messages, temperature: 0, max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        // Параметры обязательны у поставщика: иначе шлюз молча снимет structured outputs.
        provider: { require_parameters: true },
      }, ANSWER_TIMEOUT_MS, signal);
      const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
      const message = isObject(choice) ? choice.message : undefined;
      if (!isObject(message) || typeof message.content !== 'string' || message.refusal) {
        throw new GatewayResponseError('schema_violation', 'Ответ модели без содержимого');
      }
      try { return { value: JSON.parse(message.content) as unknown, tokens: usageTokens(body) }; }
      catch { throw new GatewayResponseError('schema_violation', 'Ответ модели не соответствует JSON-схеме'); }
    },
    async embed({ texts, signal }) {
      if (!texts.length || texts.length > EMBED_BATCH_MAX || texts.some((t) => typeof t !== 'string' || !t)) throw new Error('Пачка эмбеддингов: 1–64 непустых текста');
      const body = await post('/embeddings', { model: config.embedModel, input: texts, dimensions: EMBED_DIMENSIONS }, EMBED_TIMEOUT_MS, signal);
      const data = body.data;
      if (!Array.isArray(data) || data.length !== texts.length) throw new GatewayResponseError('schema_violation', 'Эмбеддинги: число векторов ≠ числу текстов');
      const vectors = data.map((item) => {
        const embedding = isObject(item) ? item.embedding : undefined;
        if (!Array.isArray(embedding) || embedding.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
          throw new GatewayResponseError('schema_violation', 'Эмбеддинги: вектор не массив чисел');
        }
        // ADR-001: колонка vector(1536); другая длина — не «почти подходит», а отказ.
        if (!isEmbeddingOfDimension(embedding)) {
          throw new GatewayResponseError('dimension_mismatch', `Эмбеддинги: длина ${embedding.length} ≠ ${EMBED_DIMENSIONS}`);
        }
        return embedding as number[];
      });
      return { vectors, tokens: usageTokens(body) };
    },
  };
}
