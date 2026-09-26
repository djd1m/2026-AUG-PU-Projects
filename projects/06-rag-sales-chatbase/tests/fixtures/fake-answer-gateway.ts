// Подменный шлюз ответов для тестов rag-answer: НАСТОЯЩИЙ клиент createOpenRouter с подменным fetch — разбор
// ответа, JSON-схема в запросе, классы отказа (429/5xx/таймаут/мусор) — боевые. Живой OpenRouter (и модель
// Anthropic за ним) в тестах НЕ вызывается: чужой адрес — отказ.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createOpenRouter, spendRecorder, type ChatMessage } from '../../packages/rag/src/index';
import { readSpend, vectorFor } from './fake-embeddings';

export interface ChatCall { messages: ChatMessage[]; body: Record<string, unknown> }
// Ответ модели: объект → содержимое сообщения (JSON), строка → сырое содержимое, число → HTTP-статус,
// 'hang' → ждать отмены (таймаут), 'refusal' → отказ модели.
export type ModelReply = object | string | number | 'hang' | 'refusal';
export interface FakeAnswerGateway {
  request: typeof fetch;
  chats: ChatCall[];
  embeds: string[][];
  // Вектор текста вопроса; по умолчанию — детерминированный vectorFor(текст).
  vector: (text: string) => number[];
  reply: (call: ChatCall) => ModelReply;
  embedStatus?: number;
}
export function fakeAnswerGateway(reply: FakeAnswerGateway['reply'] = () => ({ status: 'not_found', text: '', citations: [] })): FakeAnswerGateway {
  const g: FakeAnswerGateway = { chats: [], embeds: [], vector: (t) => vectorFor(t), reply, request: undefined as unknown as typeof fetch };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  g.request = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const href = String(url);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    if (href === 'https://openrouter.ai/api/v1/embeddings') {
      const input = body.input as string[];
      g.embeds.push(input);
      if (g.embedStatus) return json({ error: 'x' }, g.embedStatus);
      return json({ data: input.map((t) => ({ embedding: g.vector(t) })), usage: { prompt_tokens: 5, total_tokens: 5 } });
    }
    if (href !== 'https://openrouter.ai/api/v1/chat/completions') throw new TypeError(`подменный шлюз: чужой адрес ${href}`);
    const call: ChatCall = { messages: body.messages as ChatMessage[], body };
    g.chats.push(call);
    const r = g.reply(call);
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        const signal = init.signal;
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    if (typeof r === 'number') return json({ error: 'upstream' }, r);
    const message = r === 'refusal' ? { content: null, refusal: 'нельзя' } : { content: typeof r === 'string' ? r : JSON.stringify(r) };
    return json({ choices: [{ message }], usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 } });
  }) as typeof fetch;
  return g;
}

export const MODELS = { apiKey: 'test-key', answerModel: 'anthropic/claude-haiku-4.5', embedModel: 'openai/text-embedding-3-small' } as const;
export function answerHarness(gateway = fakeAnswerGateway()) {
  const dir = path.join(tmpdir(), `n6-spend-ans-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  const spendFile = path.join(dir, 'model-spend.jsonl');
  return { gateway, client: createOpenRouter(MODELS, gateway.request), spend: spendRecorder(spendFile), spendFile, spendEvents: () => readSpend(spendFile) };
}
