import { parseTranscript, TranscriptError, type TranscriptTimingIssue, type TranscriptResult, type TranscriptWord, type TranscriptSegment } from '@clipmaker/shared/transcript';
export class TranscriptMergeError extends Error {
  constructor(readonly timingIssue?: TranscriptTimingIssue) { super('Не удалось собрать транскрипт'); }
}
export function mergeWords(chunks: { result: TranscriptResult; offsetSeconds: number; durationSeconds: number }[], duration: number,
  audioDuration = duration, onClamp = (issue: TranscriptTimingIssue) => console.warn(JSON.stringify({ event: 'stt_timestamp_clamped', ...issue }))): TranscriptResult {
  try {
  const words: TranscriptWord[] = [], segments: TranscriptSegment[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const result = parseTranscript(chunk.result, chunk.durationSeconds);
    for (const word of result.words) {
      const shifted = { ...word, start: word.start + chunk.offsetSeconds, end: word.end + chunk.offsetSeconds, chunk_index: index };
      const duplicate = index > 0 && word.start <= 2 && words.slice(-30).some(prior =>
        prior.word.trim().toLocaleLowerCase() === shifted.word.trim().toLocaleLowerCase() && Math.abs(prior.start - shifted.start) <= 1);
      if (!duplicate) words.push(shifted);
    }
    segments.push(...result.segments.map(segment => ({ ...segment, start: segment.start + chunk.offsetSeconds, end: segment.end + chunk.offsetSeconds })));
  }
  // The MP3 is the measured recognition boundary. No tolerance at this boundary.
  const merged = parseTranscript({ language: chunks[0]?.result.language, words, segments }, audioDuration);
  const adjustments: TranscriptTimingIssue[] = [];
  function clamp<T extends TranscriptWord | TranscriptSegment>(row: T, kind: 'word' | 'segment', index: number): T {
    // Only an ending crossing into the measured MP3 tail can be shortened.
    if (row.end <= duration || row.start > duration) return row;
    adjustments.push({ kind, index, ...('chunk_index' in row ? { chunk_index: row.chunk_index } : {}),
      start_seconds: row.start, end_seconds: row.end, duration_seconds: duration, excess_seconds: row.end - duration });
    return { ...row, end: duration };
  }
  const validated = parseTranscript({ ...merged, words: merged.words.map((row, i) => clamp(row, 'word', i)),
    segments: merged.segments.map((row, i) => clamp(row, 'segment', i)) }, duration);
  adjustments.forEach(onClamp);
  return validated;
  } catch (error) {
    if (error instanceof TranscriptError) throw new TranscriptMergeError(error.timingIssue);
    throw error;
  }
}
