import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTranscript, type TranscriptResult } from '../packages/shared/src/transcript';
import { validateFragments } from '../packages/shared/src/fragments';
import { fakeFragment } from '../apps/worker/src/llm/fake';
import { selectionMessage } from '../apps/worker/src/llm/prompts/selection';

afterEach(() => vi.restoreAllMocks());

it.each(['word', 'segment'] as const)('LV-3 clamps the measured 0.0000205 second excess for a %s and journals it', kind => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const duration = 194.5216670, end = 194.5216875;
  expect(end - duration).toBeCloseTo(0.0000205, 12);
  const transcript = { language: 'ru', words: [{ word: 'конец', start: 194, end: kind === 'word' ? end : duration }],
    segments: [{ text: 'конец', start: 194, end: kind === 'segment' ? end : duration }] };
  const parsed = parseTranscript(transcript, duration);
  expect(parsed.words).toEqual([{ word: 'конец', start: 194, end: duration }]);
  expect(parsed.segments).toEqual([{ text: 'конец', start: 194, end: duration }]);
  expect(warn).toHaveBeenCalledTimes(1);
  const event = JSON.parse(warn.mock.calls[0]![0]);
  expect(event).toMatchObject({ event: 'stt_timing_clamped', kind, index: 0, start_seconds: 194,
    end_seconds: end, corrected_start_seconds: 194, corrected_end_seconds: duration, duration_seconds: duration });
  expect(event.excess_seconds).toBeCloseTo(0.0000205, 12);
});

it.each([{ end_seconds: 300 }, { score: 99 }, { explain_hook: ' ' }])(
  'LV-4 keeps seven of eight candidates when one is invalid: %j', patch => {
    const transcript = { language: 'ru', segments: [],
      words: Array.from({ length: 300 }, (_, i) => ({ word: 'слово', start: i, end: i + .8 })) };
    const fragments = Array.from({ length: 8 }, (_, i) => fakeFragment(i));
    fragments[3] = { ...fragments[3]!, ...patch };
    const result = validateFragments({ fragments }, transcript, 300);
    expect(result).toHaveLength(7);
    // Assert identities and snapping, not merely the number of survivors.
    expect(result).toEqual([0, 1, 2, 4, 5, 6, 7].map(i => ({ ...fakeFragment(i), end_seconds: i * 30 + 24.8 })));
  });

// Reconstructed Russian text, not the owner's recording. Counts/duration are measured live values.
function longTranscript(): TranscriptResult {
  const count = 12_916, segmentCount = 601, duration = 5305.9;
  const vocabulary = ['Это', 'наш', 'опыт', 'как', 'найти', 'свой', 'путь', 'вперёд'];
  const words = Array.from({ length: count }, (_, i) => ({ word: vocabulary[i % vocabulary.length]!,
    start: i * duration / count, end: (i + .9) * duration / count, chunk_index: Math.floor(i * 30 / count) }));
  const segments = Array.from({ length: segmentCount }, (_, i) => {
    const from = Math.floor(i * count / segmentCount), to = Math.floor((i + 1) * count / segmentCount);
    return { text: words.slice(from, to).map(w => w.word).join(' '), start: words[from]!.start, end: words[to - 1]!.end };
  });
  return { language: 'ru', words, segments };
}

it('LV-5 source guard forbids serializing transcript.words or the entire transcript', () => {
  const source = readFileSync('apps/worker/src/llm/prompts/selection.ts', 'utf8');
  const messageSource = source.slice(source.indexOf('export const selectionMessage'));
  expect(messageSource).toMatch(/language:\s*transcript\.language/);
  expect(messageSource).toMatch(/segments:\s*transcript\.segments/);
  expect(messageSource).not.toMatch(/\bwords\b|\.\.\.\s*transcript|\btranscript\s*[,}]/);
});

it('LV-5 message preserves language and all segments, omits words and stays below 200000 UTF-8 bytes', () => {
  const transcript = longTranscript();
  expect(transcript.words).toHaveLength(12_916); expect(transcript.segments).toHaveLength(601);
  const message = selectionMessage(transcript, 5305.9), bytes = Buffer.byteLength(message, 'utf8');
  expect(JSON.parse(message)).toEqual({ duration_seconds: 5305.9,
    transcript: { language: 'ru', segments: transcript.segments } });
  expect(message).not.toContain('"words"');
  expect(bytes).toBeLessThan(200_000);
  // Prove this fixture distinguishes the old representation even without the shape guard.
  expect(Buffer.byteLength(JSON.stringify({ duration_seconds: 5305.9, transcript }), 'utf8')).toBeGreaterThan(200_000);
  console.info(`LV-5 measured synthetic message: ${bytes} UTF-8 bytes; limit: 200000`);
});
