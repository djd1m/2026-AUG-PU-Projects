'use client';
import { useState } from 'react';
import { THEME_COLOR, themeCookie, type Theme } from '../lib/theme';
// A toggle button keeps one accessible name; the state is carried by aria-pressed (WAI-ARIA APG).
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.cookie = themeCookie(next);
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next);
    setTheme(next);
  }
  return <button type="button" className="theme-toggle secondary" aria-label="Светлая тема" aria-pressed={theme === 'light'} onClick={toggle}>
    <span aria-hidden="true">{theme === 'light' ? '☀︎' : '☾︎'}</span>
  </button>;
}
