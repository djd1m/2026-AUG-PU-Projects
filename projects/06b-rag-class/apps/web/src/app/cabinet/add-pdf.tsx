'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

export function AddPdf({ botId, busy }: { botId: string; busy: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { if (busy) setAccepted(false); }, [busy]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file || pending || busy || accepted) return;
    setError(null); setAccepted(false);
    if (file.size > 10 * 1024 * 1024) { setError('PDF должен быть не больше 10 МиБ'); return; }
    setPending(true);
    const body = new FormData(); body.append('file', file);
    const res = await fetch(`/api/bots/${botId}/sources`, { method: 'POST', credentials: 'same-origin', body }).catch(() => null);
    if (res?.status === 202) {
      setAccepted(true);
      if (input.current) input.current.value = '';
      router.refresh();
    } else {
      const data = await res?.json().catch(() => null) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? 'PDF не добавлен. Повторите');
    }
    setPending(false);
  }
  return (
    <form className="add-source" onSubmit={submit} aria-label="Добавить PDF">
      <label htmlFor={`pdf-${botId}`}>PDF до 10 МиБ и 300 страниц; на Free — до 3 файлов</label>
      <input id={`pdf-${botId}`} ref={input} type="file" accept="application/pdf,.pdf" required disabled={busy || pending || accepted} />
      <button type="submit" disabled={busy || pending || accepted}>{pending ? 'Загружаем PDF…' : 'Добавить PDF'}</button>
      {busy && <p className="job-detail">Идёт индексация — новый PDF можно добавить после неё.</p>}
      {accepted && <p role="status">PDF принят. Состояние индексации появится в списке источников.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </form>
  );
}
