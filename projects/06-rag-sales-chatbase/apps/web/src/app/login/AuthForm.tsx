'use client';
// из N5: projects/05-podcast-clips-opus/apps/web/src/app/AuthForm.tsx (коммит 90fe80a) — адаптировано: итог сохранения предпросмотра (preview-flow), без кода партнёра
// (фича partner-and-studio) и без tRPC; ответы API N6 — { data } | { error: { code, message } } (foundation, auth-handler).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function AuthForm({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const [register, setRegister] = useState(initialMode === 'register'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  return <form id="auth" className="auth-card" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body) ?? 'Не удалось войти. Повторите позже');
      router.push(afterLogin(body)); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Нет связи с сервером'); } finally { setBusy(false); }
  }}><h1>{register ? 'Создать аккаунт' : 'Войти в Суфлёр'}</h1>
    <label>Почта<input id="auth-email" name="email" type="email" autoComplete="email" required /></label>
    <label>Пароль<input name="password" type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
    <button disabled={busy}>{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>
      {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
    {error && <p role="alert">{error}</p>}</form>;
}
// preview-flow: сервер сохранил (или не смог сохранить) бот предпросмотра по cookie — кабинет показывает итог.
const PREVIEW_OUTCOMES: Readonly<Record<string, string>> = { claimed: '?saved=1', already_claimed: '?saved=1', expired: '?preview=expired',
  not_found: '?preview=expired', plan_limit: '?preview=plan_limit', unavailable: '?preview=unavailable' };
function afterLogin(body: unknown): string {
  const data = typeof body === 'object' && body !== null && 'data' in body ? (body as { data: { preview?: unknown } }).data : null;
  const outcome = data && typeof data.preview === 'string' ? PREVIEW_OUTCOMES[data.preview] : undefined;
  return `/dashboard${outcome ?? ''}`;
}
// Текст отказа берётся только из закрытой формы ответа; любое другое тело — общий текст, а не сырой JSON.
function errorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  return null;
}
