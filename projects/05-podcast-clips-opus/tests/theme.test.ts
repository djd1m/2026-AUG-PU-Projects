import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { THEME_COLOR, themeCookie, themeFromCookie } from '../apps/web/src/lib/theme';
import { ThemeToggle } from '../apps/web/src/app/ThemeToggle';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
import { createGuestPageHandler } from '../apps/web/src/server/guest-page';

describe('themeFromCookie — dark unless exactly one n5_theme=light (fail-closed)', () => {
  it('explicit light choice', () => {
    expect(themeFromCookie('n5_theme=light')).toBe('light');
    expect(themeFromCookie('a=1; n5_theme=light; b=2')).toBe('light');
    expect(themeFromCookie('a=1;n5_theme=light')).toBe('light');
  });
  it.each([
    undefined, '', 'n5_theme=dark', 'n5_theme=LIGHT', 'n5_theme= light', 'n5_theme=light ', 'n5_theme =light',
    'n5_theme=light; n5_theme=dark', 'n5_theme=light; n5_theme=light', 'n5_theme=', 'n5_theme', 'x_n5_theme=light',
    'n5_themes=light', 'n5_theme="light"', 'n5_theme=l%69ght', 'garbage;;;==', 'n5_theme=💡',
  ])('%j → dark', header => { expect(themeFromCookie(header)).toBe('dark'); });
  it('non-string input from a caller is still dark', () => {
    expect(themeFromCookie(42 as unknown as string)).toBe('dark');
  });
  it('writes only the closed set with the agreed attributes', () => {
    expect(themeCookie('light')).toBe('n5_theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(themeCookie('dark')).toBe('n5_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(themeCookie('LIGHT' as 'light')).toContain('n5_theme=dark;');
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
const ssr = ['apps/web/src/server/short-link-handler.ts', 'apps/web/src/server/guest-page.ts'];
const COLOR = /#[0-9a-fA-F]{3,8}\b|\bwhite\b|\bblack\b|rgba?\(|%23/;

describe('colour tokens — one source of values', () => {
  const dark = block(globals, DARK, 'globals dark'), light = block(globals, LIGHT, 'globals light');
  it('both themes define the same colour tokens, and they differ', () => {
    const colour = (t: Tokens) => Object.keys(t).filter(k => !/^space-|^nav-h$/.test(k)).sort();
    expect(colour(light)).toEqual(colour(dark));
    for (const key of ['paper', 'surface', 'surface-2', 'ink', 'muted', 'line', 'green', 'btn-bg', 'btn-fg', 'brand-bg', 'brand-fg', 'media-bg', 'media-fg', 'focus', 'select-arrow'])
      expect(dark[key], key).not.toBe(light[key]);
    expect(globals).toMatch(/:root\s*\{\s*color-scheme:dark;/);
    expect(globals).toMatch(/:root\[data-theme=light\]\s*\{\s*color-scheme:light;/);
    expect(globals).not.toContain('prefers-color-scheme');
  });
  it('no colour literal outside the token blocks (globals.css and SSR <style>)', () => {
    const rest = globals.replace(DARK, '').replace(LIGHT, '');
    expect(rest.split('\n').filter(line => COLOR.test(line))).toEqual([]);
    for (const file of ssr) {
      const style = /<style>([\s\S]*?)<\/style>/.exec(readFileSync(file, 'utf8'))![1]!;
      expect(style.split('\n').filter(line => COLOR.test(line)), file).toEqual([]);
    }
  });
  it.each(ssr)('%s duplicates globals.css values exactly', file => {
    const source = readFileSync(file, 'utf8');
    const tokens = /const THEME_TOKENS = '([^']+)'/.exec(source)?.[1];
    expect(tokens, 'THEME_TOKENS').toBeTruthy();
    const d = block(tokens!, DARK, file + ' dark'), l = block(tokens!, LIGHT, file + ' light');
    expect(Object.keys(d).sort()).toEqual(Object.keys(l).sort());
    for (const key of ['paper', 'surface', 'ink', 'green', 'btn-bg', 'btn-fg', 'media-bg', 'media-fg', 'focus']) expect(d, key).toHaveProperty(key);
    for (const [key, value] of Object.entries(d)) expect(value, `dark --${key}`).toBe(dark[key]);
    for (const [key, value] of Object.entries(l)) expect(value, `light --${key}`).toBe(light[key]);
    expect(source).toContain('${THEME_TOKENS}');
  });
  it('address-bar colour equals --paper of each theme', () => {
    expect(THEME_COLOR).toEqual({ dark: dark.paper, light: light.paper });
  });
});

describe('theme on SSR pages /c/ and /g/', () => {
  const now = new Date('2026-09-22T21:00:00.000Z');
  const auth = { authenticate: vi.fn().mockResolvedValue(null) }, allowRead = vi.fn().mockResolvedValue(true);
  const shortLink = createShortLinkHandler({ referralSecret: 's', auth, allowRead, trustedProxyHops: 1, clock: () => now,
    preview: vi.fn().mockResolvedValue(null), links: { find: vi.fn().mockResolvedValue({ id: 'l', code: '23456789AB', account_id: 'o', title: 't',
      status: 'done', thumbnail_key: null, expires_at: null, finished_at: now, plan: 'free' }), recordView: vi.fn() } });
  const guest = createGuestPageHandler({ referralSecret: 's', auth, allowRead, trustedProxyHops: 1, guests: { recordOpen: vi.fn(),
    find: vi.fn().mockResolvedValue({ id: 'p', code: 'c', guest_name: 'Анна', video_id: 'v', account_id: 'o', sent_at: now,
      expires_at: new Date(now.getTime() + 86400000), revoked_at: null, plan: 'free', finished_at: now, clips: [] }) } });
  const request = (cookie?: string) => new Request('https://app.example/x', { headers: { 'x-forwarded-for': '192.0.2.9, 127.0.0.1', ...(cookie ? { cookie } : {}) } });
  it.each([['/c/', shortLink], ['/g/', guest]] as const)('%s: dark by default, light only by the cookie, CSP unchanged', async (_, handle) => {
    for (const [cookie, theme] of [[undefined, 'dark'], ['n5_theme=light', 'light'], ['n5_theme=LIGHT', 'dark'], ['n5_theme=light; n5_theme=dark', 'dark']] as const) {
      const response = await handle(request(cookie), '23456789AB'), html = await response.text();
      expect(html).toContain(`<html lang="ru" data-theme="${theme}">`);
      expect(html).toContain(`<meta name="color-scheme" content="${theme}">`);
      expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR[theme]}">`);
      expect(html).toContain('@media(max-width:600px)');
      expect(html).not.toContain('theme-toggle');
      expect(response.headers.get('content-security-policy')).not.toContain('unsafe-eval');
    }
  });
  it('/c/ still has no script at all', async () => {
    const response = await shortLink(request('n5_theme=light'), '23456789AB');
    expect(await response.text()).not.toContain('<script');
    expect(response.headers.get('content-security-policy')).not.toContain('script-src');
  });
});

it('toggle: ≥44 px class, one accessible name, state in aria-pressed, type=button', () => {
  const dark = renderToStaticMarkup(createElement(ThemeToggle, { initial: 'dark' }));
  const light = renderToStaticMarkup(createElement(ThemeToggle, { initial: 'light' }));
  for (const html of [dark, light]) {
    expect(html).toContain('type="button"'); expect(html).toContain('class="theme-toggle secondary"');
    expect(html).toContain('aria-label="Светлая тема"');
  }
  expect(dark).toContain('aria-pressed="false"'); expect(light).toContain('aria-pressed="true"');
  expect(globals).toMatch(/\.theme-toggle \{[^}]*min-width:2\.75rem;[^}]*min-height:2\.75rem;/);
});
