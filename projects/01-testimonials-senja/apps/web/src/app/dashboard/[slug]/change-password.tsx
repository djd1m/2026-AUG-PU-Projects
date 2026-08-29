'use client';

// FR-010.4 — форма смены пароля в кабинете.
//
// Классы дизайн-системы (form / field / input / btn), а не сырой Tailwind: страж
// tests/design-tokens.test.ts проверяет и объявленность переменных, и то, что страница
// вообще пользуется системой. Форма входа однажды была свёрстана в обход и вышла
// «тёмное на тёмном».

import { useState } from 'react';

export function ChangePassword() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // account_id НЕ отправляется намеренно: сервер берёт его только из проверенной
        // сессии (NFR-010.7). Если бы поле было, оно всё равно не читалось бы.
        body: JSON.stringify({
          current_password: data.get('current_password'),
          new_password: data.get('new_password'),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось сменить пароль');
        return;
      }
      // Все сессии отозваны, а браузеру выдана новая cookie в этом же ответе — человек
      // остаётся в кабинете, а вошедший с украденной cookie выброшен.
      form.reset();
      setDone(true);
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 12, maxWidth: 420 }}>
      <label className="field">
        <span>Текущий пароль</span>
        <input
          name="current_password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </label>

      <label className="field">
        <span>Новый пароль</span>
        <input
          name="new_password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className="input"
        />
      </label>

      {error ? (
        <ul className="errors" role="alert">
          <li>{error}</li>
        </ul>
      ) : null}

      {done ? (
        <p className="small" role="status" style={{ marginTop: 4 }}>
          Пароль изменён. Все остальные устройства вышли из аккаунта — если кто-то
          пользовался вашей сессией, доступ у него больше нет.
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn btn--primary">
        {busy ? 'Меняем…' : 'Сменить пароль'}
      </button>
    </form>
  );
}
