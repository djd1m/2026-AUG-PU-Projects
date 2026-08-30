'use client';

import { useState } from 'react';

export function PartnerLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/partner/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: data.get('token') }),
      });
      if (!res.ok) {
        // Текст берём с сервера как есть: он намеренно одинаков для неизвестного ключа и
        // отозванного кода — различать их на клиенте значило бы вернуть тот же оракул.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось войти');
        return;
      }
      window.location.assign('/partner/dashboard');
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 20 }}>
      <label className="field">
        <span>Ключ доступа</span>
        <input name="token" type="password" required autoComplete="off" className="input" />
      </label>

      {error ? (
        <ul className="errors" role="alert">
          <li>{error}</li>
        </ul>
      ) : null}

      <button type="submit" disabled={busy} className="btn btn--primary btn--block">
        {busy ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  );
}
