import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Тарелка',
  description: 'Сфотографируйте тарелку — получите калории и БЖУ из открытой базы с видимым источником.',
  // Манифест отдаётся маршрутом `app/manifest.ts` с типом application/manifest+json.
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#101014',
  width: 'device-width',
  initialScale: 1,
  // Видоискатель занимает экран целиком; масштабирование ломает рамку кадра.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
