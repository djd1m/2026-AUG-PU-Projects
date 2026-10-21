// Адаптер `live` OpenRouter — перенос N4 apps/recognizer/src/provider/openrouter.ts (#16), адаптирован:
//  * два метода: /embeddings (text-embedding-3-small, dimensions 1536) и /chat/completions (gpt-4.1-mini, JSON-схема,
//    max_tokens 400);
//  * исполнитель закреплён КОНСТАНТОЙ в обоих телах: provider {order:['openai'], allow_fallbacks:false} (ADR-004,
//    SC-US-005-4). Окружение его не задаёт (страж S-7);
//  * ровно ОДИН запрос на вызов: ни ретраев, ни второго fetch (страж S-5). Отказ закреплённого исполнителя («no
//    endpoints», 404/503, лимит кредитов ключа — OWN-06B-011) — ProviderUnavailableError → 503 у вызывающего;
//  * fetch в Node 22 не бросает на 4xx/5xx — res.ok проверяется явно; `error` в теле 200 — недоступность, не ответ;
//  * ключ API не попадает ни в одно сообщение ошибки (страж S-8).

import {
  type AnswerResult, type ChatMessage, checkVectors, type EmbedResult, ModelDeadlineExceeded, type ModelProvider,
  ModelSchemaViolationError, parseAnswerPayload, ProviderUnavailableError, EMBED_DIMENSIONS,
} from './port.js';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const PROVIDER_ROUTING = Object.freeze({ order: Object.freeze(['openai']), allow_fallbacks: false });
export const MODELS = Object.freeze({ answer: 'openai/gpt-4.1-mini', embed: 'openai/text-embedding-3-small' });
export const MAX_ANSWER_TOKENS = 400;

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'cited_ids', 'unknown'],
  properties: {
    answer: { type: 'string' },
    cited_ids: { type: 'array', items: { type: 'string' } },
    unknown: { type: 'boolean' },
  },
} as const;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function usageNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export class OpenRouterProvider implements ModelProvider {
  readonly #apiKey: string;
  readonly #fetch: FetchLike;

  constructor(apiKey: string, fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY пуст: адаптер live не создаётся');
    this.#apiKey = apiKey;
    this.#fetch = fetchImpl;
  }

  async embed(texts: readonly string[], signal: AbortSignal): Promise<EmbedResult> {
    if (texts.length === 0) throw new ModelSchemaViolationError('пустой батч эмбеддингов');
    const body = { model: MODELS.embed, input: texts, dimensions: EMBED_DIMENSIONS, provider: PROVIDER_ROUTING };
    const json = await this.#post('/embeddings', body, signal);
    const data = json.data;
    if (!Array.isArray(data)) throw new ModelSchemaViolationError('нет data');
    const ordered = [...data].sort((a, b) => Number(a?.index) - Number(b?.index)).map((d) => d?.embedding);
    const usage = (json.usage ?? {}) as Record<string, unknown>;
    return { vectors: checkVectors(ordered, texts.length), tokensIn: usageNumber(usage.prompt_tokens) };
  }

  async answer(messages: readonly ChatMessage[], signal: AbortSignal): Promise<AnswerResult> {
    const body = {
      model: MODELS.answer,
      messages,
      max_tokens: MAX_ANSWER_TOKENS,
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: ANSWER_SCHEMA } },
      provider: PROVIDER_ROUTING,
    };
    const json = await this.#post('/chat/completions', body, signal);
    const choices = json.choices;
    const content = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
    if (typeof content !== 'string') throw new ModelSchemaViolationError('нет choices[0].message.content');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new ModelSchemaViolationError('content не JSON'); }
    const usage = (json.usage ?? {}) as Record<string, unknown>;
    return { ...parseAnswerPayload(parsed), tokensIn: usageNumber(usage.prompt_tokens),
      tokensOut: usageNumber(usage.completion_tokens) };
  }

  // Единственное место сетевого вызова. Один fetch, без повторов.
  async #post(path: string, body: object, signal: AbortSignal): Promise<Record<string, any>> {
    let res: Response;
    let text: string;
    try {
      res = await this.#fetch(`${OPENROUTER_BASE}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.#apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      text = await res.text();
    } catch {
      if (signal.aborted) throw new ModelDeadlineExceeded();
      throw new ProviderUnavailableError('сеть');
    }
    if (!res.ok) throw new ProviderUnavailableError(`HTTP ${res.status}`);
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new ModelSchemaViolationError('тело не JSON'); }
    if (typeof json !== 'object' || json === null) throw new ModelSchemaViolationError('тело не объект');
    if ('error' in json && (json as { error: unknown }).error) throw new ProviderUnavailableError('error в теле 200');
    return json as Record<string, any>;
  }
}
