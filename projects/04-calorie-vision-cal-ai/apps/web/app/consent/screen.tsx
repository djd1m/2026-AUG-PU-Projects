'use client';

// Экран согласия (FR-consent-and-telegram-auth-13, FR-consent-and-telegram-auth-5/6).
//
// Показывается ПОСЛЕ подтверждения ПЕРВОГО результата распознавания и ПЕРЕД первой попыткой
// сохранить запись дневника — НЕ до первого скана: камера остаётся первым экраном продукта
// (FR-CAPTURE-001 этой фичей не переопределяется, `RenderConsentAndAuthScreens` шаг 2).

import { useState } from 'react';

const CONSENT_VERSION = '2026-09-v1';
const CONSENT_TEXT =
  'Я согласен(а) на обработку данных о моём питании (фото еды, результаты распознавания, ' +
  'записи дневника) сервисом «Тарелка» как специальной категории персональных данных, ' +
  'а также на их хранение до момента отзыва согласия или удаления аккаунта.';

interface ConsentSubmitOutcome {
  readonly ok: boolean;
}

async function submitConsentDecision(decision: 'grant' | 'decline', consentTextHash: string): Promise<ConsentSubmitOutcome> {
  const response = await fetch('/api/v1/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ decision, consent_version: CONSENT_VERSION, consent_text_hash: consentTextHash }),
  });
  return { ok: response.ok };
}

export function ConsentScreen({ consentTextHash, onDecided }: { readonly consentTextHash: string; readonly onDecided: (decision: 'grant' | 'decline') => void }) {
  const [pending, setPending] = useState(false);

  const decide = (decision: 'grant' | 'decline'): void => {
    setPending(true);
    void submitConsentDecision(decision, consentTextHash).finally(() => {
      setPending(false);
      onDecided(decision);
    });
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
    </main>
  );
}
