'use client';

// Кнопка «Войти через Telegram» (FR-consent-and-telegram-auth-13).
//
// Правка RV-consent-and-telegram-auth-06 (третий обзор): сам вход выполняется ОДИН РАЗ, на
// корне приложения (`../telegram-auto-login.tsx`) — этот компонент ТОЛЬКО ОТОБРАЖАЕТ
// состояние и НЕ отправляет `initData` повторно. Раньше он дублировал попытку входа здесь же:
// повторное открытие `/settings` пересылало ТУ ЖЕ строку и показывало ошибку replay, потому
// что монтирование этой страницы заново запускало `submitTelegramLogin`.
//
// В PWA (`window.Telegram` отсутствует) — видимая кнопка со ссылкой на `t.me`-бота; сам вход
// в PWA происходит после перехода в Mini App и возврата (там же сработает `TelegramAutoLogin`).
//
// Правка RV-consent-and-telegram-auth-03 (четвёртый обзор): `TELEGRAM_LINKED_KEY` удалён из
// `../telegram-auto-login` целиком — это был ИМЕННО постоянный флаг, который находка запретила
// (см. комментарий файла источника: он не связан с текущей серверной сессией и не сбрасывается
// экраном удаления). Статус «входим…» этот компонент отображать честно не может без нового
// маршрута статуса (канон закрыт), поэтому в Mini App он больше не читает состояние входа и
// ничего не отображает — сам вход и его исход полностью на стороне `TelegramAutoLogin`.

import { useEffect, useState } from 'react';

// `Window.Telegram` уже объявлен в `../telegram-auto-login.tsx` (модульная аугментация
// глобального типа — второе несовпадающее объявление в той же программе TS не компилируется).

/** Бот-ссылка задаётся владельцем продукта отдельно от кода (не секрет, но и не константа кода). */
export function TelegramLoginButton({ botDeepLink }: { readonly botDeepLink: string }) {
  const [isMiniApp, setIsMiniApp] = useState(false);

  useEffect(() => {
    setIsMiniApp(typeof window !== 'undefined' && window.Telegram?.WebApp !== undefined);
  }, []);

  if (isMiniApp) {
    // Вход уже выполнен (или выполняется) корневым `TelegramAutoLogin` — здесь ничего не рендерим.
    return null;
  }

  return (
    <a href={botDeepLink} rel="noreferrer">
      Войти через Telegram
    </a>
  );
}
