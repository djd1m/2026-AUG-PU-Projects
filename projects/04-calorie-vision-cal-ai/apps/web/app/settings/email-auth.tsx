'use client';

// Вход по почте и паролю — PWA-родной вход (OWN-012). Регистрация не предшествует ценности:
// форма живёт в настройках, и посетитель приходит сюда, когда ему нужно то, что живёт дольше
// устройства (подписка, кабинет). Вход и регистрация СВЯЗЫВАЮТ текущую анонимную сессию с
// аккаунтом — дневник и карточки переезжают, что и показывается после входа.

import { useCallback, useEffect, useState } from 'react';
import { fetchMe, LOGIN_URL, logout, REGISTER_URL, submitCredentials, type Me } from '../auth/auth-request';

type Mode = 'login' | 'register';

export function EmailAuth({ onChange }: { readonly onChange?: (me: Me) => void }): React.JSX.Element {
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const current = await fetchMe();
    setMe(current);
    onChange?.(current);
  }, [onChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const outcome = await submitCredentials(mode === 'login' ? LOGIN_URL : REGISTER_URL, email, password);
    setPending(false);
    if (outcome.kind === 'ok') {
      setPassword('');
      setNotice({
        kind: 'ok',
        text:
          mode === 'register'
            ? 'Аккаунт создан. Всё, что вы делали на этом устройстве, теперь привязано к нему.'
            : outcome.diaryMigrated > 0
              ? `Вы вошли. Записей дневника перенесено на аккаунт: ${outcome.diaryMigrated}.`
              : 'Вы вошли.',
      });
      await refresh();
      return;
    }
    setNotice({ kind: 'error', text: outcome.message });
  };

  if (me === null) return <p className="muted">Проверяем вход…</p>;

  if (me.authenticated) {
    return (
      <section className="card">
        <p>
          Вы вошли как <strong>{me.email ?? 'аккаунт Telegram'}</strong>
          {me.partner ? ' · партнёр' : ''}
          {me.owner ? ' · владелец' : ''}
        </p>
        {me.partner || me.owner ? (
          <a className="btn btn--primary btn--wide" href="/cabinet">
            Открыть кабинет
          </a>
        ) : null}
        <button
          type="button"
          className="btn btn--ghost btn--wide"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void logout().then(refresh).finally(() => setPending(false));
          }}
        >
          Выйти на этом устройстве
        </button>
        {notice !== null ? <p className={notice.kind === 'error' ? 'limit__error' : 'muted'}>{notice.text}</p> : null}
      </section>
    );
  }

  return (
    <section className="card">
      <nav className="cabinet__windows" aria-label="вход или регистрация">
        <button type="button" className={`btn btn--tiny ${mode === 'login' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMode('login')}>
          войти
        </button>
        <button type="button" className={`btn btn--tiny ${mode === 'register' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMode('register')}>
          зарегистрироваться
        </button>
      </nav>
      <form className="limit__form" onSubmit={(e) => void submit(e)}>
        <div className="limit__field">
          <label htmlFor="auth-email">Почта</label>
          <input id="auth-email" className="stepper__input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="limit__field">
          <label htmlFor="auth-password">Пароль{mode === 'register' ? ' (от 8 знаков)' : ''}</label>
          <input
            id="auth-password"
            className="stepper__input"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary btn--wide" disabled={pending}>
          {pending ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
        {notice !== null ? (
          <p className={notice.kind === 'error' ? 'limit__error' : 'muted'} role={notice.kind === 'error' ? 'alert' : undefined}>
            {notice.text}
          </p>
        ) : null}
      </form>
      <p className="muted">Аккаунт нужен для подписки и кабинета. Снимать и вести дневник можно и без него.</p>
    </section>
  );
}
