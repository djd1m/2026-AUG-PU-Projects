// Клиент OpenRouter (ADR-002, ADR-011, FR-INDEX-002): форма запроса и классы отказа. Сеть подменена.
import { describe, expect, it } from 'vitest';
import { createOpenRouter, GatewayResponseError, OPENROUTER_BASE } from '../packages/rag/src/openrouter';
import { RetryableCallError } from '../packages/rag/src/spend';

const config = { apiKey: 'test-key', answerModel: 'anthropic/claude-haiku-4.5', embedModel: 'openai/text-embedding-3-small' };
type Seen = { url: string; body: Record<string, unknown>; init: RequestInit };
function gateway(reply: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const request = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    seen.push({ url: String(url), body, init });
    return reply(body);
  }) as typeof fetch;
  return { seen, client: createOpenRouter(config, request) };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const vectors = (count: number, length: number) => ({ data: Array.from({ length: count }, () => ({ embedding: Array(length).fill(0.5) })), usage: { prompt_tokens: 7, total_tokens: 7 } });

describe('Эмбеддинги: 1536 измерений, иначе отказ', () => {
  it('запрос несёт модель, dimensions 1536 и пачку; ответ — векторы и токены', async () => {
    const { seen, client } = gateway(() => json(vectors(2, 1536)));
    const result = await client.embed({ texts: ['а', 'б'] });
    expect(seen[0]!.url).toBe(`${OPENROUTER_BASE}/embeddings`);
    expect(seen[0]!.body).toEqual({ model: 'openai/text-embedding-3-small', input: ['а', 'б'], dimensions: 1536 });
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(seen[0]!.init.redirect).toBe('error');
    expect(result.vectors.map((v) => v.length)).toEqual([1536, 1536]);
    expect(result.tokens).toBe(7);
  });
  it.each([1535, 3072])('длина %i — dimension_mismatch, а не «почти подходит»', async (length) => {
    const { client } = gateway(() => json(vectors(1, length)));
    await expect(client.embed({ texts: ['а'] })).rejects.toMatchObject({ spendResult: 'dimension_mismatch' });
  });
  it('число векторов ≠ числу текстов, не-числа — schema_violation', async () => {
    await expect(gateway(() => json(vectors(1, 1536))).client.embed({ texts: ['а', 'б'] })).rejects.toMatchObject({ spendResult: 'schema_violation' });
    await expect(gateway(() => json({ data: [{ embedding: Array(1536).fill('x') }] })).client.embed({ texts: ['а'] })).rejects.toMatchObject({ spendResult: 'schema_violation' });
  });
  it('пустая пачка и пачка > 64 отвергаются до сети', async () => {
    const { seen, client } = gateway(() => json(vectors(1, 1536)));
    await expect(client.embed({ texts: [] })).rejects.toThrow('1–64');
    await expect(client.embed({ texts: Array(65).fill('а') })).rejects.toThrow('1–64');
    expect(seen).toHaveLength(0);
  });
});

describe('Ответ модели: JSON-схема, temperature 0, max_tokens ≤ 400', () => {
  it('запрос несёт response_format json_schema strict, temperature 0, max_tokens 400, require_parameters', async () => {
    const { seen, client } = gateway(() => json({ choices: [{ message: { content: '{"status":"answered"}' } }], usage: { total_tokens: 30 } }));
    const result = await client.complete({ messages: [{ role: 'user', content: 'вопрос' }], schemaName: 'answer', schema: { type: 'object' } });
    expect(seen[0]!.url).toBe(`${OPENROUTER_BASE}/chat/completions`);
    expect(seen[0]!.body).toMatchObject({ model: 'anthropic/claude-haiku-4.5', temperature: 0, max_tokens: 400,
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: { type: 'object' } } },
      provider: { require_parameters: true } });
    expect(result).toEqual({ value: { status: 'answered' }, tokens: 30 });
  });
  it('max_tokens выше канона — отказ до сети', async () => {
    const { seen, client } = gateway(() => json({}));
    await expect(client.complete({ messages: [], schemaName: 'a', schema: {}, maxTokens: 401 })).rejects.toThrow('≤ 400');
    expect(seen).toHaveLength(0);
  });
  it('не JSON, отказ модели (refusal), нет choices — schema_violation', async () => {
    for (const body of [{ choices: [{ message: { content: 'просто текст' } }] }, { choices: [{ message: { content: '{}', refusal: 'нет' } }] }, {}]) {
      await expect(gateway(() => json(body)).client.complete({ messages: [], schemaName: 'a', schema: {} })).rejects.toBeInstanceOf(GatewayResponseError);
    }
  });
});

describe('Классы отказа шлюза: повторяемые и нет', () => {
  it.each([[429, 'rate_limited'], [500, 'provider_error'], [503, 'provider_error']])('%i — RetryableCallError(%s)', async (status, result) => {
    const error = await gateway(() => json({}, status)).client.embed({ texts: ['а'] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryableCallError);
    expect((error as RetryableCallError).result).toBe(result);
  });
  it.each([400, 401, 402])('%i — не повторяется (GatewayResponseError)', async (status) => {
    await expect(gateway(() => json({}, status)).client.embed({ texts: ['а'] })).rejects.toBeInstanceOf(GatewayResponseError);
  });
  it('сетевой сбой — повторяемый provider_error; тело ошибки с ключом не утекает в сообщение', async () => {
    const { client } = gateway(() => { throw new TypeError('connect ECONNREFUSED Bearer test-key'); });
    const error = await client.embed({ texts: ['а'] }).catch((e: unknown) => e) as Error;
    expect(error).toBeInstanceOf(RetryableCallError);
    expect(error.message).not.toContain('test-key');
  });
});
