'use client';

// Экран согласия (FR-consent-and-telegram-auth-13, FR-consent-and-telegram-auth-5/6).
//
// Показывается ПОСЛЕ подтверждения ПЕРВОГО результата распознавания и ПЕРЕД первой попыткой
// сохранить запись дневника — НЕ до первого скана: камера остаётся первым экраном продукта
// (FR-CAPTURE-001 этой фичей не переопределяется, `RenderConsentAndAuthScreens` шаг 2).
//
// Правка по review-report.md RV-consent-and-telegram-auth-10: `onDecided` раньше вызывался из
// `finally` независимо от результата HTTP-запроса — при сетевом отказе или ошибке сервера
// пользователя всё равно уводило назад, будто согласие сохранено. Теперь переход происходит
// ТОЛЬКО после успешного ответа; при отказе показывается ошибка и кнопки остаются активными
// для повтора.

import { useState } from 'react';

const CONSENT_VERSION = '2026-09-v1';
const CONSENT_TEXT =
  'Я согласен(а) на обработку данных о моём питании (фото еды, результаты распознавания, ' +
  'записи дневника) сервисом «Тарелка» как специальной категории персональных данных, ' +
  'а также на их хранение до момента отзыва согласия или удаления аккаунта.';

async function submitConsentDecision(decision: 'grant' | 'decline', consentTextHash: string): Promise<boolean> {
  const response = await fetch('/api/v1/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ decision, consent_version: CONSENT_VERSION, consent_text_hash: consentTextHash }),
  });
  return response.ok;
}

export function ConsentScreen({ consentTextHash, onDecided }: { readonly consentTextHash: string; readonly onDecided: (decision: 'grant' | 'decline') => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = (decision: 'grant' | 'decline'): void => {
    setPending(true);
    setError(null);
    submitConsentDecision(decision, consentTextHash)
      .then((ok) => {
        if (ok) {
          onDecided(decision);
          return;
        }
        // Переход НЕ выполняется: решение не сохранено, пользователь остаётся на экране (RV-10).
        setError('Не удалось сохранить решение. Проверьте соединение и попробуйте ещё раз.');
      })
      .catch(() => setError('Не удалось сохранить решение. Проверьте соединение и попробуйте ещё раз.'))
      .finally(() => setPending(false));
  };

  return (
    <main>
      <p>{CONSENT_TEXT}</p>
      <button type="button" disabled={pending} onClick={() => decide('grant')}>
        Согласен(а)
      </button>
      <button type="button" disabled={pending} onClick={() => decide('decline')}>
        Отказаться
      </button>
      {error !== null ? <p role="alert">{error}</p> : null}
    </main>
  );
}
