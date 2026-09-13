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

import { useEffect, useState } from 'react';
import { TELEGRAM_LINKED_KEY } from '../telegram-auto-login';

// `Window.Telegram` уже объявлен в `../telegram-auto-login.tsx` (модульная аугментация
// глобального типа — второе несовпадающее объявление в той же программе TS не компилируется).

/** Бот-ссылка задаётся владельцем продукта отдельно от кода (не секрет, но и не константа кода). */
export function TelegramLoginButton({ botDeepLink }: { readonly botDeepLink: string }) {
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    setIsMiniApp(typeof window !== 'undefined' && window.Telegram?.WebApp !== undefined);
    try {
      setLinked(window.localStorage.getItem(TELEGRAM_LINKED_KEY) === 'true');
    } catch {
      setLinked(false);
    }
  }, []);

  if (isMiniApp) {
    // Вход уже выполнен (или выполняется) корневым `TelegramAutoLogin` — здесь только статус.
    return linked ? null : <p>Входим через Telegram…</p>;
  }

  return (
    <a href={botDeepLink} rel="noreferrer">
      Войти через Telegram
    </a>
  );
}
