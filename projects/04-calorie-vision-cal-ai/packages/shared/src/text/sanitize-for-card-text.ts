// `sanitizeForCardText` — единая функция очистки текста ПЕРЕД использованием на ОБЕИХ
// поверхностях фичи `share-card-and-growth-events` (SSR-страница `/c/{card_id}` и растровый
// SVG-оверлей карточки), FR-share-card-and-growth-events-10.
//
// Экранирование (HTML/XML) сюда НЕ входит намеренно — оно делается КАЖДЫМ потребителем
// отдельно на своей поверхности (`escapeHtml`/`escapeSvgText` ниже), потому что правила
// экранирования HTML и XML/SVG пересекаются, но не тождественны бит-в-бит (апостроф:
// `&#39;` у HTML, `&apos;` — валидная XML-сущность). Совмещение в одной функции означало бы
// либо двойное экранирование, либо неверное для одной из двух поверхностей.

/**
 * Символы принудительного направления письма и форматирования Unicode: LRE/RLE/PDF/LRO/RLO
 * (`U+202A`–`U+202E`), LRI/RLI/FSI/PDI (`U+2066`–`U+2069`), ALM (`U+061C`). Без этого шага
 * строка визуально читается иначе, чем побайтово — это не разметка, а СИМВОЛЫ, и ни один
 * HTML/XML-экранировщик их не ловит (AC-share-card-and-growth-events-13).
 */
const BIDI_CONTROL_CHARS = /[\u202A-\u202E\u2066-\u2069\u061C]/gu;

export function sanitizeForCardText(value: string, maxLen: number): string {
  const stripped = value.replace(BIDI_CONTROL_CHARS, '');
  if (stripped.length <= maxLen) return stripped;
  // Обрезка до `maxLen - 1` символов плюс многоточие — итоговая длина не превышает maxLen.
  return `${stripped.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Экранирование для SSR HTML — ровно пять сущностей FR-10в, апостроф числовой сущностью. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Экранирование для текстового узла SVG — те же пять символов, апостроф именованной XML-сущностью. */
export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
