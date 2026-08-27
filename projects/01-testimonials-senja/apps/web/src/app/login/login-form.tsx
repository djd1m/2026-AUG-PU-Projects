'use client';

import { useState } from 'react';

/**
 * `?next=` принимается ТОЛЬКО как относительный путь (FR-009.5).
 *
 * Проверка «начинается со слеша» дырявая: `//evil.example/x` тоже начинается со слеша и
 * является протокол-относительным адресом. Этот же дефект уже ловился в виджете, поэтому
 * здесь сразу точная форма пути, а не префикс.
 */
function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  return /^\/[A-Za-z0-9/_-]*$/.test(value) ? value : null;
}

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
        // несуществующей учётки — различать их на клиенте было бы возвратом того же оракула.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось войти');
        return;
      }
      const body = (await res.json()) as { projects?: { slug: string }[] };
      const target =
        safeNext(next) ??
        (body.projects?.[0] ? `/dashboard/${body.projects[0].slug}` : '/');
      window.location.assign(target);
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Почта
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Пароль
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger,#b00)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  );
}
