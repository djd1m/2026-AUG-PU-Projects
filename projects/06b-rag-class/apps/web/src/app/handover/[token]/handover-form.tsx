'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export async function submitHandover(token: string, email: string, password: string, keep: boolean,
  fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetchImpl(`/api/handover/${encodeURIComponent(token)}`, { method: 'POST',
      credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, keep_studio_access: keep }) });
    const body = await response.json();
    return response.status === 200 && body.data?.ok === true ? { ok: true, message: 'Аккаунт принят.' }
      : { ok: false, message: body.error?.message ?? 'Не удалось принять аккаунт. Повторите' };
  } catch { return { ok: false, message: 'Не удалось связаться с сервером. Повторите' }; }
}
export function HandoverForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setMessage('');
    const result = await submitHandover(token, String(form.get('email') ?? ''), String(form.get('password') ?? ''),
      form.get('keep_studio_access') === 'on');
    setMessage(result.message);
    if (result.ok) { router.push('/cabinet'); router.refresh(); }
    setPending(false);
  }
  return <form className="auth-form" onSubmit={submit} aria-label="Приём аккаунта">
    <label htmlFor="handover-email">E-mail<input id="handover-email" type="email" name="email"
      autoComplete="email" required maxLength={254} disabled={pending} /></label>
    <label htmlFor="handover-password">Пароль (от 10 символов)<input id="handover-password" type="password"
      name="password" autoComplete="new-password" required minLength={10} disabled={pending} /></label>
    <label className="choice"><input type="checkbox" name="keep_studio_access" disabled={pending} />
      Оставить доступ студии</label>
    <p role="status" aria-live="polite" className="auth-error">{message}</p>
    <button type="submit" disabled={pending}>{pending ? 'Принимаем…' : 'Принять аккаунт'}</button>
  </form>;
}
