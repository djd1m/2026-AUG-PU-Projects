import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { THEME_COLOR } from '../lib/theme';
import { requestTheme } from './theme-server';
// cookies/headers make every page dynamic; `/` loses static prerender on purpose (SSR theme, no flash).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'КлипМейкер' };
export async function generateViewport(): Promise<Viewport> {
  const theme = await requestTheme();
  return { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: theme, themeColor: THEME_COLOR[theme] };
}
export default async function Layout({ children }: { children: ReactNode }) {
  const theme = await requestTheme();
  return <html lang="ru" data-theme={theme}><body>{children}</body></html>;
}
