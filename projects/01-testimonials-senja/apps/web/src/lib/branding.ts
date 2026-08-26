// Брендирование формы владельцем (AC FR-002: «логотип, акцентный цвет, заголовок»).
// Хранится в projects.branding jsonb — колонка есть в 003_core.sql, схемы у неё нет,
// поэтому форма значений задаётся здесь.

export interface Branding {
  heading: string;
  accent_color: string;
  logo_url: string | null;
}

// Фирменный акцент Proofwall. Проект без собственного оформления должен выглядеть
// как часть продукта, а не как чёрно-белая заглушка. Значение продублировано в
// globals.css как --accent; здесь оно нужно потому, что уходит в inline-стиль
// (виджет и SSR не видят CSS-переменные страницы владельца).
const DEFAULT_ACCENT = '#6701ef';
// Только hex: любое иное значение уехало бы в атрибут style. Проверка — не косметика,
// а граница: строка вроде "red;background:url(javascript:…)" не должна попасть в разметку.
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Абсолютный http(s)-URL. javascript:/data: в src логотипа — вектор исполнения на форме. */
function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readBranding(raw: unknown): Branding {
  const b = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const heading = typeof b.heading === 'string' && b.heading.trim() !== '' ? b.heading : 'Оставьте отзыв';
  const accent = typeof b.accent_color === 'string' && HEX.test(b.accent_color) ? b.accent_color : DEFAULT_ACCENT;
  return {
    // heading НЕ экранируем здесь — он попадёт в JSX через {}, React экранирует сам.
    heading: heading.slice(0, 120),
    accent_color: accent,
    logo_url: safeLogoUrl(b.logo_url),
  };
}
