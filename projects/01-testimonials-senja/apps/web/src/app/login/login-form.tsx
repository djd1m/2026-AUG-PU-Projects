'use client';

import { useEffect, useState } from 'react';
import { safeNextPath } from '@/lib/next-path';
import { isReturnLoop, LOOP_MARKER_KEY, makeLoopMarker } from '@/lib/login-loop';

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loop, setLoop] = useState(false);

  // M-4: вернулись сюда после успешного входа за тем же адресом — значит cookie
  // до сервера не доезжает, и без этой проверки человек крутился бы молча.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LOOP_MARKER_KEY);
      sessionStorage.removeItem(LOOP_MARKER_KEY); // одна диагностика на цикл
      if (isReturnLoop(raw, safeNextPath(next), Date.now())) setLoop(true);
    } catch {
      // sessionStorage может быть недоступен (приватный режим, политика) — тогда
      // просто нет диагностики. Молчаливая деградация здесь уместна: она не хуже
      // прежнего поведения, а падение формы было бы хуже.
    }
  }, [next]);

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
      // L-3 ревью: владелец без активных проектов уезжал на лендинг без объяснения —
      // выглядит как «вход не сработал». Такое возможно после деактивации проекта.
      if (!safeNextPath(next) && !body.projects?.[0]) {
        setError('Вход выполнен, но активных проектов нет. Создайте новый на главной.');
        return;
      }
      const target =
        safeNextPath(next) ??
        `/dashboard/${body.projects![0]!.slug}`;
      try {
        sessionStorage.setItem(LOOP_MARKER_KEY, makeLoopMarker(target, Date.now()));
      } catch { /* см. выше */ }
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

      {loop ? (
        <ul className="errors" role="alert">
          <li>
            Вход проходит, но сессия не сохраняется — вас вернуло сюда. Обычно это
            означает, что сайт открыт по <code>http://</code>, а cookie сессии помечена
            как защищённая и браузер её отбрасывает. Откройте адрес по <code>https://</code>.
          </li>
        </ul>
      ) : null}

      {error ? (
        <ul className="errors" role="alert">
          <li>{error}</li>
        </ul>
      ) : null}

      <button type="submit" disabled={busy} className="btn btn--primary btn--block">
        {busy ? 'Проверяем…' : 'Войти'}
      </button>

      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        <a href="/forgot">Забыли пароль?</a>
      </p>
    </form>
  );
}
