'use client';

import { useState, type FormEvent } from 'react';
import type { AnswerData } from '@n6b/rag';

export function Sandbox({ botId }: { botId: string }) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AnswerData | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!question.trim() || question.length > 500) { setError('Введите вопрос от 1 до 500 символов'); return; }
    setPending(true); setError(null); setAnswer(null);
    try {
      const response = await fetch(`/api/bots/${botId}/ask`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const body = await response.json() as { data?: AnswerData; error?: { message?: string }; contact?: string | null };
      if (!response.ok || !body.data) {
        const message = body.error?.message ?? 'Ответ не получен. Повторите позже';
        setError(body.contact ? `${message}. Свяжитесь: ${body.contact}` : message);
      } else setAnswer(body.data);
    } catch { setError('Нет связи с сервисом. Проверьте соединение и отправьте вопрос снова'); }
    finally { setPending(false); }
  }

  return (
    <section className="sandbox" id={`sandbox-${botId}`} aria-labelledby={`sandbox-title-${botId}`}>
      <h3 id={`sandbox-title-${botId}`}>Песочница</h3>
      <p className="job-detail">Вопрос и найденные материалы передаются внешней модели через OpenRouter (OpenAI).</p>
      <form onSubmit={submit}>
        <label htmlFor={`question-${botId}`}>Вопрос по вашим материалам (до 500 символов)</label>
        <textarea id={`question-${botId}`} value={question} maxLength={500} rows={3}
          onChange={(event) => setQuestion(event.target.value)} disabled={pending} required />
        <p className="job-detail">{question.length}/500</p>
        <button type="submit" disabled={pending}>{pending ? 'Ищем ответ…' : 'Спросить'}</button>
      </form>
      <div aria-live="polite" aria-busy={pending}>
        {pending && <p role="status">Ищем ответ в ваших материалах…</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {answer && <>
          <p className="answer-text">{answer.answer_text}</p>
          {answer.citations.length > 0 && <ul aria-label="Источники ответа">
            {answer.citations.map((citation) => <li key={citation.chunk_id}>
              {citation.url ? <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.label}</a>
                : <span>{citation.label}</span>}
            </li>)}
          </ul>}
          {answer.show_cta && <div className="sandbox-cta">
            <p>Первый ответ с источником готов. Публикация станет доступна после подключения виджета и демо-страницы.
              Перед публикацией укажите контакт и разрешённый домен.</p>
            <button type="button" disabled>Вставить на сайт</button>
            <button type="button" disabled>Поделиться демо-страницей</button>
          </div>}
        </>}
      </div>
    </section>
  );
}
