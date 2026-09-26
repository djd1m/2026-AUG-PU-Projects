'use client';
// Контейнер экрана предпросмотра: опрос GET /api/preview/{index_job_id} раз в 2 с (long-job-contract), вопросы в
// POST …/ask, сохранение — POST …/claim (вошедший) или регистрация (cookie предпросмотра сохранит бота сервер).
// Разметка — PreviewViews (её же проверяет прибор адаптивности). История диалога — на СЕРВЕРЕ: клиент шлёт только вопрос.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PreviewChat, PreviewProgress, type ChatMessage, type PreviewJobView, type PreviewSiteView } from '../PreviewViews';

const POLL_MS = 2000;
interface ReadData extends PreviewJobView { site?: PreviewSiteView | null; questions_left?: number }
function errorOf(body: unknown): { code: string; message: string } | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null;
}
const dataOf = <T,>(body: unknown): T | null => (typeof body === 'object' && body !== null && 'data' in body ? (body as { data: T }).data : null);

export function PreviewScreen({ jobId, signedIn }: { jobId: string; signedIn: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<ReadData | null>(null);
  const [gone, setGone] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/preview/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        const body: unknown = await response.json().catch(() => null);
        if (stopped.current) return;
        if (!response.ok) {
          const failure = errorOf(body);
          if (response.status === 404) { setGone(failure?.message ?? 'Предпросмотр не найден. Создайте бота заново'); return; }
          setError(failure?.message ?? 'Нет связи с сервером — повторяем');
        } else {
          const data = dataOf<ReadData>(body);
          if (data) {
            setView(data); setError('');
            if (typeof data.questions_left === 'number') setLeft(data.questions_left);
            if (data.state === 'done' || data.state === 'failed') return; // конечные состояния — опрос окончен
          }
        }
      } catch { if (!stopped.current) setError('Нет связи с сервером — повторяем'); }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { stopped.current = true; if (timer) clearTimeout(timer); };
  }, [jobId]);

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/preview/${encodeURIComponent(jobId)}/ask`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 429 && errorOf(body)?.code === 'limit_preview') {
        setMessages((m) => [...m, { kind: 'question', text: question }, { kind: 'refused', text: errorOf(body)!.message }]); setLeft(0); setDraft(''); return;
      }
      const data = dataOf<{ status: string; text: string; source?: { title: string; url: string | null; excerpt: string }; first_answer?: boolean }>(body);
      if (!response.ok || !data) { setError(errorOf(body)?.message ?? 'Не удалось получить ответ. Повторите'); return; }
      const reply: ChatMessage = data.status === 'answered' && data.source
        ? { kind: 'answered', text: data.text, source: data.source, firstAnswer: data.first_answer === true }
        : { kind: 'unknown', text: data.text };
      setMessages((m) => [...m, { kind: 'question', text: question }, reply]);
      setLeft((n) => (n === null ? null : Math.max(0, n - 1)));
      setDraft('');
    } catch { setError('Нет связи с сервером. Повторите'); } finally { setBusy(false); }
  }, [busy, jobId]);

  const save = useCallback(async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/preview/${encodeURIComponent(jobId)}/claim`, { method: 'POST' });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) { router.push('/dashboard?saved=1'); router.refresh(); return; }
      if (response.status === 401) { router.push('/login?mode=register&from=preview'); return; }
      setError(errorOf(body)?.message ?? 'Не удалось сохранить бота. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); } finally { setSaving(false); }
  }, [jobId, router]);

  if (gone) {
    return <section className="preview-status stack" aria-labelledby="preview-title">
      <h1 id="preview-title" className="page-title">Предпросмотр недоступен</h1>
      <p className="notice">{gone}</p>
      <p><a className="button" href="/#site-url">Создать бота по адресу сайта</a></p>
    </section>;
  }
  if (!view) return <p role="status" className="muted">Загружаем состояние задачи…</p>;
  if (view.state !== 'done' || !view.site) return <PreviewProgress host={view.site?.host ?? ''} view={view} />;
  return <PreviewChat site={view.site} messages={messages} questionsLeft={left} draft={draft} busy={busy} error={error}
    signedIn={signedIn} saving={saving} onDraft={setDraft} onAsk={(q) => { void ask(q); }} onSave={() => { void save(); }} />;
}
