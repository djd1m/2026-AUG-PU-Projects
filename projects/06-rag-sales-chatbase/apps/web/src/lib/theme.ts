// из N5: projects/05-podcast-clips-opus/apps/web/src/lib/theme.ts (коммит 90fe80a) — cookie n6_theme, цвета --paper N6.
// Выбор темы (FR-LOOK-008): тёмная по умолчанию для всех, светлая только явным выбором.
// Закрытое множество в коде: всё, кроме ровно одной пары `n6_theme=light`, — тёмная (fail-closed, honest-configuration).
export const THEMES = ['dark', 'light'] as const;
export type Theme = typeof THEMES[number];
export const THEME_COOKIE = 'n6_theme';
export const DEFAULT_THEME: Theme = 'dark';
// Цвет адресной строки = токен --paper темы; tests/theme.test.ts сверяет его с globals.css.
export const THEME_COLOR: Record<Theme, string> = { dark: '#0d0f12', light: '#f6f7f9' };

export function themeFromCookie(header: string | undefined): Theme {
  if (typeof header !== 'string' || header === '') return DEFAULT_THEME;
  const values: string[] = [];
  for (const part of header.split(';')) {
    const pair = part.replace(/^[ \t]+/, '');
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== THEME_COOKIE) continue;
    values.push(pair.slice(eq + 1));
  }
  // Два значения — неоднозначность, а не выбор: побеждает строгое умолчание.
  return values.length === 1 && values[0] === 'light' ? 'light' : DEFAULT_THEME;
}

export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme === 'light' ? 'light' : 'dark'}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}
