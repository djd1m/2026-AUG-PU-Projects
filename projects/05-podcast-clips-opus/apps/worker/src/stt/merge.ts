import { parseTranscript, type TranscriptResult, type TranscriptWord, type TranscriptSegment } from '@clipmaker/shared/transcript';
export function mergeWords(chunks: { result: TranscriptResult; offsetSeconds: number; durationSeconds: number }[], duration: number): TranscriptResult {
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
  return parseTranscript({ language: chunks[0]?.result.language, words, segments }, duration);
}
