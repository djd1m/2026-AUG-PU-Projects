'use client';

// Добавление сайта-источника: POST /api/bots/{id}/sources → 202 {job_id}. Кнопка погашена, пока у бота есть живая задача
// (SC-US-004-1) и пока запрос в полёте: двойной клик не запускает третью копию (а сервер всё равно вернёт тот же job_id).

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function AddSource({ botId, busy }: { botId: string; busy: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/bots/${botId}/sources`, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) }).catch(() => null);
    setPending(false);
    if (res?.status === 202) { setUrl(''); router.refresh(); return; }
    const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
    setError(body?.error?.message ?? 'Источник не добавлен. Повторите');
  }

  return (
    <form className="add-source" onSubmit={submit}>
      <input type="url" required placeholder="https://ваш-сайт.ru" value={url} onChange={(e) => setUrl(e.target.value)}
        aria-label="Адрес сайта" disabled={busy || pending} />
      <button type="submit" disabled={busy || pending}>Добавить сайт</button>
      {busy && <p className="job-detail">Идёт индексация — новый источник можно добавить после неё.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </form>
  );
}
