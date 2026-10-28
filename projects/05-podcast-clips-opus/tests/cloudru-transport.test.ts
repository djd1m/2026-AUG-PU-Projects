import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import * as transport from '../apps/worker/src/llm/cloudru-transport';
import { createSelector } from '../apps/worker/src/llm/provider';
import { loadLlmConfig } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';

const transcript = { language: 'ru', words: [], segments: [] };
const envelope = JSON.stringify({ choices: [{ message: { content: '{"fragments":[]}' } }] });
const originalFactory = transport.createCloudruTransport;
afterEach(() => vi.restoreAllMocks());

it.each(['headers', 'body'] as const)('production Cloud transport carries phase bounds, abort and cleanup through %s', async phase => {
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const server = createServer((_req, res) => {
    if (phase === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write(envelope.slice(0, 1)); }
    const timer = setTimeout(() => { timers.delete(timer); res.end(phase === 'body' ? envelope.slice(1) : envelope); }, 1450);
    timers.add(timer);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  let bound = 3000;
  const disposals: ReturnType<typeof vi.spyOn>[] = [];
  const factory = vi.spyOn(transport, 'createCloudruTransport').mockImplementation(ms => {
    expect(ms).toBe(600000);
    const owned = originalFactory(bound);
    disposals.push(vi.spyOn(owned, 'dispose'));
    return owned;
  });
  const config = loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live', N5_LLM_PROVIDER: 'cloudru',
    N5_LLM_MODEL: 'deepseek-ai/DeepSeek-V4-Pro', CLOUDRU_FM_API_KEY: 'synthetic-key' });
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://foundation-models.api.cloud.ru/v1/chat/completions');
    expect(init).toHaveProperty('dispatcher');
    return fetch(`http://127.0.0.1:${address.port}`, init);
  });
  try {
    // Same production selection path: short phase timeout fails, longer one succeeds.
    bound = 100;
    await expect(createSelector(config, request).select(transcript, 360, new AbortController().signal))
      .rejects.toMatchObject({ outcome: 'provider_error', kind: 'transport', code: phase === 'headers' ? 'UND_ERR_HEADERS_TIMEOUT' : 'UND_ERR_BODY_TIMEOUT' });
    bound = 3000;
    await expect(createSelector(config, request).select(transcript, 360, new AbortController().signal)).resolves.toEqual({ fragments: [] });
    const caller = new AbortController();
    const started = performance.now();
    const pending = createSelector(config, request).select(transcript, 360, caller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ outcome: 'timeout' });
    const timer = setTimeout(() => caller.abort(), 60);
    await rejected; clearTimeout(timer);
    expect(performance.now() - started).toBeLessThan(700);
    expect(request).toHaveBeenCalledTimes(3);
    expect(disposals).toHaveLength(3);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(sockets.size).toBe(0);
    const openrouter = loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live' });
    const fake = vi.fn<typeof fetch>(async (_url, init) => { expect(init).not.toHaveProperty('dispatcher'); return Response.json(JSON.parse(envelope)); });
    await createSelector(openrouter, fake).select(transcript, 360, new AbortController().signal);
    expect(factory).toHaveBeenCalledTimes(3);
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('destroys the owned driver even with injected fetch and preserves only safe diagnostics', async () => {
  const disposals: ReturnType<typeof vi.spyOn>[] = [];
  vi.spyOn(transport, 'createCloudruTransport').mockImplementation(ms => {
    const owned = originalFactory(ms); disposals.push(vi.spyOn(owned, 'dispose')); return owned;
  });
  const config = loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live', N5_LLM_PROVIDER: 'cloudru',
    N5_LLM_MODEL: 'deepseek-ai/DeepSeek-V4-Pro', CLOUDRU_FM_API_KEY: 'synthetic-key' });
  const secret = 'SYNTHETIC-SECRET-TRANSCRIPT-KEY';
  for (const code of ['UND_ERR_HEADERS_TIMEOUT', secret]) {
    const request = vi.fn<typeof fetch>(async () => { throw new TypeError(secret, { cause: { code, message: secret, headers: secret, body: secret } }); });
    const error = await createSelector(config, request).select(transcript, 360, new AbortController().signal).catch(value => value);
    expect(error).toMatchObject({ outcome: 'provider_error', kind: code === secret ? 'unknown' : 'transport', code: code === secret ? undefined : code });
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
    expect(error).not.toHaveProperty('cause');
  }
  const response = new Response(secret, { status: 503 });
  vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error(secret));
  await expect(createSelector(config, async () => response).select(transcript, 360, new AbortController().signal))
    .rejects.toMatchObject({ outcome: 'provider_error', kind: 'http', status: 503 });
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
});
