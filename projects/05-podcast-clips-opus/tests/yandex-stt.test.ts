import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { status, type ClientDuplexStream } from '@grpc/grpc-js';
import { createYandexTranscriber, YandexFinals, type YandexConnect } from '../apps/worker/src/stt/yandex';
import { yandexMethod, yandexSession, YANDEX_METHOD, YANDEX_HOST } from '../apps/worker/src/stt/yandex-protocol';
import { loadLlmConfig, loadSttConfig } from '../packages/shared/src/config';
import { createTranscriber } from '../apps/worker/src/stt/client';
import { environment } from './fixtures/environment';
const golden = JSON.parse(readFileSync('tests/fixtures/yandex-official-golden.json', 'utf8')) as {
  method_path: string; request_hex: string; audio_chunk_golden: { data_hex: string; request_hex: string }; responses: { event?: string; hex: string }[];
};
const frames = () => golden.responses.map(frame => yandexMethod.responseDeserialize(Buffer.from(frame.hex, 'hex')));
const final = () => structuredClone(frames().find(value => (value as { Event: string }).Event === 'final')) as Record<string, unknown>;
class Rpc extends EventEmitter {
  writes: object[] = [];
  cancel = vi.fn();
  write = vi.fn((data: object) => { this.writes.push(data); return true; });
  end = vi.fn(() => { this.emit('finish'); });
}
let directory: string, path: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'n5-yandex-')); path = join(directory, 'audio.mp3'); await writeFile(path, 'actual mp3 bytes'); });
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); });
function harness() {
  const call = new Rpc(), close = vi.fn();
  const open = vi.fn<YandexConnect>(() => ({ call: call as unknown as ClientDuplexStream<object, unknown>, close }));
  const transcriber = createYandexTranscriber('synthetic-yandex', open);
  const success = () => { frames().forEach(frame => call.emit('data', frame)); call.emit('end'); call.emit('status', { code: status.OK }); };
  return { call, close, open, transcriber, success };
}
async function started(h: ReturnType<typeof harness>, duration = 6, signal = new AbortController().signal) {
  const promise = h.transcriber.transcribe(path, duration, signal);
  await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(1));
  return { promise };
}
describe('Yandex official protocol and strict finals', () => {
  it('interoperates with independently complete official-schema golden including zero final index', () => {
    expect(YANDEX_HOST).toBe('stt.api.cloud.yandex.net:443');
    expect(yandexMethod.path).toBe(golden.method_path); expect(YANDEX_METHOD).toBe(golden.method_path);
    expect(yandexMethod.requestSerialize(yandexSession).toString('hex')).toBe(golden.request_hex);
    expect(yandexMethod.requestSerialize({ chunk: { data: Buffer.from(golden.audio_chunk_golden.data_hex, 'hex') } }).toString('hex')).toBe(golden.audio_chunk_golden.request_hex);
    const indices = frames().filter(value => (value as { Event?: string }).Event === 'final')
      .map(value => (value as { audio_cursors: { final_index: string } }).audio_cursors.final_index);
    expect(indices).toEqual(['0', '1']);
    const collector = new YandexFinals(); frames().forEach(frame => collector.add(frame));
    const result = collector.finish(6);
    expect(result.language).toBe('ru'); expect(result.words).toHaveLength(10); expect(result.segments).toHaveLength(2);
    expect(result.words[0]!).toMatchObject({ word: 'америка', start: 0.38, end: 0.52 });
    expect(result.words.at(-1)).toMatchObject({ end: 4.56 });
  });
  it('deduplicates exact finals, ignores partial/refinement and sorts actual indices', () => {
    const collector = new YandexFinals(), finals = frames().filter(value => (value as { Event: string }).Event === 'final');
    collector.add(finals[1]!); collector.add(finals[0]!); collector.add(finals[0]!);
    collector.add({ Event: 'partial', partial: final() }); collector.add({ Event: 'final_refinement', final_refinement: final() });
    expect(collector.finish(6).words).toHaveLength(10);
  });
  it.each(['conflict', 'channel', 'missing-index', 'unsafe-index', 'empty-words', 'missing-words', 'missing-time', 'whitespace-time', 'negative-index', 'fractional-time', 'unsafe-time', 'float-time', 'bad-languages', 'blank-language', 'empty-context', 'bad-envelope'])('rejects %s without repairing a mock', fault => {
    const collector = new YandexFinals(), value = final();
    if (fault === 'conflict' || fault === 'channel') collector.add(value);
    const alternative = (value.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!;
    const word = (alternative.words as Record<string, unknown>[])[0]!;
    if (fault === 'conflict') alternative.text = 'другое';
    if (fault === 'channel') value.channel_tag = '1';
    if (fault === 'missing-index') delete (value.audio_cursors as Record<string, unknown>).final_index;
    if (fault === 'unsafe-index') (value.audio_cursors as Record<string, unknown>).final_index = '9007199254740992';
    if (fault === 'empty-words') alternative.words = [];
    if (fault === 'missing-words') delete alternative.words;
    if (fault === 'whitespace-time') word.start_time_ms = ' 0';
    if (fault === 'negative-index') (value.audio_cursors as Record<string, unknown>).final_index = '-1';
    if (fault === 'fractional-time') word.start_time_ms = '0.1';
    if (fault === 'missing-time') delete word.start_time_ms;
    if (fault === 'unsafe-time') word.end_time_ms = '9007199254740992';
    if (fault === 'float-time') word.start_time_ms = '1e3';
    if (fault === 'bad-languages') alternative.languages = null;
    if (fault === 'blank-language') alternative.languages = [{ language_code: '' }];
    if (fault === 'empty-context') alternative.text = ' ';
    if (fault === 'bad-envelope') value.Event = undefined;
    expect(() => collector.add(value)).toThrow();
  });
  it('ignores well-formed silence finals but refuses silence-only or missing timing', () => {
    const silence = final(); (silence.audio_cursors as Record<string, unknown>).final_index = '21';
    const alternative = (silence.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!;
    alternative.words = []; alternative.text = ''; alternative.start_time_ms = '184160'; alternative.end_time_ms = '199800';
    const collector = new YandexFinals(); frames().forEach(frame => collector.add(frame)); collector.add(silence);
    expect(collector.finish(200).words).toHaveLength(10); expect(collector.finish(200).segments).toHaveLength(2);
    collector.add(structuredClone(silence));
    const conflicting = structuredClone(silence);
    (conflicting.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!.end_time_ms = '199900';
    expect(() => collector.add(conflicting)).toThrow();
    const empty = new YandexFinals(); empty.add(silence); expect(() => empty.finish(200)).toThrow();
    delete alternative.start_time_ms; expect(() => new YandexFinals().add(silence)).toThrow();
  });
  it('rejects no-final output and uses the first supplied language in final-index order', () => {
    const collector = new YandexFinals(); collector.add({ Event: 'status_code', status_code: {} });
    expect(() => collector.finish(6)).toThrow();
    const value = final(); (value.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!.languages = [{ language_code: 'ru-RU' }];
    collector.add(value); expect(collector.finish(6).language).toBe('ru-RU');
  });
  it('preserves shared clamp diagnostics for exact signed milliseconds and reversed finite intervals', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}), value = final();
    const alternative = (value.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!;
    const words = alternative.words as Record<string, unknown>[];
    words[0]!.start_time_ms = '-200'; words[0]!.end_time_ms = '-100';
    words[1]!.start_time_ms = '300'; words[1]!.end_time_ms = '200';
    alternative.start_time_ms = '-400'; alternative.end_time_ms = '-500';
    const collector = new YandexFinals(); collector.add(value);
    const result = collector.finish(6);
    expect(result.words[0]).toMatchObject({ start: 0, end: 0 }); expect(result.words[1]).toMatchObject({ start: 0.3, end: 0.3 });
    expect(result.segments[0]).toMatchObject({ start: 0, end: 0 });
    const events = warn.mock.calls.map(([line]) => JSON.parse(line));
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ event: 'stt_timing_clamped', kind: 'word', start_seconds: -0.2, end_seconds: -0.1, corrected_start_seconds: 0, corrected_end_seconds: 0 });
    expect(events[1]).toMatchObject({ event: 'stt_timing_clamped', kind: 'word', start_seconds: 0.3, end_seconds: 0.2, corrected_end_seconds: 0.3 });
    expect(events[2]).toMatchObject({ event: 'stt_timing_clamped', kind: 'segment', start_seconds: -0.4, end_seconds: -0.5 });
  });
  it('still rejects a safe signed word start wholly after the actual duration', () => {
    const value = final(), alternative = (value.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!;
    (alternative.words as Record<string, unknown>[])[0]!.start_time_ms = '7000';
    const collector = new YandexFinals(); collector.add(value); expect(() => collector.finish(6)).toThrow();
  });
  it('accepts genuine protobuf scalar zero but never inserts missing mock time', () => {
    const value = final(), alternative = (value.final as { alternatives: Record<string, unknown>[] }).alternatives[0]!;
    alternative.start_time_ms = '0'; (alternative.words as Record<string, unknown>[])[0]!.start_time_ms = '0';
    // Omit actual protobuf scalar fields on wire: decoder supplies protocol zero.
    // Passing the same missing fields as a plain mock remains an error above.
    delete alternative.start_time_ms; delete (alternative.words as Record<string, unknown>[])[0]!.start_time_ms;
    const decoded = yandexMethod.responseDeserialize(yandexMethod.responseSerialize(value));
    const collector = new YandexFinals(); collector.add(decoded); expect(collector.finish(6).words[0]!.start).toBe(0);
  });
});
describe('Yandex one-call transport lifecycle', () => {
  it('sends exact options/actual bytes/auth once and waits for end AND successful status', async () => {
    const h = harness(), { promise } = await started(h); let resolved = false; void promise.then(() => { resolved = true; });
    expect(h.open.mock.calls[0]![0]!.get('authorization')).toEqual(['Api-Key synthetic-yandex']);
    expect(h.open.mock.calls[0]![1]!.deadline).toBeInstanceOf(Date);
    expect(h.call.writes[0]!).toEqual(yandexSession);
    expect(h.call.writes[1]!).toEqual({ chunk: { data: Buffer.from('actual mp3 bytes') } }); expect(h.call.end).toHaveBeenCalledOnce();
    frames().forEach(frame => h.call.emit('data', frame)); h.call.emit('end'); await Promise.resolve(); expect(resolved).toBe(false);
    h.call.emit('status', { code: status.OK }); expect((await promise).words).toHaveLength(10);
    expect(h.close).toHaveBeenCalledOnce(); expect(h.call.cancel).not.toHaveBeenCalled();
  });
  it.each(['options', 'audio', 'half-close'])('refuses remote success before producer half-close during %s backpressure', async phase => {
    const h = harness(); h.call.write.mockImplementation(data => {
      h.call.writes.push(data); return phase === 'options' ? false : phase === 'audio' ? !('chunk' in data) : true;
    });
    if (phase === 'half-close') h.call.end.mockImplementation(() => {});
    const { promise } = await started(h);
    const rejected = expect(promise).rejects.toMatchObject({ retryable: false, outcome: 'provider_error' });
    if (phase === 'half-close') expect(h.call.end).toHaveBeenCalledOnce(); else expect(h.call.end).not.toHaveBeenCalled();
    h.success(); await rejected;
    const writes = h.call.writes.length;
    h.call.emit('drain'); h.success();
    if (phase === 'half-close') expect(h.call.end).toHaveBeenCalledOnce(); else expect(h.call.end).not.toHaveBeenCalled();
    expect(h.call.writes).toHaveLength(writes);
    expect(h.call.cancel).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce();
  });
  it('honors write backpressure before half-close', async () => {
    const h = harness(); h.call.write.mockImplementationOnce(data => { h.call.writes.push(data); return false; });
    const { promise } = await started(h); expect(h.call.end).not.toHaveBeenCalled(); expect(h.call.writes).toHaveLength(1);
    h.call.emit('drain'); expect(h.call.end).toHaveBeenCalledOnce(); h.success(); await promise;
  });
  it.each([status.UNAVAILABLE, status.DEADLINE_EXCEEDED, status.RESOURCE_EXHAUSTED, status.UNAUTHENTICATED, status.PERMISSION_DENIED, status.INVALID_ARGUMENT, status.CANCELLED, status.INTERNAL])('classifies status %s after finals without accepting or retrying', async code => {
    const h = harness(), { promise } = await started(h); const rejected = expect(promise).rejects.toMatchObject({ retryable: [status.UNAVAILABLE, status.DEADLINE_EXCEEDED, status.RESOURCE_EXHAUSTED].includes(code) });
    frames().forEach(frame => h.call.emit('data', frame)); h.call.emit('end'); h.call.emit('status', { code }); await rejected;
    expect(h.open).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce(); expect(h.call.cancel).toHaveBeenCalledOnce();
  });
  it.each(['upload', 'result', 'status'])('bounds stalled %s at 120000 ms and rejects late events', async phase => {
    vi.useFakeTimers();
    const h = harness();
    if (phase === 'upload') h.call.write.mockReturnValue(false);
    const { promise } = await started(h); const rejected = expect(promise).rejects.toMatchObject({ retryable: true, outcome: 'timeout' });
    if (phase === 'status') { frames().forEach(frame => h.call.emit('data', frame)); h.call.emit('end'); }
    await vi.advanceTimersByTimeAsync(119000); expect(h.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    h.success(); expect(h.call.cancel).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce();
  });
  it('caller abort cancels once and blocks late acceptance', async () => {
    const h = harness(), controller = new AbortController(), { promise } = await started(h, 6, controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ retryable: false, outcome: 'timeout' }); controller.abort(); await rejected;
    h.success(); expect(h.call.cancel).toHaveBeenCalledOnce(); expect(h.close).toHaveBeenCalledOnce();
  });
  it('already aborted caller dispatches zero RPCs', async () => {
    const h = harness(), controller = new AbortController(); controller.abort();
    await expect(h.transcriber.transcribe('absent', 6, controller.signal)).rejects.toThrow(); expect(h.open).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 300.001])('rejects duration %s before opening an RPC', async duration => {
    const h = harness(); await expect(h.transcriber.transcribe(path, duration, new AbortController().signal)).rejects.toThrow(); expect(h.open).not.toHaveBeenCalled();
  });
  it.each([0, 10_000_001, 25_000_001])('rejects %s bytes before RPC', async bytes => {
    await writeFile(path, Buffer.alloc(bytes)); const h = harness(); await expect(h.transcriber.transcribe(path, 6, new AbortController().signal)).rejects.toThrow(); expect(h.open).not.toHaveBeenCalled();
  });
  it('accepts exact 10MB and 300s with bounded chunks', async () => {
    await writeFile(path, Buffer.alloc(10_000_000)); const h = harness(), { promise } = await started(h, 300);
    expect(h.call.writes.slice(1).every(value => (value as { chunk: { data: Buffer } }).chunk.data.length <= 65536)).toBe(true);
    expect(h.call.writes.slice(1).reduce((n, value) => n + (value as { chunk: { data: Buffer } }).chunk.data.length, 0)).toBe(10_000_000);
    h.success(); await promise;
  });
});
it('keeps independent closed selectors and selected-key-only live requirements', async () => {
  const env = { ...environment(), N5_MODEL_PROVIDER: 'live', N5_STT_PROVIDER: 'yandex', YANDEX_SPEECHKIT_API_KEY: 'synthetic', OPENROUTER_API_KEY: undefined };
  expect(loadSttConfig(env)).toMatchObject({ provider: 'yandex', model: 'general', apiKey: 'synthetic' });
  expect(() => loadSttConfig({ ...env, YANDEX_SPEECHKIT_API_KEY: undefined })).toThrow('YANDEX_SPEECHKIT_API_KEY');
  expect(() => loadLlmConfig({ ...environment(), N5_LLM_PROVIDER: 'yandex' })).toThrow();
  const request = vi.fn<typeof fetch>(async () => { throw new Error('Unexpected fake provider request'); });
  const fakeConfig = loadSttConfig({ ...env, NODE_ENV: 'test', N5_MODEL_PROVIDER: 'fake',
    YANDEX_SPEECHKIT_API_KEY: undefined, OPENROUTER_API_KEY: undefined });
  expect(fakeConfig.apiKey).toBeNull();
  const transcript = await createTranscriber(fakeConfig, request).transcribe('unused', 6, new AbortController().signal);
  const { parseTranscript } = await import('../packages/shared/src/transcript');
  expect(parseTranscript(transcript, 6)).toEqual(transcript);
  expect(transcript.words.length).toBeGreaterThan(0);
  for (const word of transcript.words) {
    expect(word.start).toBeGreaterThanOrEqual(0);
    expect(word.end).toBeGreaterThan(word.start);
    expect(word.end).toBeLessThanOrEqual(6);
  }
  expect(transcript.words.at(-1)?.end).toBe(6);
  expect(request).not.toHaveBeenCalled();
});

it('pins TLS credentials and disables transparent gRPC retries in shipped transport', () => {
  const source = readFileSync('apps/worker/src/stt/yandex.ts', 'utf8');
  expect(source).toContain('new Client(YANDEX_HOST, credentials.createSsl()');
  expect(source).toContain("'grpc.enable_retries': 0");
});

it('keeps live qualification partial without claiming completed migration', () => {
  const current = readFileSync('docs/features/cloudru-provider-foundation/05_completion.md', 'utf8').split('# v1 historical')[0]!;
  expect(current).toContain('PARTIAL');
  expect(current).toContain('does not claim natural Russian speech quality');
  expect(current).toContain('or completed migration');
});
