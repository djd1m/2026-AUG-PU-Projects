'use client';

import { useState, type FormEvent } from 'react';
import type { AnswerData } from '@n6b/rag';
import type { DemoView } from '@/server/demo-view';
import { citationHref } from '@/lib/demo-presentation';

export function DemoAnswer({ answer }: { answer: AnswerData }) {
  return <><p className="answer-text">{answer.answer_text}</p>
    {answer.citations.length > 0 && <ul aria-label="Источники ответа">{answer.citations.map((citation) => {
      const href = citationHref(citation.url);
      return <li key={citation.chunk_id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.label}</a>
        : <span>{citation.label}</span>}</li>;
    })}</ul>}</>;
}

export function DemoChat({ slug, config }: { slug: string; config: DemoView }) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AnswerData | null>(null);
  const [retryAfter, setRetryAfter] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!question.trim() || question.length > 500) { setError('Введите вопрос от 1 до 500 символов'); return; }
    setPending(true); setError(null); setAnswer(null); setRetryAfter(null);
    try {
      const response = await fetch(`/api/demo/${encodeURIComponent(slug)}/ask`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const body = await response.json() as { data?: AnswerData; error?: { message?: string }; contact?: string | null };
      if (!response.ok || !body.data) {
        const message = body.error?.message ?? 'Ответ не получен. Повторите позже';
        const contact = body.contact ?? config.contact;
        setError(contact ? `${message}. Свяжитесь: ${contact}` : message);
        setRetryAfter(response.headers.get('Retry-After'));
      } else setAnswer(body.data);
    } catch { setError('Нет связи с сервисом. Проверьте соединение и отправьте вопрос снова'); }
    finally { setPending(false); }
  }

  return <section className="sandbox" aria-label="Чат с ботом">
    <p className="job-detail" id="demo-privacy">{config.privacy_notice}</p>
    <form onSubmit={submit}>
      <label htmlFor="demo-question">Вопрос (до 500 символов)</label>
      <textarea id="demo-question" value={question} maxLength={500} rows={3} required
        aria-describedby="demo-privacy" disabled={pending || !config.privacy_notice}
        onChange={(event) => setQuestion(event.target.value)} />
      <button type="submit" disabled={pending || !config.privacy_notice}>{pending ? 'Ищем ответ…' : error ? 'Повторить вопрос' : 'Спросить'}</button>
    </form>
    <div aria-live="polite" aria-busy={pending}>
      {pending && <p role="status">Ищем ответ в материалах сайта…</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {retryAfter && <p>Повторите через {retryAfter} сек.</p>}
      {answer && <DemoAnswer answer={answer} />}
    </div>
    {config.badge_required && <p><a href={config.badge_url}>Создать своего бота</a></p>}
  </section>;
}
