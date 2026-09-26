// Подменный шлюз эмбеддингов для тестов chunk-embed: настоящий клиент createOpenRouter с подменным fetch —
// разбор ответа, 1536, классы отказа — боевые. Живой OpenRouter в тестах НЕ вызывается: чужой адрес — отказ.
// Векторы детерминированы текстом (sha256 → ГПСЧ → нормировка): одинаковый текст — одинаковый вектор.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from '../../packages/db/src/index';
import { createOpenRouter, loadCeilings, spendRecorder, type OpenRouter, type SpendEvent } from '../../packages/rag/src/index';
import { createEmbedder } from '../../apps/worker/src/embed/embed-and-store';
import { environment } from './environment';

export function vectorFor(text: string, length = 1536): number[] {
  let seed = createHash('sha256').update(text).digest().readUInt32LE(0) || 1;
  const v = Array.from({ length }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) - 0.5; });
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

export type GatewayReply = 'ok' | '500' | '429' | '400' | 'dim3072';
export interface FakeGateway {
  request: typeof fetch;
  calls: Array<{ texts: string[] }>;
  // Ответ на вызов номер n (с 1). Можно заменить в тесте.
  reply: (n: number, texts: string[]) => GatewayReply | Promise<GatewayReply>;
}
export function fakeGateway(reply: FakeGateway['reply'] = () => 'ok'): FakeGateway {
  const gateway: FakeGateway = { calls: [], reply, request: undefined as unknown as typeof fetch };
  gateway.request = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const href = String(url);
    if (href !== 'https://openrouter.ai/api/v1/embeddings') throw new TypeError(`подменный шлюз: чужой адрес ${href}`);
    const body = JSON.parse(String(init.body)) as { input: string[]; dimensions: number };
    gateway.calls.push({ texts: body.input });
    const mode = await gateway.reply(gateway.calls.length, body.input);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (mode === '500') return json({ error: 'upstream' }, 500);
    if (mode === '429') return json({ error: 'rate' }, 429);
    if (mode === '400') return json({ error: 'bad' }, 400);
    const length = mode === 'dim3072' ? 3072 : body.dimensions;
    return json({ data: body.input.map((t) => ({ embedding: vectorFor(t, length) })), usage: { prompt_tokens: body.input.length * 7, total_tokens: body.input.length * 7 } });
  }) as typeof fetch;
  return gateway;
}

export const readSpend = (file: string): SpendEvent[] => existsSync(file)
  ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as SpendEvent) : [];

export interface TestEmbedderOptions {
  gateway?: FakeGateway; client?: Pick<OpenRouter, 'embed'>; env?: Record<string, string>; log?: (line: string) => void;
}
export function testEmbedder(pool: Pool, options: TestEmbedderOptions = {}) {
  const gateway = options.gateway ?? fakeGateway();
  const dir = path.join(tmpdir(), `n6-spend-ce-${randomBytes(6).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  const spendFile = path.join(dir, 'model-spend.jsonl');
  const env = { ...environment(), ...options.env };
  const client = options.client ?? createOpenRouter({ apiKey: 'test-key', answerModel: env.ANSWER_MODEL!, embedModel: env.EMBED_MODEL! }, gateway.request);
  const embedder = createEmbedder({ pool, client, ceilings: loadCeilings(env), spend: spendRecorder(spendFile), embedModel: env.EMBED_MODEL!,
    retryPauseMs: 0, log: options.log ?? (() => {}) });
  return { embedder, gateway, spendFile, spend: () => readSpend(spendFile) };
}
