// FR-002 — фото к текстовому отзыву (AC: «Поля: имя, роль/компания (опц.), текст, фото (опц.)»).
//
// ЭТО САМЫЙ ОПАСНЫЙ ПОЛЬЗОВАТЕЛЬСКИЙ ВВОД В ПРОЕКТЕ, и вот почему: всё остальное, что
// присылает клиент, мы отдаём как ТЕКСТ и обезвреживаем экранированием при рендере.
// Фото отдаётся браузеру как КОНТЕНТ, с заголовком типа — а значит экранирование тут
// не работает в принципе, защищать нужно на приёме и на отдаче.
//
// Отсюда три решения, каждое из которых снимает конкретный вектор:
//
//   1. SVG ЗАПРЕЩЁН. Это формально изображение, но по сути XML-документ, который умеет
//      <script> и onload. Открытый на нашем домене, он выполнил бы код в контексте
//      Proofwall — то есть увёл бы сессию владельца. Никакая «очистка» SVG не считается
//      надёжной; отрасль на этом обжигалась многократно. Разрешены только растровые.
//   2. Тип берётся из СОДЕРЖИМОГО, а не из заголовка. Content-Type задаёт клиент,
//      поэтому «image/png» на HTML-файле — обычный запрос, а не аномалия.
//   3. Отдача идёт с типом, определённым НАМИ, и с X-Content-Type-Options: nosniff —
//      иначе браузер попробует угадать тип сам и может решить, что это HTML.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // фото — не видео, 5 МБ с запасом
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];

/**
 * Определяет формат по сигнатуре файла. Возвращает null для всего, что не является
 * разрешённым растровым изображением — включая SVG, HTML и GIF.
 */
export function sniffImage(bytes: Uint8Array): PhotoMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // Всё остальное — не изображение из разрешённых. SVG сюда не попадёт никогда:
  // у него нет бинарной сигнатуры, он начинается с текста.
  return null;
}

export type PhotoVerdict =
  | { ok: true; mime: PhotoMime }
  | { ok: false; error: string };

/**
 * Полная проверка фото. Заявленный тип обязан совпасть с содержимым: расхождение —
 * это не «пользователь ошибся расширением», а попытка провести файл под чужим типом.
 */
export function validatePhoto(bytes: Uint8Array, declaredMime: string): PhotoVerdict {
  if (bytes.byteLength === 0) return { ok: false, error: 'photo: пустой файл' };
  if (bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: 'photo: больше 5 MB' };

  const declared = declaredMime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_PHOTO_MIME.includes(declared as PhotoMime)) {
    return { ok: false, error: 'photo: допустимы только JPEG, PNG и WebP' };
  }

  const actual = sniffImage(bytes);
  if (actual === null) {
    return { ok: false, error: 'photo: содержимое не является изображением' };
  }
  if (actual !== declared) {
    return { ok: false, error: 'photo: содержимое файла не соответствует заявленному формату' };
  }
  return { ok: true, mime: actual };
}
