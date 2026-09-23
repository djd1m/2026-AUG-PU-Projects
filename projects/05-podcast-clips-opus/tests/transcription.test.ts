import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscript, STT_MAX_BYTES, TranscriptError } from '../packages/shared/src/transcript';
import { loadSttConfig } from '../packages/shared/src/config';
import { createTranscriber } from '../apps/worker/src/stt/client';
import { chunkBoundaries, splitAudio } from '../apps/worker/src/stt/chunker';
import { extractAudio, runFfmpeg } from '../apps/worker/src/stt/extract';
import { mergeWords } from '../apps/worker/src/stt/merge';
import { probeFile } from '../apps/worker/src/media/probe';
import { recordModelSpend } from '../apps/worker/src/stt/spend';
const valid = { language: 'ru', words: [{ word: 'Привет', start: 0.2, end: 1 }], segments: [{ text: 'Привет', start: 0.2, end: 1 }] };
const dirs: string[] = [];
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'n5-stt-')); dirs.push(dir); return dir; }
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
describe('STT boundary and media', () => {
  it('TR-001 modeled MP3 tail is accepted, logged and clipped for strict persistence', () => {
    const videoDuration = 2.433, audioDuration = videoDuration + 0.1;
    const tail = { language: 'ru', words: [{ word: 'хвост', start: videoDuration - 0.2, end: audioDuration }],
      segments: [{ text: 'хвост', start: videoDuration - 0.2, end: audioDuration }] };
    const log = vi.fn();
    const merged = mergeWords([{ result: tail, offsetSeconds: 0, durationSeconds: audioDuration }], videoDuration, audioDuration, log);
    expect(parseTranscript(merged, videoDuration)).toEqual(merged);
    expect(merged.words[0]?.end).toBe(videoDuration); expect(merged.segments[0]?.end).toBe(videoDuration);
    expect(log).toHaveBeenCalledTimes(2);
    for (const [index, kind] of ['word', 'segment'].entries()) {
      expect(log.mock.calls[index]?.[0]).toMatchObject({ kind, index: 0, end_seconds: audioDuration, duration_seconds: videoDuration });
      expect(log.mock.calls[index]?.[0].excess_seconds).toBeCloseTo(0.1);
    }
  });
  it('TR-001 clamps a five-second end excess at audio and video bounds with logs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const videoDuration = 2.433, audioDuration = videoDuration + 0.1;
    const tail = { ...valid, words: [{ word: 'хвост', start: videoDuration - 0.2, end: videoDuration + 5 }] };
    const log = vi.fn();
    const merged = mergeWords([{ result: tail, offsetSeconds: 0, durationSeconds: videoDuration + 5 }],
      videoDuration, audioDuration, log);
    expect(merged.words[0]).toMatchObject({ start: videoDuration - .2, end: videoDuration });
    expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_timing_clamped', kind: 'word',
      end_seconds: videoDuration + 5, corrected_end_seconds: audioDuration });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatchObject({ kind: 'word', end_seconds: audioDuration, duration_seconds: videoDuration });
    expect(parseTranscript(merged, videoDuration)).toEqual(merged);
  });
  it('TR-001 equal audio and video durations are accepted unchanged without clamp logs', () => {
    const duration = 2.433;
    const transcript = { language: 'ru', words: [{ word: 'конец', start: duration - 0.2, end: duration }],
      segments: [{ text: 'конец', start: duration - 0.2, end: duration }] };
    const log = vi.fn();
    const merged = mergeWords([{ result: transcript, offsetSeconds: 0, durationSeconds: duration }], duration, duration, log);
    expect(merged).toEqual({ ...transcript, words: [{ ...transcript.words[0], chunk_index: 0 }] });
    expect(parseTranscript(merged, duration)).toEqual(merged);
    expect(log).not.toHaveBeenCalled();
  });
  it('real AAC extraction accepts timestamps within both measured durations without assuming encoder padding', async () => {
    const dir = await temp(), source = join(dir, 'source.m4a'), signal = AbortSignal.timeout(10_000);
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2.433', '-c:a', 'aac', source], signal);
    const videoDuration = (await probeFile(source)).durationSec;
    const audio = await extractAudio(source, join(dir, 'audio.mp3'), videoDuration, signal);
    const audioDuration = (await probeFile(audio.path)).durationSec;
    const end = Math.min(videoDuration, audioDuration);
    const tail = { language: 'ru', words: [{ word: 'конец', start: end - 0.2, end }],
      segments: [{ text: 'конец', start: end - 0.2, end }] };
    const log = vi.fn();
    const merged = mergeWords([{ result: tail, offsetSeconds: 0, durationSeconds: audioDuration }], videoDuration, audioDuration, log);
    expect(parseTranscript(merged, videoDuration)).toEqual(merged);
    expect(merged.words[0]?.end).toBe(end); expect(merged.segments[0]?.end).toBe(end);
    expect(log).not.toHaveBeenCalled();
  });
  it('TR-001 rejects invalid duration and wholly outside starts; clamps word and segment ends', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const duration of [NaN, Infinity, 0, -1]) expect(() => parseTranscript(valid, duration)).toThrow();
    const merge = (result: typeof valid) => mergeWords([{ result, offsetSeconds: 0, durationSeconds: 125 }], 120, 120.1, vi.fn());
    expect(() => merge({ ...valid, words: [{ word: 'x', start: 120.01, end: 120.05 }] })).toThrow();
    const merged = merge({ ...valid, segments: [{ text: 'x', start: 119, end: 125 }] });
    expect(merged.segments).toEqual([{ text: 'x', start: 119, end: 120 }]);
    expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_timing_clamped', kind: 'segment',
      end_seconds: 125, corrected_end_seconds: 120.1 });
    const shortAudio = () => mergeWords([{ result: { ...valid, words: [{ word: 'x', start: 118, end: 120 }] },
      offsetSeconds: 0, durationSeconds: 120 }], 120, 119, vi.fn());
    expect(shortAudio().words[0]).toMatchObject({ start: 118, end: 119 });
    expect(JSON.parse(warn.mock.calls.at(-1)![0])).toMatchObject({ event: 'stt_timing_clamped', kind: 'word',
      end_seconds: 120, corrected_end_seconds: 119 });
  });
  it.each([{}, { ...valid, words: [] }, { ...valid, words: [{ word: 'text' }] },
    { ...valid, words: [{ word: 'text', start: 0, end: null }] }, { ...valid, words: [{ word: 'text', start: NaN, end: 1 }] }])('ADR-003 rejects missing timestamps: %j', input => {
    expect(() => parseTranscript(input, 10)).toThrow(TranscriptError);
  });
  it('clamps negative, reversed, out-of-range and nonmonotonic words; rejects nonfinite times', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [start, end, fixedStart, fixedEnd] of [[-1, 1, 0, 1], [3, 2, 3, 3], [0, 11, 0, 10]]) {
      warn.mockClear();
      const parsed = parseTranscript({ ...valid, words: [{ word: 'x', start, end }] }, 10);
      expect(parsed.words).toEqual([{ word: 'x', start: fixedStart, end: fixedEnd }]);
      expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_timing_clamped',
        start_seconds: start, end_seconds: end, corrected_start_seconds: fixedStart, corrected_end_seconds: fixedEnd });
    }
    warn.mockClear();
    const parsed = parseTranscript({ ...valid, words: [valid.words[0], { word: 'x', start: 0, end: 1 }] }, 10);
    expect(parsed.words).toEqual([valid.words[0], { word: 'x', start: .2, end: 1 }]);
    expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_word_order_clamped', corrected_start_seconds: .2 });
    for (const time of [NaN, Infinity, -Infinity]) {
      expect(() => parseTranscript({ ...valid, words: [{ word: 'x', start: 0, end: time }] }, 10)).toThrow(TranscriptError);
      expect(() => parseTranscript({ ...valid, words: [{ word: 'x', start: time, end: 1 }] }, 10)).toThrow(TranscriptError);
    }
  });
  it('merge offsets second chunk and deduplicates overlap without sorting away a defect', () => {
    const first = { ...valid, words: [{ word: 'Привет', start: 179, end: 180 }] };
    const second = { ...valid, words: [{ word: 'Привет', start: 1, end: 2 }, { word: 'мир', start: 3, end: 4 }] };
    const merged = mergeWords([{ result: first, offsetSeconds: 0, durationSeconds: 180 }, { result: second, offsetSeconds: 178, durationSeconds: 10 }], 188);
    expect(merged.words.map(w => [w.word, w.start])).toEqual([['Привет', 179], ['мир', 181]]);
    expect(merged.segments[1]?.start).toBe(178.2);
  });
  it('cuts at a silence midpoint; otherwise explicitly marks hard cut; keeps 2s overlap', () => {
    const silence = chunkBoundaries(400, [175, 365]);
    expect(silence[0]).toMatchObject({ durationSeconds: 175, hardCut: false });
    expect(silence[1]?.offsetSeconds).toBe(173);
    expect(chunkBoundaries(400, [10])[0]?.hardCut).toBe(true);
    expect(chunkBoundaries(120, [])).toHaveLength(1);
  });
  it('requires explicit mode/key; fake never silently replaces live', () => {
    expect(() => loadSttConfig({})).toThrow('N5_MODEL_PROVIDER');
    expect(() => loadSttConfig({ N5_MODEL_PROVIDER: 'live' })).toThrow('OPENROUTER_API_KEY');
    expect(() => loadSttConfig({ N5_MODEL_PROVIDER: 'fake', NODE_ENV: 'production' })).toThrow();
    expect(loadSttConfig({ N5_MODEL_PROVIDER: 'fake', NODE_ENV: 'test' }).apiKey).toBeNull();
  });
  it('provider pin source guard and unique timestamp option', () => {
    const source = readFileSync('apps/worker/src/stt/client.ts', 'utf8');
    expect(source).toMatch(/provider:\s*\{\s*only:\s*\['Together'\],\s*allow_fallbacks:\s*false/);
    expect(source.match(/timestamp_granularities/g)).toHaveLength(1);
    expect(source).not.toContain('process.env');
  });
  async function clientFixture(request: typeof fetch) {
    const path = join(await temp(), 'chunk.mp3'); await writeFile(path, 'mp3');
    return { path, client: createTranscriber(loadSttConfig({ N5_MODEL_PROVIDER: 'live', OPENROUTER_API_KEY: 'unit-secret' }), request) };
  }
  it('sends measured JSON contract, pins Together and rejects 5xx/missing words/empty body', async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'openai/whisper-large-v3', input_audio: { data: 'bXAz', format: 'mp3' },
        provider: { only: ['Together'], allow_fallbacks: false }, timestamp_granularities: ['word', 'segment'] });
      return Response.json(valid);
    });
    const { path, client } = await clientFixture(request);
    expect(await client.transcribe(path, 10, new AbortController().signal)).toEqual(valid);
    request.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(client.transcribe(path, 10, new AbortController().signal)).rejects.toMatchObject({ retryable: true });
    request.mockResolvedValueOnce(Response.json({ text: 'Привет' }));
    await expect(client.transcribe(path, 10, new AbortController().signal)).rejects.toBeInstanceOf(TranscriptError);
    request.mockResolvedValueOnce(new Response(''));
    await expect(client.transcribe(path, 10, new AbortController().signal)).rejects.toThrow();
  });
  it('abort propagates to the HTTP request and reports timeout', async () => {
    const controller = new AbortController();
    const { path, client } = await clientFixture(async (_url, init) => {
      controller.abort(); init!.signal!.throwIfAborted(); throw new Error('unreachable');
    });
    await expect(client.transcribe(path, 10, controller.signal)).rejects.toMatchObject({ outcome: 'timeout' });
  });
  it('25 MB ceiling prevents any HTTP request', async () => {
    const request = vi.fn<typeof fetch>(); const { path, client } = await clientFixture(request);
    const handle = await import('node:fs/promises').then(fs => fs.open(path, 'w'));
    await handle.truncate(STT_MAX_BYTES + 1); await handle.close();
    await expect(client.transcribe(path, 10, new AbortController().signal)).rejects.toThrow('лимит');
    expect(request).not.toHaveBeenCalled();
  });
  it('spend ledger records attempt before outcome, includes timeouts without secrets', async () => {
    const path = join(await temp(), 'model-spend.jsonl');
    const event = { video_id: 'test', fence: 1, stage: 'stt' as const, chunk_index: 0, attempt: 1, unit: 'seconds' as const, quantity: 180 };
    await recordModelSpend(path, { ...event, phase: 'attempt', result: 'started' });
    await recordModelSpend(path, { ...event, phase: 'outcome', result: 'timeout' });
    const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(rows.map(r => r.result)).toEqual(['started', 'timeout']);
    expect(rows.filter(r => r.phase === 'attempt').reduce((n, r) => n + r.quantity, 0)).toBe(180);
  });
  it('real ffmpeg: hour input with pauses is streamed to mono MP3 chunks below ceiling', async () => {
    const dir = await temp(), signal = AbortSignal.timeout(110_000), source = join(dir, 'source.wav');
    await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-af', "volume=enable='lt(mod(t,180),2)':volume=0", '-t', '3600', source], signal);
    const audio = await extractAudio(source, join(dir, 'audio.mp3'), 3600, signal);
    expect(audio.pauses.length).toBeGreaterThan(10);
    let count = 0, previous = -1;
    for await (const chunk of splitAudio(audio, dir, 3600, signal)) {
      expect((await stat(chunk.path)).size).toBeLessThanOrEqual(STT_MAX_BYTES);
      expect(chunk.offsetSeconds).toBeGreaterThan(previous); previous = chunk.offsetSeconds; count++;
    }
    expect(count).toBeGreaterThan(1);
  }, 120_000);
});
