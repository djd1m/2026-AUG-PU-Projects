'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export async function submitCreateBot(name: string, site: string, fetchImpl: typeof fetch = fetch,
  accountId?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetchImpl('/api/bots', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name,
        ...(site.trim() ? { site_url: site } : {}), ...(accountId ? { account_id: accountId } : {}) }) });
    const body = await response.json();
    if (response.status === 201 && typeof body.data?.bot_id === 'string') {
      return { ok: true, message: 'Бот создан. Добавьте PDF или адрес сайта.' };
    }
    return response.status === 202 && typeof body.data?.job_id === 'string'
      ? { ok: true, message: 'Бот создан. Индексация сайта выполняется.' }
      : { ok: false, message: body.error?.message ?? 'Не удалось создать бота. Повторите' };
  } catch { return { ok: false, message: 'Не удалось связаться с сервером. Повторите' }; }
}

export function CreateBot({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage('');
    const result = await submitCreateBot(name, site, fetch, accountId);
    setMessage(result.message);
    if (result.ok) { setName(''); setSite(''); router.refresh(); }
    setPending(false);
  }
  return <form className="add-source" onSubmit={submit} aria-label="Создание бота">
    <label>Имя бота<input required maxLength={200} value={name} disabled={pending} onChange={(e) => setName(e.target.value)} /></label>
    <label>Адрес сайта (необязательно для PDF)<input type="url" value={site} disabled={pending} onChange={(e) => setSite(e.target.value)} placeholder="https://ваш-сайт.ru" /></label>
    <button type="submit" disabled={pending}>{pending ? 'Создаём…' : 'Создать бота'}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
