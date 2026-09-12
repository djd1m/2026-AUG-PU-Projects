'use client';

// Экран «удалить мои данные» (FR-consent-and-telegram-auth-13, FR-consent-and-telegram-auth-8/9).
//
// ДВЕ раздельные кнопки с разным текстом объяснения — разные тексты не дают спутать
// необратимое действие с обратимым (`RenderConsentAndAuthScreens` шаг 3).

import { useState } from 'react';

async function requestAccountDelete(scope: 'withdraw_consent' | 'erase_all'): Promise<boolean> {
  const response = await fetch('/api/v1/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ confirm: true, scope }),
  });
  return response.ok;
}

export function DeleteDataScreen() {
  const [pending, setPending] = useState<'withdraw_consent' | 'erase_all' | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const act = (scope: 'withdraw_consent' | 'erase_all'): void => {
    setPending(scope);
    void requestAccountDelete(scope)
      .then((ok) => setResult(ok ? (scope === 'withdraw_consent' ? 'Согласие отозвано, карточки закрыты.' : 'Удаление запущено, данные будут стёрты в течение 72 часов.') : 'Не удалось выполнить действие.'))
      .finally(() => setPending(null));
  };

  return (
    <main>
      <section>
        <p>Отозвать согласие: закроет ваши карточки сейчас, дневник останется.</p>
        <button type="button" disabled={pending !== null} onClick={() => act('withdraw_consent')}>
          Отозвать согласие
        </button>
      </section>
      <section>
        <p>Удалить всё: удалит аккаунт и все данные в течение 72 часов, действие необратимо.</p>
        <button type="button" disabled={pending !== null} onClick={() => act('erase_all')}>
          Удалить всё
        </button>
      </section>
      {result !== null ? <p role="status">{result}</p> : null}
    </main>
  );
}
