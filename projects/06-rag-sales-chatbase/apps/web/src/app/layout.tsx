// из N5: projects/05-podcast-clips-opus/apps/web/src/app/layout.tsx (коммит 90fe80a) — адаптировано: «Суфлёр», Onest.
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import { THEME_COLOR } from '../lib/theme';
import { requestTheme } from './theme-server';
// Onest (OFL-1.1, FR-LOOK-009) самохостингом из пакета @fontsource-variable/onest 5.3.1 — без сети на сборке.
// Два начертания — две семьи: без unicode-range браузер не склеил бы кириллицу и латиницу одной семьи,
// а цепочка семей в font-family (globals.css) даёт посимвольный переход.
const onestCyrillic = localFont({ src: '../../../../node_modules/@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2',
  weight: '100 900', variable: '--font-onest-cyr', display: 'swap' });
const onestLatin = localFont({ src: '../../../../node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2',
  weight: '100 900', variable: '--font-onest-lat', display: 'swap' });
// cookies/headers делают каждую страницу динамической: тема ставится на сервере, вспышки нет.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Суфлёр — ИИ-помощник для сайта по вашим материалам' };
export async function generateViewport(): Promise<Viewport> {
  const theme = await requestTheme();
  return { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: theme, themeColor: THEME_COLOR[theme] };
}
export default async function Layout({ children }: { children: ReactNode }) {
  const theme = await requestTheme();
  return <html lang="ru" data-theme={theme} className={`${onestCyrillic.variable} ${onestLatin.variable}`}><body>{children}</body></html>;
}
