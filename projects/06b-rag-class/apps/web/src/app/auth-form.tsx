'use client';

// Форма входа/регистрации (FR-n6b-1, экран добавлен в foundation по решению координатора — 08_review.md F-9).
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { type AuthAction, submitAuth } from '@/lib/auth-client';

export function AuthForm({ action }: { action: AuthAction }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const outcome = await submitAuth(action, {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      kind: form.get('kind') === 'studio' ? 'studio' : 'owner',
    });
    setPending(false);
    if (outcome.ok) router.push('/cabinet');
    else setError(outcome.message);
  }

  const register = action === 'register';
  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <label>
        Пароль
        <input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
          required minLength={10} />
      </label>
      {register && (
        <fieldset>
          <legend>Кто вы</legend>
          <label className="choice"><input type="radio" name="kind" value="owner" defaultChecked /> Владелец сайта</label>
          <label className="choice"><input type="radio" name="kind" value="studio" /> Студия (сайты клиентов)</label>
        </fieldset>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Отправляем…' : register ? 'Зарегистрироваться' : 'Войти'}
      </button>
    </form>
  );
}
