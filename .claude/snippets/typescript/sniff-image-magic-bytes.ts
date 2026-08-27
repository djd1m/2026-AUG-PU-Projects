// Определение формата изображения по СОДЕРЖИМОМУ + запрет SVG.
//
// Извлечено из projects/01-testimonials-senja, 2026-08-27. Maturity: 🔴 Alpha.
//
// Загруженный файл — самый опасный пользовательский ввод, и вот чем он отличается от
// остальных: текст мы отдаём обратно ЭКРАНИРОВАННЫМ, а файл отдаём как КОНТЕНТ с
// заголовком типа. Экранирование тут не работает в принципе — защищать нужно
// на приёме и на отдаче.
//
// Три решения, каждое снимает конкретный вектор:
//
//   1. SVG ЗАПРЕЩЁН. Формально изображение, по сути XML-документ, умеющий <script> и
//      onload. Открытый на вашем домене, он выполнит код в вашем контексте и уведёт
//      сессию. «Очистка» SVG надёжной не считается — отрасль обжигалась многократно.
//   2. Тип берётся из СОДЕРЖИМОГО, не из заголовка. Content-Type задаёт клиент,
//      поэтому "image/png" на HTML-файле — обычный запрос, а не аномалия.
//   3. Отдавать с типом, определённым ВАМИ, и с `X-Content-Type-Options: nosniff` —
//      иначе браузер попробует угадать тип сам и может решить, что это HTML.
//
// Пункт 3 живёт не в этом файле — и это ровно тот стык, где защита обычно теряется.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/** null для всего, что не является разрешённым РАСТРОВЫМ изображением — включая SVG, HTML, GIF. */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
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
  // SVG сюда не попадёт никогда: у него нет бинарной сигнатуры, он начинается с текста.
  return null;
}

export type ImageVerdict = { ok: true; mime: ImageMime } | { ok: false; error: string };

/**
 * Заявленный тип обязан СОВПАСТЬ с содержимым. Расхождение — это не «пользователь
 * ошибся расширением», а попытка провести файл под чужим типом. Отвергать, не чинить.
 */
export function validateImage(bytes: Uint8Array, declaredMime: string): ImageVerdict {
  if (bytes.byteLength === 0) return { ok: false, error: 'пустой файл' };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'файл слишком большой' };

  const declared = declaredMime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_IMAGE_MIME.includes(declared as ImageMime)) {
    return { ok: false, error: 'допустимы только JPEG, PNG и WebP' };
  }
  const actual = sniffImage(bytes);
  if (actual === null) return { ok: false, error: 'содержимое не является изображением' };
  if (actual !== declared) return { ok: false, error: 'содержимое не соответствует заявленному формату' };
  return { ok: true, mime: actual };
}
