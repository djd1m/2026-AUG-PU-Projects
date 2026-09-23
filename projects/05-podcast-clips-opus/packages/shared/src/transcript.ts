export interface TranscriptWord { word: string; start: number; end: number; chunk_index?: number }
export interface TranscriptSegment { text: string; start: number; end: number; speaker?: string }
export interface TranscriptResult { language: string; words: TranscriptWord[]; segments: TranscriptSegment[] }
export const STT_MAX_BYTES = 25_000_000;
export const STT_CHUNK_SECONDS = 180;
export const STT_OVERLAP_SECONDS = 2;
export const STT_MAX_ATTEMPTS = 3;
export const STT_TIMEOUT_MS = 120_000;
export const STT_JOB_TIMEOUT_MS = 30 * 60_000;
export interface TranscriptTimingIssue {
  kind: 'word' | 'segment'; index: number; chunk_index?: number;
  start_seconds: number | null; end_seconds: number | null; duration_seconds: number; excess_seconds: number | null;
}
export class TranscriptError extends Error {
  constructor(readonly timingIssue?: TranscriptTimingIssue) { super('Нет пригодных таймкодов слов'); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TranscriptError();
  return value as Record<string, unknown>;
}
function timing(row: Record<string, unknown>, duration: number, kind: 'word' | 'segment', index: number): { start: number; end: number } {
  const { start, end } = row;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) ||
    start < 0 || end < start || end > duration) throw new TranscriptError({ kind, index,
      ...(Number.isInteger(row.chunk_index) ? { chunk_index: Number(row.chunk_index) } : {}),
      start_seconds: typeof start === 'number' && Number.isFinite(start) ? start : null,
      end_seconds: typeof end === 'number' && Number.isFinite(end) ? end : null,
      duration_seconds: duration, excess_seconds: typeof end === 'number' && Number.isFinite(end) ? Math.max(0, end - duration) : null });
  return { start, end };
}
// Validate at both the provider boundary and the persistence boundary (ADR-003).
export function parseTranscript(value: unknown, duration: number): TranscriptResult {
  if (!Number.isFinite(duration) || duration <= 0) throw new TranscriptError();
  const row = record(value);
  if (!Array.isArray(row.words) || row.words.length === 0) throw new TranscriptError();
  let previous = -1;
  const words = row.words.map((value, index) => {
    const word = record(value), time = timing(word, duration, 'word', index);
    if (typeof word.word !== 'string' || !word.word.trim() || time.start < previous) throw new TranscriptError();
    previous = time.start;
    return { word: word.word, ...time, ...(Number.isInteger(word.chunk_index) ? { chunk_index: Number(word.chunk_index) } : {}) };
  });
  if (!Array.isArray(row.segments) || typeof row.language !== 'string' || !row.language.trim()) throw new TranscriptError();
  const segments = row.segments.map((value, index) => {
    const segment = record(value), time = timing(segment, duration, 'segment', index);
    if (typeof segment.text !== 'string' || (segment.speaker !== undefined && typeof segment.speaker !== 'string')) throw new TranscriptError();
    return { text: segment.text, ...time, ...(typeof segment.speaker === 'string' ? { speaker: segment.speaker } : {}) };
  });
  return { language: row.language, words, segments };
}
