import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkBoundaries } from '../apps/worker/src/stt/chunker';
import { mergeWords } from '../apps/worker/src/stt/merge';
import { parseTranscript, type TranscriptResult } from '../packages/shared/src/transcript';

afterEach(() => vi.restoreAllMocks());
const duration = 237.433;
function pauseFixture() {
  // The pause moves the first cut from 180 to 175, so chunk 2 starts at 173.
  const boundaries = chunkBoundaries(duration, [175]);
  const results: TranscriptResult[] = [
    { language: 'ru', words: [{ word: 'замок', start: 173.4, end: 174 }], segments: [] },
    { language: 'ru', words: [
      { word: 'замка', start: 0.3, end: 0.9 },
      { word: 'другой', start: 0.8, end: 1.2 },
      { word: 'на', start: 1, end: 1.2 },
      { word: 'стыке', start: 1.3, end: 1.7 },
      { word: 'дальше', start: 2.2, end: 2.6 },
    ], segments: [] },
  ];
  expect(boundaries).toHaveLength(2);
  expect(boundaries[0]).toMatchObject({ durationSeconds: 175, hardCut: false });
  expect(boundaries[1]?.offsetSeconds).toBe(173);
  return boundaries.map((chunk, index) => ({ ...chunk, result: results[index]! }));
}

describe('TR-003 overlap merge with pauses', () => {
  it('different overlap text merges monotonically by time', () => {
    const merged = mergeWords(pauseFixture(), duration);
    expect(merged.words.map(w => w.word)).toEqual(['замок', 'на', 'стыке', 'дальше']);
    for (let i = 1; i < merged.words.length; i++) {
      expect(merged.words[i]!.start).toBeGreaterThanOrEqual(merged.words[i - 1]!.end);
    }
    expect(parseTranscript(merged, duration)).toEqual(merged);
  });
  it('preserves uncovered seam words including exact equality inside overlap', () => {
    const chunks = pauseFixture();
    // Equal text isolates this guard from the historical text mismatch failure.
    chunks[1]!.result.words = chunks[1]!.result.words.filter(w => w.word !== 'другой');
    chunks[1]!.result.words[0]!.word = 'замок';
    const words = mergeWords(chunks, duration).words;
    expect(words.map(w => [w.word, w.start, w.end, w.chunk_index])).toEqual([
      ['замок', 173.4, 174, 0], ['на', 174, 174.2, 1],
      ['стыке', 174.3, 174.7, 1], ['дальше', 175.2, 175.6, 1],
    ]);
  });
  it.each([
    { reason: 'order', words: [{ word: 'a', start: 3, end: 4 }, { word: 'b', start: 2, end: 3 }],
      index: 1, start: 3, end: 3, event: 'stt_word_order_clamped' },
    { reason: 'bounds', words: [{ word: 'a', start: 9, end: 11 }],
      index: 0, start: 9, end: 10, event: 'stt_timing_clamped' },
  ])('merge clamps $reason and journals original and corrected numbers', ({ words, index, start, end, event }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = mergeWords([{ offsetSeconds: 0, durationSeconds: 10, result: { language: 'ru', words, segments: [] } }], 10);
    expect(merged.words[index]).toMatchObject({ start, end, chunk_index: 0 });
    merged.words.forEach((w, i) => {
      expect(w.start).toBeGreaterThanOrEqual(i ? merged.words[i - 1]!.start : 0);
      expect(w.end).toBeGreaterThanOrEqual(w.start); expect(w.end).toBeLessThanOrEqual(10);
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0]![0])).toMatchObject({ event, kind: 'word', index,
      start_seconds: words[index]!.start, end_seconds: words[index]!.end,
      corrected_start_seconds: start, corrected_end_seconds: end, duration_seconds: 10 });
  });
  it('merge failure still names bounds when a word starts wholly outside', () => {
    expect(() => mergeWords([{ offsetSeconds: 0, durationSeconds: 10,
      result: { language: 'ru', words: [{ word: 'a', start: 11, end: 12 }], segments: [] } }], 10))
      .toThrowError(expect.objectContaining({ name: 'Error', timingIssue: { reason: 'bounds', kind: 'word',
        index: 0, start_seconds: 11, end_seconds: 12, duration_seconds: 10, excess_seconds: 1 } }));
  });
});
