import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Находка слияния consent-and-telegram-auth (merge-consent.md, DEC-A-036 №1): `middleware.ts`
  // ставит `script-src 'self' 'nonce-…' 'strict-dynamic'`, а страницы уходили в приложение
  // ПРЕДРЕНДЕРЕННЫМИ статически (`○ (Static)` в выводе `next build`) — nonce же рождается на
  // КАЖДЫЙ запрос, и совпасть им было негде: `grep -c 'nonce=' … index.html` давал 0, SDK
  // Telegram Mini App не грузился вовсе, вход из Mini App был физически недостижим.
  //
  // `headers()` — динамическая функция Next.js: её вызов в layout ОБЯЗАН перевести рендер этой
  // (и любой вложенной) страницы из статического в динамический, то есть per-request — только
  // тогда у нас на руках оказывается nonce, который реально совпадает с заголовком ЭТОГО
  // ответа. Плата — статическая оптимизация всего дерева `app/`, а не только экрана логина;
  // альтернатива (разрешить `telegram.org` по хосту, оставив `strict-dynamic`) её бы не
  // избежала: `strict-dynamic` игнорирует host-source выражения по спецификации, а
  // `unsafe-inline` вводить запрещено (`security.md`, `.claude/rules/embeddable-widget.md`
  // соседствует тем же классом «политика-безопасность»).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="ru">
      <body>
        {/* RV-consent-and-telegram-auth-06 (третий обзор): SDK Telegram Mini App — без него
            `window.Telegram.WebApp` не существует нигде в приложении. `beforeInteractive`:
            `TelegramAutoLogin` ниже читает `window.Telegram` в своём первом эффекте.
            `nonce` — ОБЯЗАТЕЛЕН явным пропом: `next/script` не подставляет его сам для
            внешнего `src`, в отличие от служебных скриптов гидратации самого Next. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" nonce={nonce} />
        {/* Автоматический вход — НА КОРНЕ, а не только на /settings (RV-06 п. 1): любой первый
            открытый экран Mini App пробует вход, если initData непусто и сессия ещё анонимна. */}
        <TelegramAutoLogin />
        {children}
      </body>
    </html>
  );
}
