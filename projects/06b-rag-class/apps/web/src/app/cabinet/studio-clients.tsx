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

export function StudioClients({ clients, actorId, selectedId }: {
  clients: readonly { id: string; email: string | null }[]; actorId: string; selectedId: string;
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
      </li>)}</ul>
    </nav>
    <button type="button" disabled={pending} onClick={create}>{pending ? 'Создаём…' : 'Новый клиент'}</button>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
