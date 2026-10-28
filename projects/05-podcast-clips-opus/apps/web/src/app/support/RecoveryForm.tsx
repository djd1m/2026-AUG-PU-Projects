'use client';
import { useEffect, useRef, useState } from 'react';
import { clearSupportIdentity, supportRequest, SupportError, takeFragmentToken, validPassword, type SupportAccount } from '../../lib/support-client';
export function RecoveryForm({ mode, account = null, mailAvailable }: { mode: 'verify' | 'forgot' | 'reset'; account?: SupportAccount; mailAvailable: boolean }) {
  const token = useRef('');
  const [hasToken, setHasToken] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => { token.current = takeFragmentToken(window.location, window.history); setHasToken(!!token.current); return () => { token.current = ''; }; }, []);
  const title = mode === 'verify' ? 'Подтвердить почту' : mode === 'forgot' ? 'Восстановить доступ' : 'Новый пароль';
  return <section className="auth-card support-card"><h1>{title}</h1>
    {mode === 'verify' && <p>{account ? `${account.email} — ${account.verified ? 'почта подтверждена' : 'почта пока не подтверждена'}.` : 'Войдите в тот же аккаунт, которому отправили письмо, затем снова откройте ссылку из письма. Подойдёт и другое устройство.'}</p>}
    {mode === 'reset' && <p>После смены пароля все сеансы КлипМейкера завершатся. Затем войдите с новым паролем. Это действие не подтверждает почту.</p>}
    {!mailAvailable && mode !== 'reset' && <p role="status">Отправка писем сейчас недоступна.</p>}
    {mode !== 'forgot' && !hasToken && <p>Для подтверждения действия откройте действующую ссылку из письма. Ссылка одноразовая.</p>}
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(''); setSuccess('');
      const form = e.currentTarget, data = new FormData(form);
      try {
        if (mode === 'forgot') {
          const result = await supportRequest<{ message: string }>('/api/auth/forgot', { email: String(data.get('email') ?? '') }); setSuccess(result.message);
        } else if (mode === 'verify') {
          await supportRequest('/api/auth/email/confirm', { token: token.current }); token.current = ''; setHasToken(false); setSuccess('Почта подтверждена. Можно вернуться в кабинет.');
        } else {
          const password = String(data.get('password') ?? '');
          if (!validPassword(password)) throw new Error('Пароль: от 8 символов и не более 72 байт UTF-8.');
          if (password !== data.get('repeat')) throw new Error('Пароли не совпадают.');
          clearSupportIdentity(); await supportRequest('/api/auth/reset', { token: token.current, password });
          token.current = ''; setHasToken(false); form.reset(); setSuccess('Пароль изменён. Войдите с новым паролем.');
        }
      } catch (cause) { setError(cause instanceof SupportError && cause.status === 401 ? 'Войдите в тот же аккаунт, затем снова откройте ссылку из письма.' : cause instanceof Error ? cause.message : 'Не удалось выполнить действие.'); }
      finally { setBusy(false); }
    }}>
      {mode === 'forgot' && <label>Почта<input name="email" type="email" autoComplete="email" required /></label>}
      {mode === 'reset' && <><label>Новый пароль<input name="password" type="password" minLength={8} autoComplete="new-password" required aria-describedby="password-help" /></label><p id="password-help" className="muted">От 8 символов, не более 72 байт UTF-8.</p><label>Повторите пароль<input name="repeat" type="password" autoComplete="new-password" required /></label></>}
      <button disabled={busy || !!success || (mode === 'forgot' ? !mailAvailable : !hasToken || (mode === 'verify' && !account))}>{busy ? 'Подождите…' : mode === 'forgot' ? 'Отправить инструкцию' : mode === 'verify' ? 'Подтвердить почту' : 'Сменить пароль'}</button>
    </form>
    {mode === 'verify' && account && !account.verified && <button className="secondary" disabled={busy || !mailAvailable} onClick={async () => {
      setBusy(true); setError(''); setSuccess(''); try { await supportRequest('/api/auth/email/send', {}); setSuccess('Запрос принят. Проверьте почту. Доставка письма не гарантирована.'); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Письмо недоступно.'); } finally { setBusy(false); }
    }}>Отправить новое письмо</button>}
    {error && <p role="alert">{error}</p>}{success && <p role="status" className="support-success">{success}</p>}
    <nav className="support-links" aria-label="Доступ к аккаунту"><a href="/#auth">Войти</a><a href="/dashboard">Кабинет</a><a href="/support">Поддержка</a></nav>
  </section>;
}
