'use client';

import { useState } from 'react';
import { safeNextPath } from '@/lib/next-path';

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (!res.ok) {
        // Текст берём с сервера как есть: он намеренно одинаков для неверного пароля и
        // несуществующей учётки — различать их на клиенте значило бы вернуть тот же оракул.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось войти');
        return;
      }
      const body = (await res.json()) as { projects?: { slug: string }[] };
      const target =
        safeNextPath(next) ??
        (body.projects?.[0] ? `/dashboard/${body.projects[0].slug}` : '/');
      window.location.assign(target);
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 20 }}>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="input" />
      </label>

      <label className="field">
        <span>Пароль</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
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
