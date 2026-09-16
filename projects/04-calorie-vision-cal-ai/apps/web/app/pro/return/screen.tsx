'use client';

// Возврат с формы оплаты (`/pro/return?intent=…`).
//
// ТРИ СОСТОЯНИЯ, а не два (`long-running-job.md`): «ждём подтверждения», «подписка
// действует», «оплата не прошла». Два состояния — это и есть дефект: отказу негде
// появиться, и он показывается пользователем как вечный прогресс.
//
// ПОЧЕМУ ЗДЕСЬ ОПРОС, А НЕ ОТВЕТ ПРОВАЙДЕРА: возврат браузера НЕ является подтверждением
// оплаты. Подтверждает её вебхук, который приходит НА СЕРВЕР и может отстать от редиректа
// на секунды. Поверить редиректу значило бы выдать подписку по строке в адресе.

import { useEffect, useState } from 'react';

export type ReturnState =
  | { readonly kind: 'waiting'; readonly attempts: number }
  | { readonly kind: 'active'; readonly until: string }
  | { readonly kind: 'failed'; readonly reason: string };

/** Сколько ждать подтверждения, прежде чем сказать честное «пока не подтвердилось». */
export const MAX_POLL_ATTEMPTS = 20;
export const POLL_INTERVAL_MS = 1500;

export interface SubscriptionSnapshot {
  readonly status?: string;
  readonly current_period_end?: string | null;
}

/**
 * Решение по одному снимку. Вынесено из компонента, чтобы проверяться без браузера и
 * таймеров: правило «что считать успехом» важнее, чем то, как крутится спиннер.
 */
export function decideFromSnapshot(snapshot: SubscriptionSnapshot, attempts: number): ReturnState {
  if (snapshot.status === 'active' && typeof snapshot.current_period_end === 'string') {
    return { kind: 'active', until: snapshot.current_period_end };
  }
  // `expired` и `past_due` СРАЗУ после оплаты означают отказ платежа, а не «ещё не дошло».
  if (snapshot.status === 'expired' || snapshot.status === 'past_due') {
    return { kind: 'failed', reason: 'Оплата не прошла. Деньги, если списались, вернутся автоматически.' };
  }
  if (attempts >= MAX_POLL_ATTEMPTS) {
    // ЧЕСТНОЕ «не знаем», а не «наверное, получилось»: мы действительно не знаем.
    return {
      kind: 'failed',
      reason: 'Подтверждение от банка ещё не пришло. Это не значит, что оплата не прошла — откройте эту страницу через несколько минут.',
    };
  }
  return { kind: 'waiting', attempts };
}

export function ReturnScreen() {
  const [state, setState] = useState<ReturnState>({ kind: 'waiting', attempts: 0 });

  useEffect(() => {
    let attempts = 0;
    let stopped = false;

    const poll = async (): Promise<void> => {
      if (stopped) return;
      attempts += 1;
      try {
        const response = await fetch('/api/v1/subscription', { credentials: 'include' });
        const body = (await response.json()) as { data?: SubscriptionSnapshot };
        const next = decideFromSnapshot(body.data ?? {}, attempts);
        if (stopped) return;
        setState(next);
        if (next.kind === 'waiting') setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (stopped) return;
        // Сетевой сбой опроса — НЕ отказ оплаты: продолжаем спрашивать до предела попыток.
        setState(decideFromSnapshot({}, attempts));
        if (attempts < MAX_POLL_ATTEMPTS) setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <main className="page" aria-label="результат оплаты">
      <div className="card">
        {state.kind === 'waiting' ? (
          <>
            <h1 className="pro__title">Ждём подтверждения</h1>
            <p className="pro__line">Банк подтверждает оплату. Обычно это занимает несколько секунд.</p>
          </>
        ) : null}
        {state.kind === 'active' ? (
          <>
            <h1 className="pro__title">Подписка действует</h1>
            <p className="pro__line">Оплачено до {new Date(state.until).toLocaleDateString('ru-RU')}.</p>
            <p className="pro__cancel">Отменить можно в любой момент — оплаченный период доработает до конца.</p>
            <a className="btn btn--primary btn--wide" href="/">
              К съёмке
            </a>
          </>
        ) : null}
        {state.kind === 'failed' ? (
          <>
            <h1 className="pro__title">Пока без подписки</h1>
            <p className="pro__line" role="alert">
              {state.reason}
            </p>
            <a className="btn btn--wide" href="/pro">
              Вернуться к Pro
            </a>
          </>
        ) : null}
      </div>
    </main>
  );
}
