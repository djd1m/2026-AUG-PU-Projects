'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { errorMessage, onboardingApi } from './api';
import { ErrorNotice } from './shell';

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await onboardingApi.login({
        identity: String(form.get('identity') ?? ''),
        password: String(form.get('password') ?? ''),
      });
      router.push('/onboarding');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <section className="card auth-card" aria-labelledby="login-title">
      <h2 id="login-title">Вход</h2>
      <form method="post" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Электронная почта</span>
          <input name="identity" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={400} />
        </label>
        {error ? <ErrorNotice message={error} /> : null}
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="card-note">Есть новое приглашение? <Link href="/join">Принять его</Link></p>
    </section>
  );
}
