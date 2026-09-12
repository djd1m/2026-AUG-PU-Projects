'use client';

// Кнопка «Войти через Telegram» (FR-consent-and-telegram-auth-13).
//
// В TMA — вход выполняется АВТОМАТИЧЕСКИ при монтировании, ЕСЛИ `WebApp.initData` непусто И
// текущая сессия ещё анонимна, без действия пользователя (`RenderConsentAndAuthScreens` шаг 1,
// 02_pseudocode.md). В PWA (`window.Telegram` отсутствует) — видимая кнопка, открывающая
// `t.me`-ссылку бота; сам вход в PWA происходит после перехода в Mini App и возврата.
//
// Секретов здесь нет: компонент передаёт готовую строку `initData`, полученную от Telegram
// WebApp SDK, серверу — токен бота ему неизвестен и не нужен.

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
      };
    };
  }
}

type LoginState = 'idle' | 'pending' | 'done' | 'error';

async function submitTelegramLogin(initData: string): Promise<boolean> {
  const response = await fetch('/api/v1/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData }),
    credentials: 'include',
  });
  return response.ok;
}

/** Бот-ссылка задаётся владельцем продукта отдельно от кода (не секрет, но и не константа кода). */
export function TelegramLoginButton({ botDeepLink, isAnonymous }: { readonly botDeepLink: string; readonly isAnonymous: boolean }) {
  const [state, setState] = useState<LoginState>('idle');

  useEffect(() => {
    const initData = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initData : undefined;
    if (!isAnonymous || initData === undefined || initData === '') return;

    setState('pending');
    void submitTelegramLogin(initData).then((ok) => setState(ok ? 'done' : 'error'));
  }, [isAnonymous]);

  const isMiniApp = typeof window !== 'undefined' && window.Telegram?.WebApp !== undefined;
  // В Mini App вход автоматический — видимой кнопки не показываем, только состояние.
  if (isMiniApp) {
    if (state === 'pending') return <p>Входим через Telegram…</p>;
    if (state === 'error') return <p>Не удалось подтвердить вход. Попробуйте ещё раз.</p>;
    return null;
  }

  return (
    <a href={botDeepLink} rel="noreferrer">
      Войти через Telegram
    </a>
  );
}
