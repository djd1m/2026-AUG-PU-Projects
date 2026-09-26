// из N5: projects/05-podcast-clips-opus/tests/theme.test.ts (коммит 90fe80a) — адаптировано: cookie n6_theme, токены N6,
// без SSR-страниц /c/ и /g/ (у N6 их нет); добавлены страж «палитра не N5» и разметка каркаса design-shell.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { THEME_COLOR, themeCookie, themeFromCookie } from '../apps/web/src/lib/theme';
import { ThemeToggle } from '../apps/web/src/app/ThemeToggle';
import { Landing } from '../apps/web/src/app/Landing';
import { Pricing, PLANS } from '../apps/web/src/app/pricing/Pricing';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

describe('themeFromCookie — тёмная, кроме ровно одной пары n6_theme=light (fail-closed)', () => {
  it('явный выбор светлой', () => {
    expect(themeFromCookie('n6_theme=light')).toBe('light');
    expect(themeFromCookie('a=1; n6_theme=light; b=2')).toBe('light');
    expect(themeFromCookie('a=1;n6_theme=light')).toBe('light');
  });
  it.each([
    undefined, '', 'n6_theme=dark', 'n6_theme=LIGHT', 'n6_theme= light', 'n6_theme=light ', 'n6_theme =light',
    'n6_theme=light; n6_theme=dark', 'n6_theme=light; n6_theme=light', 'n6_theme=', 'n6_theme', 'x_n6_theme=light',
    'n6_themes=light', 'n6_theme="light"', 'n6_theme=l%69ght', 'garbage;;;==', 'n6_theme=💡', 'n5_theme=light',
  ])('%j → dark', header => { expect(themeFromCookie(header)).toBe('dark'); });
  it('нестроковый вход от вызывающего — тоже тёмная', () => {
    expect(themeFromCookie(42 as unknown as string)).toBe('dark');
  });
  it('пишет только закрытое множество с согласованными атрибутами', () => {
    expect(themeCookie('light')).toBe('n6_theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(themeCookie('dark')).toBe('n6_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(themeCookie('LIGHT' as 'light')).toContain('n6_theme=dark;');
    expect(themeCookie('light')).not.toContain('HttpOnly');
  });
});

type Tokens = Record<string, string>;
function block(css: string, selector: RegExp, where: string): Tokens {
  const match = selector.exec(css);
  if (!match) throw new Error(`token block not found in ${where}`);
  const tokens: Tokens = {};
  for (const [, name, value] of match[1]!.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[name!] = value!.trim();
  if (Object.keys(tokens).length < 5) throw new Error(`token block too small in ${where}`);
  return tokens;
}
const DARK = /:root\s*\{([^}]*)\}/, LIGHT = /:root\[data-theme=light\]\s*\{([^}]*)\}/;
const globals = readFileSync('apps/web/src/app/globals.css', 'utf8');
const COLOR = /#[0-9a-fA-F]{3,8}\b|\bwhite\b|\bblack\b|rgba?\(|%23/;
const NON_COLOUR = /^space-|^radius-|^control-h$|^nav-h$/;

describe('цветовые токены — один источник значений', () => {
  const dark = block(globals, DARK, 'globals dark'), light = block(globals, LIGHT, 'globals light');
  it('обе темы определяют одни и те же цветовые токены, и значения различаются', () => {
    const colour = (t: Tokens) => Object.keys(t).filter(k => !NON_COLOUR.test(k)).sort();
    expect(colour(light)).toEqual(colour(dark));
    for (const key of ['paper', 'surface', 'surface-2', 'ink', 'muted', 'line', 'field-line', 'accent', 'btn-bg', 'btn-fg', 'focus', 'danger', 'select-arrow'])
      expect(dark[key], key).not.toBe(light[key]);
    expect(globals).toMatch(/:root\s*\{\s*color-scheme:dark;/);
    expect(globals).toMatch(/:root\[data-theme=light\]\s*\{\s*color-scheme:light;/);
    expect(globals).not.toContain('prefers-color-scheme');
  });
  it('вне двух блоков токенов цветовых литералов нет', () => {
    const rest = globals.replace(DARK, '').replace(LIGHT, '');
    expect(rest.split('\n').filter(line => COLOR.test(line))).toEqual([]);
  });
  it('цвет адресной строки = --paper каждой темы', () => {
    expect(THEME_COLOR).toEqual({ dark: dark.paper, light: light.paper });
  });
  // Палитра «Суфлёра» своя (задание владельца): ни одно значение цветового токена не совпадает с N5 «КлипМейкер».
  it('палитра не повторяет N5', () => {
    const n5 = readFileSync('tests/fixtures/n5-palette.txt', 'utf8').match(/#[0-9a-f]{6}/gi)!.map(v => v.toLowerCase());
    expect(n5.length).toBeGreaterThan(20);
    const ours = [...Object.values(dark), ...Object.values(light)].flatMap(v => v.match(/#[0-9a-f]{6}/gi) ?? []).map(v => v.toLowerCase());
    expect(ours.filter(v => n5.includes(v) && !['#ffffff', '#000000'].includes(v))).toEqual([]);
  });
});

describe('каркас design-shell — разметка', () => {
  const landing = renderToStaticMarkup(createElement(Landing, { theme: 'dark' }));
  it('лендинг: ОДНО поле и ОДИН основной призыв в герое (FR-LOOK-001, 007)', () => {
    const hero = landing.slice(landing.indexOf('<section class="hero'), landing.indexOf('</section>'));
    expect(hero.match(/<input/g)).toHaveLength(1);
    expect(hero.match(/<button/g)).toHaveLength(1);
    expect(hero).toContain('id="site-url"');
    expect(hero).toContain('<label for="site-url">Адрес вашего сайта</label>');
    expect(hero).toContain('>Создать бота</button>');
    // Поле адреса без type=url: иначе браузер отвергнет «stomatologia.ru» без схемы.
    expect(hero).toContain('type="text"'); expect(hero).toContain('inputMode="url"');
  });
  it('лендинг: порядок секций FR-LOOK-012 и тарифы в одно действие (FR-LOOK-002)', () => {
    const order = ['hero-title', 'how-title', 'example-title', 'who-title', 'trust-title', 'plans-title', 'faq-title'].map(id => landing.indexOf(`id="${id}"`));
    expect(order.every(i => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(landing).toContain('href="/pricing"');
    expect(landing).toContain('Суфлёр');
  });
  it('тарифы: три плана канона, видимая строка снятия бейджа у «Без бейджа», FAQ «что считается ответом» (FR-TARIFF-002)', () => {
    const html = renderToStaticMarkup(createElement(Pricing, { theme: 'light' }));
    expect(PLANS.map(p => p.id)).toEqual(['free', 'nobadge', 'studio']);
    expect(PLANS.map(p => p.price)).toEqual(['0 ₽', '990 ₽', '4 900 ₽']);
    const nobadge = html.slice(html.indexOf('id="plan-nobadge"'), html.indexOf('id="plan-studio"'));
    expect(nobadge).toContain('class="badge-row"');
    expect(nobadge).toContain('Работает на Суфлёре');
    expect(html.match(/class="badge-row"/g)).toHaveLength(1);
    expect(html).toContain('Что считается ответом?');
    expect(html).toContain('class="table-wrap"');
  });
});

it('переключатель: класс ≥ 44 px, одно доступное имя, состояние в aria-pressed, type=button', () => {
  const dark = renderToStaticMarkup(createElement(ThemeToggle, { initial: 'dark' }));
  const light = renderToStaticMarkup(createElement(ThemeToggle, { initial: 'light' }));
  for (const html of [dark, light]) {
    expect(html).toContain('type="button"'); expect(html).toContain('class="theme-toggle secondary"');
    expect(html).toContain('aria-label="Светлая тема"');
  }
  expect(dark).toContain('aria-pressed="false"'); expect(light).toContain('aria-pressed="true"');
  expect(globals).toMatch(/\.theme-toggle \{[^}]*min-width:2\.75rem;[^}]*min-height:2\.75rem;/);
});
