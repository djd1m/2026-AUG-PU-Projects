import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FRAGMENTS_SCHEMA, validateFragments, SELECT_TIMEOUT_MS } from '../packages/shared/src/fragments';
import { loadLlmConfig } from '../packages/shared/src/config';
import { createSelector } from '../apps/worker/src/llm/provider';
import { createFakeSelector, fakeFragment, type FakeCase } from '../apps/worker/src/llm/fake';
import { SYSTEM_PROMPT } from '../apps/worker/src/llm/prompts/selection';
import { selectionMigration } from '../scripts/generate-selection-migration.mjs';
import { environment } from './fixtures/environment';
const transcript = { language: 'ru', words: Array.from({ length: 360 }, (_, i) => ({ word: 'слово', start: i, end: i + 0.8 })), segments: [] };
const valid = (scenario: FakeCase) => createFakeSelector(scenario).select(transcript, 360, new AbortController().signal);
describe('selection semantics', () => {
  it('honest count: never pads fewer than three', async () => {
    expect(validateFragments({ fragments: [fakeFragment()] }, transcript, 360)).toHaveLength(1);
    expect(validateFragments(await valid('few'), transcript, 360)).toHaveLength(2);
    expect(validateFragments(await valid('empty'), transcript, 360)).toEqual([]);
  });
  it.each(['score', 'explanation', 'length'] as const)('our code rejects invalid %s', async scenario => {
    expect(validateFragments(await valid(scenario), transcript, 360)).toEqual([]);
  });
  it('never salvages a padded response with an invalid candidate', () => {
    for (const patch of [{ score_hook: 34, score: 84 }, { end_seconds: 136 }, { explain_hook: ' ' }]) {
      expect(validateFragments({ fragments: [fakeFragment(0), fakeFragment(1), { ...fakeFragment(2), ...patch }] }, transcript, 360)).toEqual([]);
    }
  });
  it('prompt keeps the target at three to eight while explicitly allowing fewer', () => {
    expect(SYSTEM_PROMPT).toContain('3–8');
    expect(SYSTEM_PROMPT).toContain('меньше трёх, верни столько, сколько есть');
    expect(SYSTEM_PROMPT).toContain('не добирай слабые фрагменты');
  });
  it('rejects bad total, fractions, NaN, infinity, negatives and foreign explanations', () => {
    for (const patch of [{ score: 99 }, { score_hook: 1.5 }, { start_seconds: NaN }, { end_seconds: Infinity },
      { start_seconds: -1 }, { explain_hook: 'English only' }]) {
      expect(validateFragments({ fragments: [{ ...fakeFragment(), ...patch }] }, transcript, 360)).toEqual([]);
    }
  });
  it('caps excessive candidates at eight highest scores', async () => {
    const response = await valid('excess') as { fragments: ReturnType<typeof fakeFragment>[] };
    response.fragments[9]!.score_hook = 33; response.fragments[9]!.score = 83;
    const result = validateFragments(response, transcript, 360);
    expect(result).toHaveLength(8); expect(result[0]!.start_seconds).toBe(270);
  });
  it('snaps to WORD boundaries, never seconds or segment boundaries', () => {
    const words = [{ word: 'Начало', start: 0.1234, end: 1.1234 }, { word: 'Конец', start: 25.4321, end: 26.4321 }];
    const result = validateFragments({ fragments: [{ ...fakeFragment(), start_seconds: 0.5, end_seconds: 26 }] }, { ...transcript, words }, 30);
    expect(result[0]).toMatchObject({ start_seconds: 0.1234, end_seconds: 26.4321 });
  });
  it('revalidates length and overlaps AFTER snapping', () => {
    const words = [{ word: 'а', start: 0, end: 1 }, { word: 'б', start: 18, end: 19 }];
    expect(validateFragments({ fragments: [{ ...fakeFragment(), end_seconds: 20 }] }, { ...transcript, words }, 30)).toEqual([]);
    expect(validateFragments({ fragments: [fakeFragment(), { ...fakeFragment(), start_seconds: 1, end_seconds: 26 }] }, transcript, 360)).toHaveLength(1);
  });
  it('rejects boundaries inside overlapping transcript words', () => {
    const words = [{ word: 'а', start: 0, end: 3 }, { word: 'б', start: 1, end: 2 }, { word: 'в', start: 25, end: 26 }];
    expect(validateFragments({ fragments: [{ ...fakeFragment(), start_seconds: 1, end_seconds: 26 }] }, { ...transcript, words }, 30)).toEqual([]);
  });
  it('shape is closed and missing timestamps fail', () => {
    for (const response of [{ fragments: [{}] }, { fragments: [ { ...fakeFragment(), extra: 1 } ] }, { fragments: [], extra: 1 }, null]) {
      expect(() => validateFragments(response, transcript, 360)).toThrow();
    }
    expect(() => validateFragments({ fragments: [fakeFragment()] }, { ...transcript, words: [] }, 360)).toThrow();
  });
  it('schema request and migration share exactly one declaration', () => {
    expect(FRAGMENTS_SCHEMA.properties.fragments).toMatchObject({ minItems: 1, maxItems: 8 });
    expect(readFileSync('packages/db/migrations/007_selection.sql', 'utf8')).toBe(selectionMigration());
  });
});
describe('OpenRouter adapter', () => {
  it.each(['anthropic/claude-sonnet-5', 'google/gemini-3.8-flash'])('configuration alone switches %s and pinned endpoints', async model => {
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ fragments: [fakeFragment()] }) } }] })));
    const config = loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live', N5_LLM_MODEL: model });
    await createSelector(config, request).select(transcript, 360, new AbortController().signal);
    const args = (request.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(args[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(String(args[1].body));
    expect(body.model).toBe(model); expect(body.response_format.json_schema).toEqual({ name: 'fragments', strict: true, schema: FRAGMENTS_SCHEMA });
    expect(body.provider).toEqual({ only: model.startsWith('anthropic') ? ['Anthropic', 'Claude Platform on AWS'] : ['Google'], allow_fallbacks: false, require_parameters: true });
    expect(body.messages[1].content).toContain('359'); expect(request).toHaveBeenCalledTimes(1);
  });
  it('source guard requires provider.only, no fallbacks and required parameters', () => {
    const source = readFileSync('apps/worker/src/llm/provider.ts', 'utf8');
    expect(source).toMatch(/provider:\s*\{\s*only:/);
    expect(source).toContain('allow_fallbacks: false'); expect(source).toContain('require_parameters: true');
  });
  it('adapter path rejects the whole response when one of three candidates is out of range', async () => {
    const response = { fragments: [fakeFragment(0), fakeFragment(1), { ...fakeFragment(2), end_seconds: 61 }] };
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] })));
    const output = await createSelector(loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live' }), request)
      .select(transcript, 360, new AbortController().signal);
    expect(validateFragments(output, transcript, 360)).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('configuration rejects missing model/key and production fake', () => {
    for (const patch of [{ N5_LLM_MODEL: undefined }, { N5_LLM_MODEL: 'unknown' }, { NODE_ENV: 'production' },
      { N5_MODEL_PROVIDER: 'live', OPENROUTER_API_KEY: '' }]) expect(() => loadLlmConfig({ ...environment(), ...patch })).toThrow();
  });
  it('5xx is a single attempt and does not retry', async () => {
    const request = vi.fn(async () => new Response('', { status: 503 }));
    await expect(createSelector(loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live' }), request)
      .select(transcript, 360, new AbortController().signal)).rejects.toMatchObject({ outcome: 'provider_error' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('timeout covers stalled response body, not only headers', async () => {
    const controller = new AbortController();
    const request: typeof fetch = vi.fn(async (_url, init) => {
      const body = new ReadableStream({ start(stream) { init!.signal!.addEventListener('abort', () => stream.error(new Error('aborted'))); } });
      return new Response(body);
    });
    const pending = createSelector(loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live' }), request).select(transcript, 360, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ outcome: 'timeout' }); expect(SELECT_TIMEOUT_MS).toBeLessThan(300_000);
  });
  it('malformed JSON or refusal fails closed', async () => {
    for (const content of ['broken', JSON.stringify({ choices: [{ message: { refusal: 'no', content: '{}' } }] })]) {
      const request = vi.fn(async () => new Response(content));
      await expect(createSelector(loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live' }), request).select(transcript, 360, new AbortController().signal)).rejects.toThrow();
    }
  });
});
