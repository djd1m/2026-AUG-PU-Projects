'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc } from '../lib/rpc';
export function AuthForm() {
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  return <form className="auth-card" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(e.currentTarget);
    try {
      if (!signedIn) {
        const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Не удалось войти');
        setSignedIn(true);
      }
      const explicit = String(form.get('partner_code') ?? '').trim();
      await rpc('code.apply', explicit ? { code: explicit } : {}, true);
      router.push('/dashboard'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Нет связи с сервером'); } finally { setBusy(false); }
  }}><h2>{register ? 'Создать аккаунт' : 'Войти в КлипМейкер'}</h2><label>Почта<input name="email" type="email" autoComplete="email" required /></label>
    <label>Пароль<input name="password" type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
    <label>Код партнёра, если есть<input name="partner_code" autoComplete="off" maxLength={12} /></label>
    <button disabled={busy}>{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти →'}</button>
    {!signedIn && <button type="button" className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>}
    {signedIn && error && <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await rpc('code.apply', { discard_referral: true }, true); router.push('/dashboard'); router.refresh(); }
      catch { setError('Не удалось продолжить. Повторите позже'); } finally { setBusy(false); }
    }}>Продолжить без применения кода</button>}
    {error && <p role="alert">{error}</p>}</form>;
}
