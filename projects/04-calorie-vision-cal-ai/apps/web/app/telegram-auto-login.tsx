'use client';

// TelegramAutoLogin — RV-consent-and-telegram-auth-06 (третий обзор).
//
// Раньше автоматический вход монтировался ТОЛЬКО на `/settings` (`telegram-login-button.tsx`)
// и получал ПОСТОЯННОЕ `isAnonymous={true}`. Три следствия:
//   1. Требование `02_pseudocode.md` «RenderConsentAndAuthScreens» шаг 1 — вход выполняется
//      автоматически ПРИ ОТКРЫТИИ Mini App, если `WebApp.initData` непусто и сессия ещё
//      анонимна — не было реализовано: корневой экран (`page.tsx`, камера) его не монтировал.
//   2. `isAnonymous={true}` НИКОГДА не менялось — компонент пытался слать `initData` заново на
//      КАЖДОМ монтировании `/settings`, включая уже связанные сессии, и получал `401
//      initdata_replayed`, показанный пользователю как ОШИБКА («Не удалось подтвердить вход»),
//      хотя формально это подтверждение, что вход уже состоялся этой же строкой.
//   3. `.then(...)` без `.catch(...)` — сетевой отказ (не HTTP-ошибка, а реджект самого
//      `fetch`) оставлял компонент в `pending` НАВСЕГДА.
//
// Правка монтирует попытку входа ЗДЕСЬ, на корне (`layout.tsx`), один раз для любого экрана.
//
// Правка RV-consent-and-telegram-auth-03 (четвёртый обзор): раньше был ЕЩЁ один постоянный ключ
// `localStorage` (`TELEGRAM_LINKED_KEY`) — «этот браузер когда-либо довёл вход до успеха» — и он
// НАВСЕГДА запрещал новую попытку, даже со свежей initData, даже после истечения серверной
// cookie или полного удаления аккаунта (экран удаления его не сбрасывал). Это НЕ дедупликация
// одной попытки, а самозваное объявление о состоянии сервера, которое клиент не наблюдает.
// Дополнительно `401 initdata_replayed` записывался в тот же флаг как ДОКАЗАТЕЛЬСТВО входа —
// хотя сервер этим ответом именно ОТКАЗЫВАЕТ в связывании (строка могла быть использована ДРУГИМ
// браузером/устройством ранее).
//
// Единственный честный клиентский сигнал без нового маршрута статуса (канон закрыт на 14
// маршрутах, `docs/canon.md`) — это ТЕКУЩАЯ строка `initData`, а не история браузера: Telegram
// перевыпускает `initData` (новый `auth_date`) при каждом открытии Mini App, поэтому дедупликация
// ограничена РОВНО последней ОТПРАВЛЕННОЙ строкой (`TELEGRAM_ATTEMPTED_KEY`) — не «навсегда», а
// «эту же байт-в-байт строку второй раз не слать». Любая ДРУГАЯ (в том числе более новая) строка
// initData пробуется заново независимо от прошлых исходов — сервер, а не клиент, окончательно
// решает про повтор (`claimReplay`, `auth-telegram.ts`) и про истечение сессии.

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

/** Ключ localStorage: последняя ОТПРАВЛЕННАЯ строка initData — не повторяем её же (RV-03). */
export const TELEGRAM_ATTEMPTED_KEY = 'n4_telegram_initdata_attempted';

export type TelegramLoginOutcome = 'ok' | 'replayed' | 'failed';

/**
 * Решение «пробовать ли вход» — ЧИСТАЯ функция без DOM, тестируемая без jsdom
 * (`tests/unit/telegram-auto-login.test.ts`). RV-03 (четвёртый обзор): УБРАН параметр
 * `alreadyLinked` — постоянного «браузер когда-то входил» больше не существует (см. комментарий
 * файла). Единственная причина не пробовать, помимо пустой `initData`, — ТА ЖЕ САМАЯ строка уже
 * была отправлена; более новая строка (или та же строка после сброса `localStorage`) пробуется
 * ВСЕГДА, а решение «пропустить/отклонить» окончательно принимает сервер.
 */
export function shouldAttemptTelegramLogin(params: {
  readonly initData: string | undefined;
  readonly lastAttemptedInitData: string;
}): boolean {
  if (params.initData === undefined || params.initData === '') return false;
  if (params.lastAttemptedInitData === params.initData) return false;
  return true;
}

/**
 * Отправляет `initData` и КЛАССИФИЦИРУЕТ ответ. `replayed` — НЕ ошибка (см. комментарий файла).
 * Сетевой отказ (реджект `fetchImpl`) НЕ перехватывается здесь — пробрасывается вызывающему,
 * который обязан поймать его `.catch(...)` (RV-06 п. 3) и НЕ помечать строку использованной.
 */
export async function submitTelegramLogin(initData: string, fetchImpl: typeof fetch = fetch): Promise<TelegramLoginOutcome> {
  const response = await fetchImpl('/api/v1/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ init_data: initData }),
    credentials: 'include',
  });
  if (response.ok) return 'ok';
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { readonly error?: { readonly code?: string } } | undefined;
    if (body?.error?.code === 'initdata_replayed') return 'replayed';
  }
  return 'failed';
}

function readLocalStorage(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    // Приватный режим/недоступность storage — не блокирует попытку входа, только теряет
    // дедупликацию между монтированиями (per-viewer-удобство, не критично для безопасности:
    // сервер сам отклоняет реальный повтор `401 initdata_replayed`).
    return undefined;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // См. readLocalStorage — недоступность storage не критична.
  }
}

/** Смонтировать РОВНО ОДИН раз на корне приложения (`layout.tsx`). Разметки не рендерит. */
export function TelegramAutoLogin(): null {
  const [, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.Telegram?.WebApp?.ready?.();
    const initData = window.Telegram?.WebApp?.initData;

    const lastAttempted = readLocalStorage(TELEGRAM_ATTEMPTED_KEY) ?? '';
    if (!shouldAttemptTelegramLogin({ initData, lastAttemptedInitData: lastAttempted })) return;

    setState('pending');
    submitTelegramLogin(initData as string)
      .then((outcome) => {
        // RV-03 (четвёртый обзор): помечается только ЭТА строка как отправленная — никакого
        // постоянного «привязано». `replayed` — НЕ подтверждение входа (см. комментарий файла),
        // поэтому состояние для него НЕ считается успешным исходом отдельно от `ok`/`failed`.
        writeLocalStorage(TELEGRAM_ATTEMPTED_KEY, initData as string);
        setState(outcome === 'failed' ? 'error' : 'done');
      })
      .catch(() => {
        // RV-06 п. 3: сетевой отказ ПОЙМАН — состояние переходит в `error`, СТРОКА НЕ помечена
        // использованной, следующее монтирование (навигация, ретрай) повторит попытку, пока
        // `initData` не устарела (окно свежести — 24 ч, `verifyTelegramInitData`).
        setState('error');
      });
  }, []);

  return null;
}
