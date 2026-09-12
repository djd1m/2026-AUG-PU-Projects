'use client';

// Экран «удалить мои данные» (FR-consent-and-telegram-auth-13, FR-consent-and-telegram-auth-8/9).
//
// ДВЕ раздельные кнопки с разным текстом объяснения — разные тексты не дают спутать
// необратимое действие с обратимым (`RenderConsentAndAuthScreens` шаг 3).
//
// Правка по review-report.md RV-consent-and-telegram-auth-09: нажатие «Удалить всё» раньше
// немедленно отправляло `confirm: true` без отдельного диалога — обязательного по
// `04_refinement.md` → Security Hardening («UI обязан подтверждать действие отдельным
// диалогом»). Теперь кнопка ТОЛЬКО открывает подтверждение с явной отменой; запрос уходит
// исключительно по нажатию «Да, удалить»/«Да, отозвать» второго экрана.

import { useState } from 'react';

type Scope = 'withdraw_consent' | 'erase_all';

async function requestAccountDelete(scope: Scope): Promise<boolean> {
  const response = await fetch('/api/v1/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ confirm: true, scope }),
  });
  return response.ok;
}

const CONFIRM_COPY: Readonly<Record<Scope, { readonly question: string; readonly confirmLabel: string }>> = {
  withdraw_consent: {
    question: 'Отозвать согласие? Ваши карточки закроются немедленно, дневник останется.',
    confirmLabel: 'Да, отозвать согласие',
  },
  erase_all: {
    question: 'Удалить аккаунт и все данные? Действие НЕОБРАТИМО — данные будут стёрты в течение 72 часов.',
    confirmLabel: 'Да, удалить всё',
  },
};

export function DeleteDataScreen() {
  // `confirming` — экран подтверждения ОТКРЫТ, но запрос ещё НЕ отправлен (RV-09).
  const [confirming, setConfirming] = useState<Scope | null>(null);
  const [pending, setPending] = useState<Scope | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const confirmed = (scope: Scope): void => {
    setConfirming(null);
    setPending(scope);
    void requestAccountDelete(scope)
      .then((ok) =>
        setResult(
          ok
            ? scope === 'withdraw_consent'
              ? 'Согласие отозвано, карточки закрыты.'
              : 'Удаление запущено, данные будут стёрты в течение 72 часов.'
            : 'Не удалось выполнить действие. Попробуйте ещё раз.',
        ),
      )
      .catch(() => setResult('Не удалось выполнить действие. Попробуйте ещё раз.'))
      .finally(() => setPending(null));
  };

  if (confirming !== null) {
    const copy = CONFIRM_COPY[confirming];
    return (
      <main>
        <p role="alertdialog">{copy.question}</p>
        <button type="button" onClick={() => confirmed(confirming)}>
          {copy.confirmLabel}
        </button>
        <button type="button" onClick={() => setConfirming(null)}>
          Отмена
        </button>
      </main>
    );
  }

  return (
    <main>
      <section>
        <p>Отозвать согласие: закроет ваши карточки сейчас, дневник останется.</p>
        <button type="button" disabled={pending !== null} onClick={() => setConfirming('withdraw_consent')}>
          Отозвать согласие
        </button>
      </section>
      <section>
        <p>Удалить всё: удалит аккаунт и все данные в течение 72 часов, действие необратимо.</p>
        <button type="button" disabled={pending !== null} onClick={() => setConfirming('erase_all')}>
          Удалить всё
        </button>
      </section>
      {result !== null ? <p role="status">{result}</p> : null}
    </main>
  );
}
