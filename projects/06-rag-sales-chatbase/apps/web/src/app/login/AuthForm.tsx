'use client';
// из N5: projects/05-podcast-clips-opus/apps/web/src/app/AuthForm.tsx (коммит 90fe80a) — адаптировано: итог сохранения предпросмотра (preview-flow),
// необязательный код партнёра при регистрации (partner-and-studio, FR-PARTNER-001: неверный — ошибка поля) и без tRPC; ответы API N6 — { data } | { error: { code, message } } (foundation, auth-handler).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorOf } from '../../lib/api-client';
export function AuthForm({ initialMode = 'login', next = null }: { initialMode?: 'login' | 'register'; next?: string | null }) {
  const [register, setRegister] = useState(initialMode === 'register'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [codeError, setCodeError] = useState('');
  const router = useRouter();
  return <form id="auth" className="auth-card" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setCodeError('');
    const form = new FormData(event.currentTarget);
    const code = typeof form.get('partner_code') === 'string' ? String(form.get('partner_code')).trim() : '';
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password'), ...(register && code ? { partner_code: code } : {}) }) });
      const body: unknown = await response.json().catch(() => null);
      const problem = errorOf(body);
      if (!response.ok && problem?.field === 'partner_code') { setCodeError(problem.message); return; }
      if (!response.ok) throw new Error(errorMessage(body) ?? 'Не удалось войти. Повторите позже');
      router.push(afterLogin(body, next)); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Нет связи с сервером'); } finally { setBusy(false); }
  }}><h1>{register ? 'Создать аккаунт' : 'Войти в Суфлёр'}</h1>
    <label>Почта<input id="auth-email" name="email" type="email" autoComplete="email" required /></label>
    <label>Пароль<input name="password" type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
    {register && <label>Код партнёра или студии (если есть)<input name="partner_code" type="text" maxLength={40} autoComplete="off" spellCheck={false}
      aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? 'auth-code-error' : undefined} /></label>}
    {register && codeError && <p id="auth-code-error" className="field-error">{codeError}</p>}
    <button disabled={busy}>{busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); setCodeError(''); }}>
      {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
    {error && <p role="alert">{error}</p>}</form>;
}
// preview-flow: сервер сохранил (или не смог сохранить) бот предпросмотра по cookie — кабинет показывает итог.
const PREVIEW_OUTCOMES: Readonly<Record<string, string>> = { claimed: '?saved=1', already_claimed: '?saved=1', expired: '?preview=expired',
  not_found: '?preview=expired', plan_limit: '?preview=plan_limit', unavailable: '?preview=unavailable' };
// next уже проверен страницей (safeNextPath) и ВАЖНЕЕ итога предпросмотра: человек явно выбрал тариф (ревью фичи 14,
// находка 7); сохранённый бот никуда не денется — он в кабинете.
function afterLogin(body: unknown, next: string | null): string {
  if (next) return next;
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
