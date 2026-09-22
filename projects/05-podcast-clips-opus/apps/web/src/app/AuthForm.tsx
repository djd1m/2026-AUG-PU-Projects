'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function AuthForm() {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  return <form className="auth-card" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Не удалось войти');
      router.push('/dashboard'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Нет связи с сервером'); } finally { setBusy(false); }
  }}><h2>{register ? 'Создать аккаунт' : 'Войти в КлипМейкер'}</h2><label>Почта<input name="email" type="email" autoComplete="email" required /></label>
    <label>Пароль<input name="password" type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
    <button disabled={busy}>{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти →'}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
    {error && <p role="alert">{error}</p>}</form>;
}
