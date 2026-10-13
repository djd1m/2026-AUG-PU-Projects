'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export async function submitStudioClient(fetchImpl: typeof fetch = fetch): Promise<{
  accountId?: string; message: string;
}> {
  try {
    const response = await fetchImpl('/api/studio/clients', { method: 'POST', credentials: 'same-origin' });
    const body = await response.json();
    return response.status === 201 && typeof body.data?.account_id === 'string'
      ? { accountId: body.data.account_id, message: 'Клиент создан.' }
      : { message: body.error?.message ?? 'Не удалось создать клиента. Повторите' };
  } catch { return { message: 'Не удалось связаться с сервером. Повторите' }; }
}

export async function submitIssueHandover(id: string, fetchImpl: typeof fetch = fetch): Promise<{
  link?: string; expiresAt?: string; message: string;
}> {
  try {
    const response = await fetchImpl(`/api/studio/clients/${encodeURIComponent(id)}/handover`,
      { method: 'POST', credentials: 'same-origin' });
    const body = await response.json();
    return response.status === 201 && typeof body.data?.link === 'string' && typeof body.data?.expires_at === 'string'
      ? { link: body.data.link, expiresAt: body.data.expires_at, message: 'Ссылка создана.' }
      : { message: body.error?.message ?? 'Не удалось создать ссылку. Повторите' };
  } catch { return { message: 'Не удалось связаться с сервером. Повторите' }; }
}
function HandoverLink({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ link?: string; expiresAt?: string; message: string }>({ message: '' });
  async function issue() {
    if (pending) return;
    setPending(true); setResult({ message: '' });
    setResult(await submitIssueHandover(id)); setPending(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result.link ?? ''); setResult({ ...result, message: 'Ссылка скопирована.' }); }
    catch { setResult({ ...result, message: 'Выделите и скопируйте ссылку вручную.' }); }
  }
  return <div className="handover-link">
    <button type="button" disabled={pending} onClick={issue}>{pending ? 'Создаём ссылку…' : 'Передать клиенту'}</button>
    {result.link && <><p><a href={result.link} rel="noreferrer">{result.link}</a></p>
      <p>Действует до <time dateTime={result.expiresAt}>{result.expiresAt}</time></p>
      <button type="button" onClick={copy}>Копировать ссылку</button></>}
    <p role="status" aria-live="polite">{result.message}</p>
  </div>;
}

export function StudioClients({ clients, actorId, selectedId, handoverCandidateIds = [] }: {
  clients: readonly { id: string; email: string | null }[]; actorId: string; selectedId: string; handoverCandidateIds?: readonly string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function create() {
    if (pending) return;
    setPending(true); setMessage('');
    const result = await submitStudioClient();
    setMessage(result.message);
    if (result.accountId) router.push(`/cabinet?account=${encodeURIComponent(result.accountId)}`);
    setPending(false);
  }
  return <section className="bot-card" aria-label="Клиенты студии">
    <h2>Клиенты студии</h2>
    <nav aria-label="Выбор аккаунта">
      <Link href="/cabinet" aria-current={selectedId === actorId ? 'page' : undefined}>Мой аккаунт</Link>
      <ul>{clients.map((client, index) => <li key={client.id}>
        <Link href={`/cabinet?account=${encodeURIComponent(client.id)}`}
          aria-current={selectedId === client.id ? 'page' : undefined}>{client.email ?? `Клиент ${index + 1}`}</Link>
        {handoverCandidateIds.includes(client.id) && <HandoverLink id={client.id} />}
      </li>)}</ul>
    </nav>
    <button type="button" disabled={pending} onClick={create}>{pending ? 'Создаём…' : 'Новый клиент'}</button>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
