import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Тарелка',
  description: 'Сфотографируйте тарелку — получите калории и БЖУ из открытой базы с видимым источником.',
  // Адрес из критерия приёмки — `/manifest.json`; он переписывается на маршрут метаданных
  // `app/manifest.ts` (next.config.mjs). Ссылка в разметке обязана вести на ОБЪЯВЛЕННЫЙ
  // адрес, иначе проверка «манифест доступен» и реальность расходятся.
  manifest: '/manifest.json',
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
