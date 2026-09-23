import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscript, TranscriptError } from '../packages/shared/src/transcript';
import { createTranscriber } from '../apps/worker/src/stt/client';
import { loadSttConfig } from '../packages/shared/src/config';
import { failureMessages } from '../apps/web/src/lib/screen-contract';

// Provider-shaped reconstruction; only the 51.22 -> 50.96 pair comes from the live incident.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/transcription/word-order-response.json', import.meta.url), 'utf8'));
const input = () => structuredClone(fixture);
const logs = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

it('TR-010 jitter accepts the live 0.26 second reversal in a full provider response', async () => {
  const warn = logs(), dir = await mkdtemp(join(tmpdir(), 'tr010-'));
  try {
    const path = join(dir, 'chunk.mp3'); await writeFile(path, 'mp3');
    const client = createTranscriber(loadSttConfig({ N5_MODEL_PROVIDER: 'live', OPENROUTER_API_KEY: 'test' }),
    vi.fn<typeof fetch>(async () => Response.json(input())));
    const parsed = await client.transcribe(path, 110, new AbortController().signal);
    expect(parsed.words).toHaveLength(200);
    expect(parsed.words[98]).toEqual({ word: fixture.words[98].word, start: 51.22, end: 51.22 });
    expect(parsed.words.map(w => w.word)).toEqual(fixture.words.map((w: { word: string }) => w.word));
    expect(parseTranscript(parsed, 110)).toEqual(parsed);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(fixture.words[98].start).toBe(50.96);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('TR-010 journal records the correction, original times and count without speech text', () => {
  const warn = logs(); parseTranscript(input(), 110);
  expect(warn).toHaveBeenCalledTimes(1);
  const event = JSON.parse(warn.mock.calls[0]![0]);
  expect(event).toMatchObject({ event: 'stt_word_order_clamped', reason: 'order', kind: 'word', index: 98,
    start_seconds: 50.96, end_seconds: 51.1, previous_start_seconds: 51.22,
    corrected_start_seconds: 51.22, corrected_end_seconds: 51.22, corrected_words: 1, total_words: 200 });
  expect(event).not.toHaveProperty('word');
});

it.each([0.5, 2, 20])('TR-010 disorder rejects a reversal of %s seconds with original diagnostics', rollback => {
  logs(); const value = input();
  value.words[98] = { word: 'сбой', start: 51.22 - rollback, end: 51.3, chunk_index: 3 };
  expect(() => parseTranscript(value, 110)).toThrowError(expect.objectContaining({
    timingIssue: expect.objectContaining({ reason: 'order', index: 98, chunk_index: 3,
      start_seconds: 51.22 - rollback, previous_start_seconds: 51.22 }) }));
});

it('TR-010 decimal boundary rejects 0.7 to 0.2 but accepts a smaller rollback', () => {
  logs(); const value = input();
  value.words[0] = { word: 'первое', start: 0.7, end: 0.9 };
  value.words[1] = { word: 'второе', start: 0.2, end: 0.8 };
  expect(() => parseTranscript(value, 110)).toThrow('Таймкоды слов не по порядку');
  value.words[1].start = 0.200001;
  expect(parseTranscript(value, 110).words[1]).toEqual({ word: 'второе', start: 0.7, end: 0.8 });
});

it('TR-010 ratio permits exactly one percent and rejects above it, counting cascading clamps', () => {
  logs(); const value = input();
  value.words[99] = { word: 'второе', start: 51.1, end: 51.4 };
  expect(parseTranscript(value, 110).words[99]?.start).toBe(51.22);
  value.words[100] = { word: 'третье', start: 51.15, end: 51.5 };
  expect(() => parseTranscript(value, 110)).toThrowError(expect.objectContaining({
    timingIssue: expect.objectContaining({ reason: 'order', corrected_words: 3, total_words: 200 }) }));
  const short = { language: 'ru', segments: [], words: [{ word: 'a', start: 1, end: 1.2 }, { word: 'b', start: .9, end: 1.1 }] };
  expect(() => parseTranscript(short, 2)).toThrow(TranscriptError);
});

it('TR-010 messages name missing, bounds and order causes and keep UI wording truthful', () => {
  logs(); expect(() => parseTranscript({ ...input(), words: [] }, 110)).toThrow('Нет пригодных таймкодов слов');
  expect(() => parseTranscript({ ...input(), words: [{ word: 'a' }] }, 110)).toThrow('Нет пригодных таймкодов слов');
  expect(() => parseTranscript({ ...input(), words: [{ word: 'a', start: 109, end: 111 }] }, 110)).toThrow('Таймкоды вне границ записи');
  const value = input(); value.words[98].start = 49;
  expect(() => parseTranscript(value, 110)).toThrow('Таймкоды слов не по порядку');
  expect(failureMessages.no_timestamps).toBe('Не удалось получить пригодные таймкоды слов.');
});

it('TR-010 strict bounds remain enforced before normalization; ordered words do not log', () => {
  const warn = logs(); const value = input(); value.words[98] = { word: 'слово', start: 51.22, end: 51.4 };
  expect(parseTranscript(value, 110).words).toEqual(value.words); expect(warn).not.toHaveBeenCalled();
  for (const word of [{ start: -0.1, end: 0 }, { start: 50.96, end: 50 }, { start: 50.96, end: 111 }]) {
    const bad = input(); bad.words[98] = { word: 'слово', ...word };
    expect(() => parseTranscript(bad, 110)).toThrow(TranscriptError);
  }
});
