export interface TranscriptWord { word: string; start: number; end: number; chunk_index?: number }
export interface TranscriptSegment { text: string; start: number; end: number; speaker?: string }
export interface TranscriptResult { language: string; words: TranscriptWord[]; segments: TranscriptSegment[] }
export const STT_MAX_BYTES = 25_000_000;
export const STT_CHUNK_SECONDS = 180;
export const STT_OVERLAP_SECONDS = 2;
// Порогов отказа по ПОРЯДКУ слов больше нет — ни по величине отката, ни по их доле.
// Оба были подобраны без данных и оба отвергали настоящую запись; см. комментарий у места
// поджатия ниже и решение владельца в docs/decisions-owner.md.
export const STT_MAX_ATTEMPTS = 3;
export const STT_TIMEOUT_MS = 120_000;
export const STT_JOB_TIMEOUT_MS = 30 * 60_000;
export interface TranscriptTimingIssue {
  reason?: 'bounds' | 'order'; previous_start_seconds?: number;
  corrected_words?: number; total_words?: number;
  kind: 'word' | 'segment'; index: number; chunk_index?: number;
  start_seconds: number | null; end_seconds: number | null; duration_seconds: number; excess_seconds: number | null;
}
export class TranscriptError extends Error {
  constructor(readonly timingIssue?: TranscriptTimingIssue) {
    super(timingIssue?.reason === 'order' ? 'Таймкоды слов не по порядку' :
      timingIssue?.reason === 'bounds' ? 'Таймкоды вне границ записи' : 'Нет пригодных таймкодов слов');
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TranscriptError();
  return value as Record<string, unknown>;
}
// ГРАНИЦЫ ТОЖЕ ПОДЖИМАЮТСЯ, А НЕ ОТВЕРГАЮТСЯ (23.09.2026, та же линия, что и с порядком слов).
// Живой случай: сегмент кончался на 194,5216875 с при длительности куска 194,5216670 с — превышение
// ДВАДЦАТЬ МИКРОСЕКУНД, и вся расшифровка отвергалась. Причина обыденная: поставщик округляет конец
// последнего сегмента к длине звука, а извлечённый MP3 из-за выравнивания кадров кодировщиком чуть
// длиннее исходного контейнера (та же семья, что грабля TR-001).
//
// Отвергается теперь только бессмыслица: не число, и начало ЦЕЛИКОМ за пределами записи. Всё
// остальное подрезается по месту и записывается в журнал — молчаливой починки нет.
function timing(row: Record<string, unknown>, duration: number, kind: 'word' | 'segment', index: number): { start: number; end: number } {
  const { start, end } = row;
  if (start == null || end == null) throw new TranscriptError();
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
    throw new TranscriptError({ reason: 'bounds', kind, index,
      ...(Number.isInteger(row.chunk_index) ? { chunk_index: Number(row.chunk_index) } : {}),
      start_seconds: null, end_seconds: null, duration_seconds: duration, excess_seconds: null });
  }
  // Начало за пределами записи — это не погрешность, а несогласованный ответ: подрезать нечего.
  if (start > duration) {
    throw new TranscriptError({ reason: 'bounds', kind, index,
      ...(Number.isInteger(row.chunk_index) ? { chunk_index: Number(row.chunk_index) } : {}),
      start_seconds: start, end_seconds: end, duration_seconds: duration, excess_seconds: start - duration });
  }
  const fixedStart = Math.min(Math.max(start, 0), duration);
  const fixedEnd = Math.min(Math.max(end, fixedStart), duration);
  if (fixedStart !== start || fixedEnd !== end) {
    console.warn(JSON.stringify({ event: 'stt_timing_clamped', kind, index,
      ...(Number.isInteger(row.chunk_index) ? { chunk_index: Number(row.chunk_index) } : {}),
      start_seconds: start, end_seconds: end, corrected_start_seconds: fixedStart,
      corrected_end_seconds: fixedEnd, duration_seconds: duration,
      excess_seconds: Math.max(0, end - duration) }));
  }
  return { start: fixedStart, end: fixedEnd };
}
// Validate at both the provider boundary and the persistence boundary (ADR-003).
export function parseTranscript(value: unknown, duration: number): TranscriptResult {
  if (!Number.isFinite(duration) || duration <= 0) throw new TranscriptError();
  const row = record(value);
  if (!Array.isArray(row.words) || row.words.length === 0) throw new TranscriptError();
  let previous = -1, correctedWords = 0;
  const totalWords = row.words.length;
  const words = row.words.map((value, index) => {
    const word = record(value), time = timing(word, duration, 'word', index);
    if (typeof word.word !== 'string' || !word.word.trim()) throw new TranscriptError();
    // ПОРЯДОК СЛОВ НЕ ЯВЛЯЕТСЯ ПОВОДОМ ДЛЯ ОТКАЗА (решение владельца 23.09.2026).
    // Предыстория: сначала требовалась строгая монотонность, потом допуск 0,5 с, потом доля 10 %.
    // Каждый порог отвергал НАСТОЯЩУЮ запись, потому что подбирался без данных; живой файл на
    // 88 минут падал трижды подряд. Владелец: «не нужна супер точность на данном этапе, нам нужно,
    // чтобы раскадровка не ломалась в процессе».
    //
    // Поэтому любой откат назад ПОДЖИМАЕТСЯ, и конвейер не останавливается никогда.
    // Отказ остаётся только там, где данные непригодны по существу: таймкодов нет вовсе либо они
    // вне границ записи — это проверяет timing() выше и оно НЕ ослаблено.
    //
    // Цена решения названа, а не замолчана: дефект СКЛЕЙКИ кусков (TR-003), который прежде ловился
    // здесь, теперь даст не отказ, а клип со сдвинутой границей. Это хуже видно и лучше переживается.
    // Счётчик поджатий остаётся в журнале: если их вдруг станут тысячи, это будет видно в
    // stt_word_order_clamped, а не тихо.
    if (time.start < previous) {
      const issue: TranscriptTimingIssue = { reason: 'order', kind: 'word', index,
        ...(Number.isInteger(word.chunk_index) ? { chunk_index: Number(word.chunk_index) } : {}),
        start_seconds: time.start, end_seconds: time.end, previous_start_seconds: previous,
        duration_seconds: duration, excess_seconds: null };
      time.start = previous;
      time.end = Math.max(time.end, time.start);
      correctedWords++;
      console.warn(JSON.stringify({ event: 'stt_word_order_clamped', ...issue,
        corrected_start_seconds: time.start, corrected_end_seconds: time.end,
        corrected_words: correctedWords, total_words: totalWords }));
    }
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
