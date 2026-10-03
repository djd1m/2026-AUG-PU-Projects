'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobView } from '@n6b/db';
import { JobStatus } from './job-status';

export async function submitSourceAction(sourceId: string, action: 'delete' | 'recrawl', send: typeof fetch = fetch):
  Promise<{ ok: boolean; jobId?: string; message: string }> {
  try {
    const response = await send(`/api/sources/${sourceId}${action === 'recrawl' ? '/recrawl' : ''}`,
      { method: action === 'delete' ? 'DELETE' : 'POST', credentials: 'same-origin' });
    if (action === 'delete' && response.status === 204) return { ok: true, message: 'Источник удалён' };
    const body = await response.json().catch(() => null) as { data?: { job_id?: string }; error?: { message?: string } } | null;
    if (action === 'recrawl' && response.status === 202 && typeof body?.data?.job_id === 'string')
      return { ok: true, jobId: body.data.job_id, message: 'Повторный обход начат' };
    return { ok: false, message: body?.error?.message ?? 'Действие не выполнено. Повторите позже' };
  } catch { return { ok: false, message: 'Нет ответа сервера. Повторите позже' }; }
}

export function SourceActions({ sourceId, botId, initial }: { sourceId: string; botId: string; initial: JobView | null }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function act(action: 'delete' | 'recrawl') {
    setPending(true); setMessage(null);
    const result = await submitSourceAction(sourceId, action);
    setPending(false); setMessage(result.message);
    if (!result.ok) return;
    setConfirming(false);
    if (action === 'delete') setDeleted(true);
    else if (result.jobId && result.jobId !== job?.job_id) setJob({ job_id: result.jobId, source_id: sourceId, state: 'running', progress_done: 0,
      progress_total: null, fragments: job?.fragments ?? 0, error: null, note: null });
    router.refresh();
  }
  if (deleted) return <p role="status">Источник удалён</p>;
  return <div>
    {job ? <JobStatus key={`${job.job_id}-${job.state}`} initial={job} botId={botId} />
      : <p className="job-detail">Задач индексации ещё не было.</p>}
    <div className="source-actions" aria-busy={pending}>
      <button type="button" disabled={pending} onClick={() => void act('recrawl')}>Переобойти</button>
      <button type="button" disabled={pending || job?.state === 'running'} onClick={() => setConfirming(true)}>Удалить источник</button>
      {confirming && <div role="group" aria-label="Подтверждение удаления источника">
        <p>Удалить источник и все его фрагменты? Это действие нельзя отменить.</p>
        <button type="button" disabled={pending} onClick={() => void act('delete')}>Подтвердить удаление</button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)}>Отмена</button>
      </div>}
    </div>
    {message && <p role="status" aria-live="polite">{message}</p>}
  </div>;
}
