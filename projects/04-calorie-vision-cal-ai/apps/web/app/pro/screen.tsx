'use client';

// Экран подписки Pro (фича `subscription-and-commission`, OWN-001/002/008).
//
// ЧЕСТНОСТЬ ЭКРАНА — не стиль, а требование, заслуженное продуктом-источником: практики,
// за которые магазин приложений наказал Cal AI, здесь не воспроизводятся. Отсюда четыре
// свойства, каждое проверяется снимком разметки:
//   1. цена названа ЧИСЛОМ и периодом до нажатия, а не после;
//   2. бесплатный путь назван ТУТ ЖЕ: сканы вернутся завтра, и продукт продолжит работать;
//   3. отмена описана ДО оплаты, а не спрятана в настройках;
//   4. ничего не обещается сверх того, что есть: никакого «пробного периода», которого нет.

import { useState } from 'react';

export interface ProScreenProps {
  readonly priceMinor: number;
  readonly scanLimitFree: number;
  readonly scanLimitPro: number;
  /** Когда обновятся бесплатные сканы — бесплатный путь обязан быть назван конкретно. */
  readonly resetHint?: string;
  readonly status?: 'none' | 'active' | 'past_due' | 'canceled' | 'expired';
}

/** Копейки → «1000 ₽». Дробная часть показывается, ТОЛЬКО если она есть: «1000,00 ₽»
 * читается как цена с подвохом, а её здесь нет. */
export function formatPrice(priceMinor: number): string {
  const major = Math.floor(priceMinor / 100);
  const minor = priceMinor % 100;
  const number = minor === 0 ? String(major) : `${major},${String(minor).padStart(2, '0')}`;
  return `${number} ₽`;
}

async function startCheckout(): Promise<{ url: string } | { error: string }> {
  const response = await fetch('/api/v1/subscription/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
  });
  if (response.ok) {
    const body = (await response.json()) as { data?: { redirect_url?: string } };
    const url = body.data?.redirect_url;
    if (typeof url === 'string' && url !== '') return { url };
    return { error: 'Платёжная страница недоступна. Попробуйте позже.' };
  }
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (body?.error?.code === 'account_required') return { error: 'Чтобы оформить подписку, войдите через Telegram — она привязывается к аккаунту, а не к браузеру.' };
  if (body?.error?.code === 'already_subscribed') return { error: 'Подписка уже действует.' };
  if (body?.error?.code === 'payment_provider_unavailable') return { error: 'Платёжный сервис временно недоступен. Деньги не списаны, попробуйте ещё раз.' };
  return { error: 'Не удалось начать оплату. Деньги не списаны.' };
}

export function ProScreen({ priceMinor, scanLimitFree, scanLimitPro, resetHint, status = 'none' }: ProScreenProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubscribe = (): void => {
    setPending(true);
    setError(null);
    startCheckout()
      .then((outcome) => {
        if ('url' in outcome) {
          window.location.href = outcome.url;
          return;
        }
        setError(outcome.error);
      })
      .catch(() => setError('Не удалось начать оплату: проверьте соединение. Деньги не списаны.'))
      .finally(() => setPending(false));
  };

  if (status === 'active') {
    return (
      <main className="page" aria-label="подписка Pro">
        <div className="card">
          <h1 className="pro__title">Подписка действует</h1>
          <p className="pro__line">{scanLimitPro} распознаваний в сутки вместо {scanLimitFree}.</p>
          <p className="pro__cancel">Отменить можно в любой момент — оплаченный период доработает до конца.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" aria-label="подписка Pro">
      <div className="card">
        <h1 className="pro__title">Pro</h1>
        {/* Цена — ЧИСЛОМ и до нажатия. */}
        <p className="pro__price">{formatPrice(priceMinor)} в месяц</p>
        <p className="pro__line">{scanLimitPro} распознаваний в сутки вместо {scanLimitFree}.</p>
        {/* Бесплатный путь назван ЗДЕСЬ ЖЕ, а не спрятан. */}
        <p className="pro__free">
          Без подписки продукт продолжает работать: {scanLimitFree} распознаваний в сутки.{' '}
          {resetHint ?? 'Счётчик обновляется ночью по московскому времени.'}
        </p>
        {/* Отмена описана ДО оплаты. */}
        <p className="pro__cancel">Отменить можно в любой момент — оплаченный период доработает до конца, деньги за него не сгорают.</p>
        <button type="button" className="btn btn--primary btn--wide" onClick={onSubscribe} disabled={pending}>
          {pending ? 'Открываем оплату…' : `Оформить за ${formatPrice(priceMinor)}`}
        </button>
        {error !== null ? (
          <p className="pro__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
