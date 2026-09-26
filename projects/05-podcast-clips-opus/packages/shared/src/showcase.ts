// Витрина лендинга (фича 28, ADR-018). ЗАКРЫТЫЙ набор в коде, не переменная окружения и не флаг в БД
// (honest-configuration CFG-I8: список разрешений — код, проходит ревью и тесты).
// Каждая запись — клип, который владелец продукта разрешил показывать ЛЮБОМУ посетителю лендинга:
//   - публичная раздача файла и превью — ТОЛЬКО для кодов отсюда (/api/showcase/{code}/file|thumbnail);
//   - ретенция бесплатного тарифа НЕ стирает эти клипы (retention.ts), а /c/{code} не объявляет их истёкшими.
// Числа подписи взяты из базы стенда 26.09.2026, не придуманы: запись ec8b9021-729d-41bb-b830-bc188b67b86f,
// video.duration_seconds = 5305.9 (≈ 88 мин), 7 клипов в статусе done.
export interface ShowcaseClip {
  /** Короткий код /c/{code} — у ссылки владельца на этот клип (clip_link.code). */
  readonly code: string;
  /** clip.id — по нему маршрут витрины ищет клип; код и id обязаны указывать на один клип (проверяет SQL). */
  readonly clipId: string;
  readonly sourceMinutes: number;
  readonly clipCount: number;
}
export const SHOWCASE_CLIPS: readonly ShowcaseClip[] = Object.freeze([
  Object.freeze({ code: 'CTDUUG', clipId: '46f99d89-33f5-494d-a682-2fa364c14152', sourceMinutes: 88, clipCount: 7 }),
]);
export const SHOWCASE_CLIP_IDS: readonly string[] = Object.freeze(SHOWCASE_CLIPS.map(clip => clip.clipId));

/** Точное членство в наборе (регистр важен). Формат кода НЕ проверяется: код того же формата вне набора — отказ. */
export function findShowcase(code: unknown): ShowcaseClip | null {
  if (typeof code !== 'string') return null;
  return SHOWCASE_CLIPS.find(clip => clip.code === code) ?? null;
}
export function isShowcaseClip(clipId: unknown): boolean {
  return typeof clipId === 'string' && SHOWCASE_CLIP_IDS.includes(clipId);
}
/** «88 мин разговора → 7 клипов» — подпись под демо; числа из записи, а не из текста. */
export function showcaseCaption(clip: ShowcaseClip): string {
  const n = clip.clipCount, tail = n % 100, last = n % 10;
  const word = tail >= 11 && tail <= 14 ? 'клипов' : last === 1 ? 'клип' : last >= 2 && last <= 4 ? 'клипа' : 'клипов';
  return `${clip.sourceMinutes} мин разговора → ${n} ${word}`;
}
