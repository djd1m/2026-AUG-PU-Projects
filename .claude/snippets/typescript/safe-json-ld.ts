// Безопасная вставка JSON-LD в <script type="application/ld+json">.
//
// Извлечено из projects/01-testimonials-senja, 2026-08-27. Maturity: 🔴 Alpha.
//
// ЗАЧЕМ: содержимое JSON-LD обычно приходит от пользователей (отзывы, имена, названия).
// Обычный JSON.stringify внутри <script> — это stored XSS: строка "</script><script>…"
// закрывает тег и всё, что после неё, исполняется. React здесь НЕ защищает —
// dangerouslySetInnerHTML именно так и называется.
//
// ЭТО НЕ ЗАМЕНА экранированию при обычном рендере — это отдельный случай, где
// экранирование HTML неприменимо, потому что содержимое обязано остаться валидным JSON.

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')   // закрывает вектор "</script>"
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')   // закрывает HTML-сущности в атрибутах
    // U+2028/U+2029 — валидны в JSON, но обрывают строку в JS-парсере.
    // Сами эти символы в регэксп-литерале писать НЕЛЬЗЯ: они — разделители строк
    // в JS, и литерал обрывается прямо на них (поймано сборкой, не тестом).
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Применение:
//   <script type="application/ld+json"
//           dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLdObject) }} />
