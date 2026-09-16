// Экран настроек (FR-consent-and-telegram-auth-13): вход по почте, вход через Telegram и раздел
// «удалить мои данные». Дневник дня — другая фича, здесь не реализуется.
//
// СЕРВЕРНЫЙ компонент — по тому же приёму, что `/pro` (`pro/page.tsx`): имя бота приходит из
// окружения сервиса `web` (`apps/web/env.ts`), а не из литерала в разметке. Зашитое имя
// `tarelka_bot` вело кнопку входа на ЧУЖОГО бота, пока владелец не сверил токен с BotFather
// 16.09.2026; настоящий бот проекта называется иначе. Имя, которого нет, валит рендер страницы,
// а не подставляется «наверное, тем самым» (`silent-fallbacks.md`).

import { loadWebConfig } from '../../env';
import { TelegramLoginButton } from './telegram-login-button';
import { EmailAuth } from './email-auth';
import { DeleteDataScreen } from './delete-data';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const config = loadWebConfig();
  // Сам вход выполняется корневым `TelegramAutoLogin` (`layout.tsx`), не здесь
  // (RV-consent-and-telegram-auth-06, третий обзор) — эта кнопка только отображает статус.
  return (
    <main className="page">
      <h1>Настройки</h1>
      {/* OWN-012: PWA — первый приоритет: вход по почте — основной, Telegram — вторая очередь. */}
      <div className="settings__section">
        <EmailAuth />
      </div>
      <div className="settings__section">
        <TelegramLoginButton botDeepLink={`https://t.me/${config.telegramBotUsername}`} />
      </div>
      <div className="settings__section">
        <a className="btn btn--ghost btn--wide" href="/cabinet">
          Кабинет партнёра и владельца
        </a>
      </div>
      <DeleteDataScreen />
    </main>
  );
}
