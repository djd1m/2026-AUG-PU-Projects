'use client';

// Состояние задачи индексации по GET /api/jobs/{job_id}: опрос каждые 2 с, пока задача жива. Молчание ответа не читается
// как «выполняется»: сбой чтения показывается отдельной строкой, а последнее известное состояние остаётся на экране.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type JobPayload, jobScreen } from '@/lib/job-view';

const POLL_MS = 2000;

export function JobStatus({ initial, botId }: { initial: JobPayload; botId?: string }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const screen = jobScreen(job);

  useEffect(() => {
    if (!screen.live) return undefined;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.job_id}`, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) { setReadError('Нет ответа о состоянии задачи — проверяем снова'); return; }
      setReadError(null);
      const next = ((await res.json()) as { data: JobPayload }).data;
      setJob(next);
      if (!jobScreen(next).live) router.refresh(); // вернуть кнопку добавления источника
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [screen.live, job.job_id, router]);

  async function retry() {
    setPending(true);
    const res = await fetch(`/api/jobs/${job.job_id}/retry`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    setPending(false);
    if (res?.status === 202) { setJob({ ...job, state: 'running', error: null }); router.refresh(); return; }
    setReadError('Повтор не принят. Обновите страницу');
  }

  return (
    <div className={`job job-${screen.kind}`} data-job-id={job.job_id} data-state={screen.kind} aria-live="polite">
      <p className="job-title">{screen.title}</p>
      {screen.detail && <p className="job-detail">{screen.detail}</p>}
      {screen.action?.kind === 'retry' && (
        <button type="button" onClick={retry} disabled={pending}>{screen.action.label}</button>
      )}
      {screen.action?.kind === 'sandbox' && botId && (
        <a href={`#sandbox-${botId}`}>{screen.action.label}</a>
      )}
      {readError && <p className="auth-error" role="alert">{readError}</p>}
    </div>
  );
}
