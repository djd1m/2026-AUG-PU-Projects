'use client';

import { useState, type FormEvent } from 'react';
import type { PublicationData } from '@/server/publish-handler';
import { publicationDemoPath } from '@/lib/demo-presentation';

type SubmitResult = { ok: true; data: PublicationData } | { ok: false; message: string };

export async function submitPublication(botId: string, contact: string, origins: string,
  request: typeof fetch = fetch, demoEnabled?: boolean): Promise<SubmitResult> {
  try {
    const response = await request(`/api/bots/${botId}/publish`, { method: 'PATCH', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact,
        allowed_origins: origins.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        ...(demoEnabled === undefined ? {} : { demo_enabled: demoEnabled }) }) });
    const body = await response.json() as { data?: PublicationData; error?: { message?: string } };
    if (!response.ok || !body.data?.published || !body.data.contact || !body.data.embed_code
      || !Array.isArray(body.data.allowed_origins) || (demoEnabled === true && !publicationDemoPath(body.data))) {
      return { ok: false, message: body.error?.message ?? 'Публикация не сохранена. Повторите позже' };
    }
    return { ok: true, data: body.data };
  } catch { return { ok: false, message: 'Нет связи с сервисом. Проверьте соединение и сохраните снова' }; }
}

export function PublishBot({ initial, proposedOrigins, onDemoSaved }: { initial: PublicationData; proposedOrigins: string[];
  onDemoSaved?: (path: string | null) => void }) {
  const [contact, setContact] = useState(initial.contact ?? '');
  const [origins, setOrigins] = useState(proposedOrigins.join('\n'));
  const [embedCode, setEmbedCode] = useState(initial.embed_code);
  const [demoEnabled, setDemoEnabled] = useState(initial.demo_enabled);
  const [demoPath, setDemoPath] = useState(publicationDemoPath(initial));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const edit = () => { setEmbedCode(null); setDemoPath(null); setSaved(false); setError(null); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(null); setSaved(false); setEmbedCode(null); setDemoPath(null);
    const result = await submitPublication(initial.id, contact, origins, fetch, demoEnabled);
    if (result.ok) {
      setContact(result.data.contact ?? ''); setOrigins(result.data.allowed_origins.join('\n'));
      setEmbedCode(result.data.embed_code); setSaved(true);
      setDemoEnabled(result.data.demo_enabled); setDemoPath(publicationDemoPath(result.data));
      onDemoSaved?.(publicationDemoPath(result.data));
    } else setError(result.message);
    setPending(false);
  }

  return (
    <section className="publication" id={`publish-${initial.id}`} aria-labelledby={`publish-title-${initial.id}`}>
      <h3 id={`publish-title-${initial.id}`}>Публикация на сайте</h3>
      <p>Укажите контакт для ответа «не знаю» и подтвердите домены, на которых разрешён виджет.</p>
      {!initial.published && proposedOrigins.length > 0 && <p className="job-detail">
        Домен первого сайта предложен ниже. Он сохранится только после вашего подтверждения.</p>}
      <form onSubmit={submit}>
        <label htmlFor={`contact-${initial.id}`}>Контакт владельца (обязательно)</label>
        <input id={`contact-${initial.id}`} value={contact} maxLength={512} required disabled={pending}
          aria-describedby={`contact-hint-${initial.id}`}
          onChange={(event) => { edit(); setContact(event.target.value); }} />
        <p className="job-detail" id={`contact-hint-${initial.id}`}>E-mail, телефон E.164 (например, +79991234567)
          или https-ссылка, до 512 символов.</p>
        <label htmlFor={`origins-${initial.id}`}>Разрешённые домены (по одному адресу на строку)</label>
        <textarea id={`origins-${initial.id}`} value={origins} rows={4} disabled={pending}
          aria-describedby={`origins-hint-${initial.id}`}
          onChange={(event) => { edit(); setOrigins(event.target.value); }} />
        <p className="job-detail" id={`origins-hint-${initial.id}`}>До 20 адресов http(s)://, до 2048 символов каждый.
          Схема и нестандартный порт различаются; полный URL будет приведён к домену.</p>
        <label htmlFor={`demo-${initial.id}`}><input id={`demo-${initial.id}`} type="checkbox" checked={demoEnabled}
          disabled={pending} onChange={(event) => { edit(); setDemoEnabled(event.target.checked); }} />
          Включить публичную демо-страницу</label>
        <button type="submit" disabled={pending}>{pending ? 'Сохраняем…' : 'Подтвердить и сохранить публикацию'}</button>
      </form>
      <div aria-live="polite" aria-busy={pending}>
        {pending && <p role="status">Сохраняем настройки публикации…</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        {saved && <p role="status">Публикация сохранена.</p>}
        {!origins.trim() && <p>Добавьте домен: с пустым списком виджет не отвечает ни на одном сайте.</p>}
        {embedCode && <>
          <label htmlFor={`embed-${initial.id}`}>Код вставки</label>
          <textarea id={`embed-${initial.id}`} value={embedCode} readOnly rows={4} spellCheck={false} />
          <p className="job-detail">Скопируйте код в HTML сайта на одном из разрешённых доменов.</p>
        </>}
      </div>
      {demoPath ? <p><a href={demoPath}>Поделиться демо-страницей</a></p>
        : <p className="job-detail">Чтобы получить ссылку на демо, включите его и сохраните публикацию.</p>}
    </section>
  );
}
