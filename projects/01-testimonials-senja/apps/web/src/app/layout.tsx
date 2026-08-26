import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import './globals.css';

// Пара шрифтов взята с оригинала измерением computed-стилей (см. шапку globals.css):
// геометричный гротеск на заголовки + нейтральный на текст. next/font подставляет их
// самохостом — без обращения к Google на каждой загрузке и без сдвига макета.
const display = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Proofwall — отзывы, которые продают',
  description: 'Собирайте видео- и текстовые отзывы, показывайте их на «Стене любви» и виджетом на своём сайте.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1e0a3c',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
