// Ограничения видео-отзыва (FR-003 AC, Pseudocode §1.1 validateVideoConstraints).
// Чистые функции без побочных эффектов — вызываются ДО списания квоты (W-5).

export const MAX_DURATION_SEC = 120;
export const MAX_SIZE_BYTES = 100 * 1024 * 1024;
export const ALLOWED_MIME = ['video/webm', 'video/mp4'] as const;

export interface VideoMeta {
  duration_sec?: unknown;
  size_bytes?: unknown;
  mime?: unknown;
}

export function validateVideoConstraints(video: VideoMeta | null | undefined): string[] {
  const errors: string[] = [];
  if (video === null || video === undefined) {
    errors.push('video: обязателен для type=video');
    return errors;
  }

  // duration приходит от КЛИЕНТА и здесь непроверяем: длительность контейнера читается
  // только распаковкой (ffprobe живёт в services/transcribe, не в web). Значит это
  // предел удобства, а не защита. Настоящий предел — размер, он считается по факту.
  const duration = Number(video.duration_sec);
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push('video: не удалось определить длительность');
  } else if (duration > MAX_DURATION_SEC) {
    errors.push(`video: длиннее ${MAX_DURATION_SEC} секунд`);
  }

  const size = Number(video.size_bytes);
  if (!Number.isFinite(size) || size <= 0) {
    errors.push('video: пустой файл');
  } else if (size > MAX_SIZE_BYTES) {
    errors.push('video: больше 100 MB');
  }

  if (typeof video.mime !== 'string' || !ALLOWED_MIME.includes(video.mime as (typeof ALLOWED_MIME)[number])) {
    errors.push('video: недопустимый формат, разрешены webm, mp4');
  }

  return errors;
}

/**
 * Сигнатура контейнера по первым байтам. Заявленный Content-Type задаёт клиент, а значит
 * "video/mp4" на HTML-файле — обычный запрос, а не аномалия. Проверка не заменяет
 * allowlist по mime, она подтверждает, что содержимое ему соответствует.
 */
export function sniffContainer(bytes: Uint8Array): 'video/webm' | 'video/mp4' | null {
  // WebM/Matroska: EBML-заголовок 1A 45 DF A3.
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }
  // ISO BMFF (mp4): байты 4..7 — 'ftyp'.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'video/mp4';
  }
  return null;
}
