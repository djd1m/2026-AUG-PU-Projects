'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MetricControls() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function verify() {
    setSubmitting(true);
    try {
      const response = await fetch('/admin/metrics/verify', { method: 'POST', credentials: 'same-origin' });
      setMessage(response.status === 202
        ? 'Проверка запущена (до 5 страниц, до 60 секунд). Обновите метрики позже. Следующий запуск продолжит обход.'
        : response.status === 409 ? 'Проверка уже идёт. Обновите метрики позже.' : 'Не удалось запустить проверку. Повторите позже.');
    } catch { setMessage('Не удалось запустить проверку. Повторите позже.'); }
    finally { setSubmitting(false); }
  }
  return <section aria-label="Перепроверка страниц">
    <button type="button" onClick={verify} disabled={submitting}>Перепроверить страницы</button>{' '}
    <button type="button" onClick={() => router.refresh()}>Обновить метрики</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
