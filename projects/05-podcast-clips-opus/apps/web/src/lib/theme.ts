// Theme choice (A-2509-03, FR-LOOK-008): dark is the default for everyone, light only by an explicit choice.
// Closed set in code: anything but exactly one `n5_theme=light` pair is dark (fail-closed, honest-configuration).
export const THEMES = ['dark', 'light'] as const;
export type Theme = typeof THEMES[number];
export const THEME_COOKIE = 'n5_theme';
export const DEFAULT_THEME: Theme = 'dark';
// Address-bar colour = the theme's --paper token; tests/theme.test.ts pins it to globals.css.
export const THEME_COLOR: Record<Theme, string> = { dark: '#0e1311', light: '#f7f8f3' };

export function themeFromCookie(header: string | undefined): Theme {
  if (typeof header !== 'string' || header === '') return DEFAULT_THEME;
  const values: string[] = [];
  for (const part of header.split(';')) {
    const pair = part.replace(/^[ \t]+/, '');
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq) !== THEME_COOKIE) continue;
    values.push(pair.slice(eq + 1));
  }
  // Two values are ambiguous, not a choice: the strict default wins.
  return values.length === 1 && values[0] === 'light' ? 'light' : DEFAULT_THEME;
}

export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme === 'light' ? 'light' : 'dark'}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}
