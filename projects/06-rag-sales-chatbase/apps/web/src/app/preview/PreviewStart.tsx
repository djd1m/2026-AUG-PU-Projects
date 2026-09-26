'use client';
// Запуск предпросмотра: POST /api/preview { url } с Idempotency-Key. Ключ живёт в sessionStorage на пару (вкладка,
// адрес): повтор после обрыва ответа получает ТУ ЖЕ задачу, а не второй предпросмотр (квота :create — 1 в сутки).
// Адрес с лендинга (?url=) отправляется сам один раз — владелец уже нажал «Создать бота».
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function idempotencyKey(url: string): string {
  const name = `n6_preview_key:${url}`;
  try {
    const known = sessionStorage.getItem(name);
    if (known) return known;
    const key = crypto.randomUUID();
    sessionStorage.setItem(name, key);
    return key;
  } catch { return crypto.randomUUID(); } // хранилище недоступно — ключ живёт один запрос
}
export function PreviewStartForm({ url, busy, error, onUrl, onSubmit }: { url: string; busy: boolean; error: string; onUrl: (v: string) => void; onSubmit: () => void }) {
  return <section className="preview-status stack" aria-labelledby="start-title">
    <h1 id="start-title" className="page-title">Соберём бота по вашему сайту</h1>
    <form className="url-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="site-url">Адрес вашего сайта</label>
      <div className="url-row">
        <input id="site-url" name="url" type="text" inputMode="url" autoComplete="url" spellCheck={false} required
          placeholder="например, stomatologia-ulybka.ru" value={url} onChange={(event) => onUrl(event.target.value)} disabled={busy} />
        <button type="submit" disabled={busy}>{busy ? 'Запускаем…' : 'Создать бота'}</button>
      </div>
      {error && <p role="alert" className="chat-error">{error}</p>}
      <p className="muted">Бесплатно, до 20 страниц. Регистрация — только чтобы сохранить бота.</p>
    </form>
  </section>;
}
export function PreviewStart({ initialUrl }: { initialUrl: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const submit = async (value: string) => {
    const site = value.trim();
    if (!site) { setError('Введите адрес сайта'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/preview', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey(site) }, body: JSON.stringify({ url: site }) });
      const body: unknown = await response.json().catch(() => null);
      const id = response.status === 202 && typeof body === 'object' && body !== null && 'data' in body
        ? (body as { data: { index_job_id?: unknown } }).data.index_job_id : null;
      if (typeof id === 'string') { router.replace(`/preview/${encodeURIComponent(id)}`); return; }
      const failure = typeof body === 'object' && body !== null && 'error' in body ? (body as { error: { message?: unknown } }).error.message : null;
      setError(typeof failure === 'string' ? failure : 'Не удалось запустить чтение сайта. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); }
    setBusy(false);
  };
  useEffect(() => {
    if (initialUrl && !started.current) { started.current = true; void submit(initialUrl); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);
  return <PreviewStartForm url={url} busy={busy} error={error} onUrl={setUrl} onSubmit={() => { void submit(url); }} />;
}
