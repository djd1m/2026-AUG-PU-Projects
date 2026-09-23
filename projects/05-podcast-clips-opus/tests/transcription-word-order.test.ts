import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscript, type TranscriptResult } from '../packages/shared/src/transcript';
import { createTranscriber } from '../apps/worker/src/stt/client';
import { loadSttConfig } from '../packages/shared/src/config';
import { failureMessages } from '../apps/web/src/lib/screen-contract';

// Provider-shaped reconstruction; only the 51.22 -> 50.96 pair comes from the live incident.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/transcription/word-order-response.json', import.meta.url), 'utf8'));
const input = () => structuredClone(fixture);
const logs = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
function assertNormalized(parsed: TranscriptResult, duration = 110) {
  parsed.words.forEach((word, i) => {
    expect(word.start).toBeGreaterThanOrEqual(i ? parsed.words[i - 1]!.start : 0);
    expect(word.end).toBeGreaterThanOrEqual(word.start);
    expect(word.end).toBeLessThanOrEqual(duration);
  });
}
afterEach(() => vi.restoreAllMocks());

it('LV-1 TR-010 jitter accepts the live 0.26 second reversal in a full provider response', async () => {
  const warn = logs(), dir = await mkdtemp(join(tmpdir(), 'tr010-'));
  try {
    const path = join(dir, 'chunk.mp3'); await writeFile(path, 'mp3');
    const client = createTranscriber(loadSttConfig({ N5_MODEL_PROVIDER: 'live', OPENROUTER_API_KEY: 'test' }),
    vi.fn<typeof fetch>(async () => Response.json(input())));
    const parsed = await client.transcribe(path, 110, new AbortController().signal);
    expect(parsed.words).toHaveLength(200);
    assertNormalized(parsed);
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

it.each([0.5, 2, 20])('TR-010 clamps a reversal of %s seconds with original diagnostics', rollback => {
  const warn = logs(); const value = input();
  value.words[98] = { word: 'сбой', start: 51.22 - rollback, end: 51.3, chunk_index: 3 };
  const parsed = parseTranscript(value, 110);
  expect(parsed.words[98]).toEqual({ word: 'сбой', start: 51.22, end: 51.3, chunk_index: 3 });
  assertNormalized(parsed);
  expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_word_order_clamped',
    reason: 'order', index: 98, chunk_index: 3, start_seconds: 51.22 - rollback,
    previous_start_seconds: 51.22, corrected_start_seconds: 51.22, corrected_end_seconds: 51.3 });
});

// Порядок слов НИКОГДА не валит разбор: решение владельца 23.09.2026 — «не нужна супер точность
// на данном этапе, нам нужно, чтобы раскадровка не ломалась в процессе». Три подряд подобранных
// порога (строгая монотонность, 0,5 с, 10 %) отвергли настоящую запись трижды.
it('TR-010 порядок слов не валит разбор ни при каком откате — поджимается любой', () => {
  logs(); const value = input();
  value.words[0] = { word: 'первое', start: 0.7, end: 0.9 };
  value.words[1] = { word: 'второе', start: 0.2, end: 0.8 };
  expect(parseTranscript(value, 110).words[1]).toEqual({ word: 'второе', start: 0.7, end: 0.8 });
  // откат на ДЕСЯТКИ секунд — подпись дефекта склейки — тоже не отказ, а поджатие
  value.words[1] = { word: 'второе', start: 0.2, end: 0.8 };
  value.words[2] = { word: 'третье', start: 0.1, end: 0.3 };
  const parsed = parseTranscript(value, 110);
  expect(parsed.words[2]!.start).toBe(0.7);
  expect(parsed.words[2]!.end).toBeGreaterThanOrEqual(parsed.words[2]!.start);
});

// Частота не ограничивается: отдельно проверены живые 5/409 и массовые откаты.
it('TR-010 массовое дрожание не валит разбор, но каждое поджатие видно в журнале', () => {
  const warn = logs();
  const many = { language: 'ru', segments: [] as unknown[],
    words: Array.from({ length: 409 }, (_, i) => ({ word: `w${i}`, start: 10 + i * 0.25, end: 10 + i * 0.25 + 0.2 })) };
  // половина слов уезжает назад — заведомо больше любого прежнего порога
  for (let i = 2; i < 409; i += 2) many.words[i]!.start = many.words[i - 1]!.start - 0.3;
  const parsed = parseTranscript(many, 200);
  expect(parsed.words).toHaveLength(409);
  // начала неубывающие после разбора — это и есть то свойство, ради которого всё делалось
  for (let i = 1; i < parsed.words.length; i++) {
    expect(parsed.words[i]!.start).toBeGreaterThanOrEqual(parsed.words[i - 1]!.start);
    expect(parsed.words[i]!.end).toBeGreaterThanOrEqual(parsed.words[i]!.start);
  }
  // молчаливой починки нет: каждое поджатие названо в журнале
  const clamps = warn.mock.calls.filter(([line]) => String(line).includes('stt_word_order_clamped'));
  expect(clamps.length).toBeGreaterThan(200);
});

// Короткий ответ тоже не отказ: доли больше нет вовсе.
it('TR-010 короткий ответ с откатом разбирается, а не отвергается', () => {
  logs();
  const short = { language: 'ru', segments: [], words: [{ word: 'a', start: 1, end: 1.2 }, { word: 'b', start: .9, end: 1.1 }] };
  expect(parseTranscript(short, 2).words[1]).toEqual({ word: 'b', start: 1, end: 1.1 });
});

it('TR-010 missing and wholly outside timestamps still fail with truthful UI wording', () => {
  expect(() => parseTranscript({ ...input(), words: [] }, 110)).toThrow('Нет пригодных таймкодов слов');
  expect(() => parseTranscript({ ...input(), words: [{ word: 'a' }] }, 110)).toThrow('Нет пригодных таймкодов слов');
  expect(() => parseTranscript({ ...input(), words: [{ word: 'a', start: 111, end: 112 }] }, 110)).toThrow('Таймкоды вне границ записи');
  expect(failureMessages.no_timestamps).toBe('Не удалось получить пригодные таймкоды слов.');
});

it('TR-010 ordered valid words do not log; negative, reversed and excessive bounds are clamped', () => {
  const warn = logs(); const value = input(); value.words[98] = { word: 'слово', start: 51.22, end: 51.4 };
  expect(parseTranscript(value, 110).words).toEqual(value.words); expect(warn).not.toHaveBeenCalled();
  for (const [start, end, fixedStart, fixedEnd] of [[-0.1, 0, 0, 0], [50.96, 50, 50.96, 50.96], [50.96, 111, 50.96, 110]]) {
    warn.mockClear();
    const parsed = parseTranscript({ language: 'ru', segments: [], words: [{ word: 'слово', start, end }] }, 110);
    expect(parsed.words[0]).toEqual({ word: 'слово', start: fixedStart, end: fixedEnd });
    assertNormalized(parsed);
    expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event: 'stt_timing_clamped',
      kind: 'word', index: 0, start_seconds: start, end_seconds: end,
      corrected_start_seconds: fixedStart, corrected_end_seconds: fixedEnd });
  }
});

it('LV-2 accepts exactly 5 corrections among 409 words and logs every correction', () => {
  const warn = logs();
  const words = Array.from({ length: 409 }, (_, i) => ({ word: `слово${i}`, start: i * .25, end: i * .25 + .2 }));
  const indices = [98, 150, 200, 250, 300];
  for (const i of indices) words[i]!.start = words[i - 1]!.start - .26;
  const parsed = parseTranscript({ language: 'ru', segments: [], words }, 110);
  expect(parsed.words).toHaveLength(409);
  expect(parsed.words.map(w => w.word)).toEqual(words.map(w => w.word));
  assertNormalized(parsed);
  expect(warn).toHaveBeenCalledTimes(5);
  indices.forEach((index, i) => {
    expect(parsed.words[index]!.start).toBe(words[index - 1]!.start);
    expect(JSON.parse(warn.mock.calls[i]![0])).toMatchObject({ event: 'stt_word_order_clamped', index,
      start_seconds: words[index]!.start, corrected_start_seconds: words[index - 1]!.start,
      corrected_words: i + 1, total_words: 409 });
  });
});
