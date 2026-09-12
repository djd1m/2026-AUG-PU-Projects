'use client';

// Экран настроек (FR-consent-and-telegram-auth-13): кнопка входа через Telegram и раздел
// «удалить мои данные». Дневник дня и кабинет партнёра — другие фичи, здесь не реализуются.

import { TelegramLoginButton } from './telegram-login-button';
import { DeleteDataScreen } from './delete-data';

export default function SettingsPage() {
  // Нет отдельного маршрута «статус сессии» (канон закрыт на 14 маршрутах): автоматический
  // вход в TMA безопасно повторить и для уже связанной сессии — TelegramLogin идемпотентен
  // (повторный вход того же аккаунта даёт `migrated_entries: 0`, ничего не портит).
  return (
    <main>
      <h1>Настройки</h1>
      <TelegramLoginButton botDeepLink="https://t.me/tarelka_bot" isAnonymous={true} />
      <DeleteDataScreen />
    </main>
  );
}
