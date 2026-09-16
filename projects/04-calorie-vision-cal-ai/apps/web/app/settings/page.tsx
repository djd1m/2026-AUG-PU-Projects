'use client';

// Экран настроек (FR-consent-and-telegram-auth-13): кнопка входа через Telegram и раздел
// «удалить мои данные». Дневник дня и кабинет партнёра — другие фичи, здесь не реализуются.

import { TelegramLoginButton } from './telegram-login-button';
import { EmailAuth } from './email-auth';
import { DeleteDataScreen } from './delete-data';

export default function SettingsPage() {
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
        <TelegramLoginButton botDeepLink="https://t.me/tarelka_bot" />
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
