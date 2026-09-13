import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { TelegramAutoLogin } from './telegram-auto-login';

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
      <body>
        {/* RV-consent-and-telegram-auth-06 (третий обзор): SDK Telegram Mini App — без него
            `window.Telegram.WebApp` не существует нигде в приложении. `beforeInteractive`:
            `TelegramAutoLogin` ниже читает `window.Telegram` в своём первом эффекте. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {/* Автоматический вход — НА КОРНЕ, а не только на /settings (RV-06 п. 1): любой первый
            открытый экран Mini App пробует вход, если initData непусто и сессия ещё анонимна. */}
        <TelegramAutoLogin />
        {children}
      </body>
    </html>
  );
}
