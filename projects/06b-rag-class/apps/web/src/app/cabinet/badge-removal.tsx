'use client';

import { useState } from 'react';

export async function submitBadgeRemoval(request: typeof fetch = fetch): Promise<boolean> {
  const response = await request('/api/account/badge-removal-intent', { method: 'POST', credentials: 'same-origin' })
    .catch(() => null);
  return response?.ok ?? false;
}

export function BadgeRemoval() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setPending(true); setError(null);
    if (await submitBadgeRemoval()) setMessage('Скоро: ~990 ₽/мес, оставьте заявку. Заявка получена; бейдж остаётся.');
    else setError('Не удалось оставить заявку. Повторите позже.');
    setPending(false);
  }
  return <section aria-label="Бейдж">
    <button type="button" disabled={pending} onClick={submit}>Убрать бейдж</button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
  </section>;
}
