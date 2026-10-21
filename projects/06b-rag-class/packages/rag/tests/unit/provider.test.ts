import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../src/provider/fake';
import { MODELS, OpenRouterProvider, PROVIDER_ROUTING } from '../../src/provider/openrouter';
import {
  ModelCallFailed, ModelDeadlineExceeded, ModelSchemaViolationError, ProviderUnavailableError,
} from '../../src/provider/port';

const KEY = 'test-only-key-not-real-7f3a9c';
const vec = () => Array.from({ length: 1536 }, () => 0.01);

interface Captured { url: string; body: Record<string, any>; headers: Record<string, string> }

function fakeFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: Captured[] = [];
  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const next = responses.shift();
    if (!next) throw new Error('лишний fetch');
    return next();
  };
  return { calls, impl };
}

const ok = (body: object) => () => new Response(JSON.stringify(body), { status: 200 });
const signal = () => AbortSignal.timeout(5_000);

describe('адаптер live: исполнитель закреплён в теле (SC-US-005-4, T-11)', () => {
  it('embed: /embeddings, модель из набора, dimensions 1536, provider {order:[openai], allow_fallbacks:false}', async () => {
    const f = fakeFetch([ok({ data: [{ index: 0, embedding: vec() }], usage: { prompt_tokens: 7 } })]);
    const res = await new OpenRouterProvider(KEY, f.impl).embed(['вопрос'], signal());
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(f.calls[0]!.body).toMatchObject({ model: 'openai/text-embedding-3-small', dimensions: 1536,
      provider: { order: ['openai'], allow_fallbacks: false } });
    expect(res.tokensIn).toBe(7);
  });

  it('answer: /chat/completions, gpt-4.1-mini, max_tokens 400, JSON-схема, тот же provider', async () => {
    const content = JSON.stringify({ answer: 'да', cited_ids: ['c1'], unknown: false });
    const f = fakeFetch([ok({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 3 } })]);
    const res = await new OpenRouterProvider(KEY, f.impl).answer([{ role: 'user', content: 'q' }], signal());
    expect(f.calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(f.calls[0]!.body).toMatchObject({ model: 'openai/gpt-4.1-mini', max_tokens: 400,
      provider: { order: ['openai'], allow_fallbacks: false }, response_format: { type: 'json_schema' } });
    expect(res).toMatchObject({ answer: 'да', cited_ids: ['c1'], unknown: false, tokensIn: 10, tokensOut: 3 });
  });

  it('константы маршрутизации заморожены: изменить их в рантайме нельзя', () => {
    expect(Object.isFrozen(PROVIDER_ROUTING)).toBe(true);
    expect(Object.isFrozen(PROVIDER_ROUTING.order)).toBe(true);
    expect(MODELS).toEqual({ answer: 'openai/gpt-4.1-mini', embed: 'openai/text-embedding-3-small' });
  });
});

describe('адаптер live: отказ — ровно один fetch и исключение, не ответ (T-12)', () => {
  it.each([
    ['503 от шлюза', () => new Response('{"error":{"message":"x"}}', { status: 503 })],
    ['404 «no endpoints» при отказе закреплённого исполнителя', () => new Response('{"error":{"message":"No endpoints found"}}', { status: 404 })],
    ['402 лимит кредитов ключа (OWN-06B-011)', () => new Response('{"error":{"code":402}}', { status: 402 })],
    ['error в теле 200', () => new Response('{"error":{"message":"upstream"}}', { status: 200 })],
  ])('%s → ProviderUnavailableError, fetch 1 раз', async (_name, response) => {
    const f = fakeFetch([response, response]);
    await expect(new OpenRouterProvider(KEY, f.impl).embed(['q'], signal())).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(f.calls).toHaveLength(1);
  });

  it('сетевой отказ → ProviderUnavailableError; истёкший дедлайн → ModelDeadlineExceeded', async () => {
    const net = fakeFetch([() => { throw new TypeError('fetch failed'); }]);
    await expect(new OpenRouterProvider(KEY, net.impl).embed(['q'], signal())).rejects.toBeInstanceOf(ProviderUnavailableError);
    const controller = new AbortController();
    controller.abort();
    const slow = fakeFetch([() => { throw new DOMException('aborted', 'AbortError'); }]);
    await expect(new OpenRouterProvider(KEY, slow.impl).embed(['q'], controller.signal))
      .rejects.toBeInstanceOf(ModelDeadlineExceeded);
  });

  it.each([
    ['не JSON', () => new Response('<html>', { status: 200 })],
    ['вектор не той размерности', ok({ data: [{ index: 0, embedding: [1, 2, 3] }] })],
    ['векторов меньше, чем входов', ok({ data: [] })],
  ])('схема эмбеддингов: %s → ModelSchemaViolationError', async (_n, response) => {
    const f = fakeFetch([response]);
    await expect(new OpenRouterProvider(KEY, f.impl).embed(['q'], signal())).rejects.toBeInstanceOf(ModelSchemaViolationError);
  });

  it.each([
    ['content не JSON', 'не json'],
    ['cited_ids не массив', JSON.stringify({ answer: 'a', cited_ids: 'c1', unknown: false })],
    ['unknown не boolean', JSON.stringify({ answer: 'a', cited_ids: [], unknown: 'нет' })],
  ])('схема ответа: %s → ModelSchemaViolationError, без приведения типом', async (_n, content) => {
    const f = fakeFetch([ok({ choices: [{ message: { content } }] })]);
    await expect(new OpenRouterProvider(KEY, f.impl).answer([{ role: 'user', content: 'q' }], signal()))
      .rejects.toBeInstanceOf(ModelSchemaViolationError);
  });

  it('S-8: ключ API не попадает ни в одно сообщение ошибки', async () => {
    const cases = [() => new Response('{}', { status: 500 }), () => { throw new Error(`boom ${KEY}`); },
      () => new Response('{"error":{"message":"bad key"}}', { status: 401 })];
    for (const c of cases) {
      const error = await new OpenRouterProvider(KEY, fakeFetch([c]).impl).embed(['q'], signal()).catch((e) => e);
      expect(error).toBeInstanceOf(ModelCallFailed);
      expect(String(error.message) + String(error.stack)).not.toContain(KEY);
    }
    expect(() => new OpenRouterProvider('')).toThrow(/OPENROUTER_API_KEY/);
  });
});

describe('адаптер fake: детерминированный, управляемые исходы, счётчик', () => {
  it('одинаковый текст → одинаковый вектор 1536; исходы по очереди', async () => {
    const f = new FakeProvider({ outcomes: ['ok', 'unavailable', 'timeout', 'schema', 'error-in-200'] });
    const a = await f.embed(['x'], signal());
    await expect(f.embed(['x'], signal())).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(f.embed(['x'], signal())).rejects.toBeInstanceOf(ModelDeadlineExceeded);
    await expect(f.answer([], signal())).rejects.toBeInstanceOf(ModelSchemaViolationError);
    await expect(f.answer([], signal())).rejects.toBeInstanceOf(ProviderUnavailableError);
    const b = await f.embed(['x'], signal());
    expect(a.vectors[0]).toEqual(b.vectors[0]);
    expect(a.vectors[0]).toHaveLength(1536);
    expect(f.calls).toEqual({ embed: 4, answer: 2 });
  });
});
