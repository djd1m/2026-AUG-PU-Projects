'use client';

import { useState } from 'react';

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    if (data.get('new_password') !== data.get('new_password_confirm')) {
      setError('пароль и подтверждение не совпадают');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, new_password: data.get('new_password') }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось задать пароль');
        return;
      }
      setDone(true);
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="small" role="status" style={{ marginTop: 20 }}>
        Пароль изменён. <a href="/login">Войдите</a> новым паролем.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 20 }}>
      <label className="field">
        <span>Новый пароль</span>
        <input
          name="new_password" type="password" required minLength={8} maxLength={200}
          autoComplete="new-password" className="input"
        />
      </label>
      <label className="field">
        <span>Ещё раз</span>
        <input
          name="new_password_confirm" type="password" required minLength={8} maxLength={200}
          autoComplete="new-password" className="input"
        />
      </label>

      {error ? <ul className="errors" role="alert"><li>{error}</li></ul> : null}

      <button type="submit" disabled={busy} className="btn btn--primary btn--block">
        {busy ? 'Сохраняем…' : 'Сохранить пароль'}
      </button>
    </form>
  );
}
