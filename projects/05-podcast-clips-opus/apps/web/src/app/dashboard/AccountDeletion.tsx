'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc } from '../../lib/rpc';
export function ErasureStatus({ status, deadline }: { status: 'erasing' | 'deleted'; deadline: string }) {
  const router = useRouter(), [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (status === 'deleted') return;
    const timer = setInterval(() => { setNow(Date.now()); router.refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [router, status]);
  const remaining = now === null ? null : Math.ceil((Date.parse(deadline) - now) / 3600_000);
  return <section aria-live="polite"><h1>{status === 'deleted' ? 'Аккаунт удалён' : 'Удаляем аккаунт'}</h1>
    {status === 'deleted' ? <p>Удаление файлов и данных аккаунта завершено.</p> : <>
      <p>Вход закрыт, гостевые страницы отозваны. Срок завершения: {new Date(deadline).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК.</p>
      {remaining !== null && (remaining > 0 ? <p>До срока осталось не более {remaining} ч.</p>
        : <p role="alert">Удаление задерживается. Оно ещё не завершено; сервис продолжает попытки.</p>)}
    </>}
    <p>Скачанные копии и публикации в чужих лентах остаются у их владельцев.</p>
  </section>;
}
export function AccountDeletion() {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const router = useRouter();
  async function remove() {
    if (!confirm || busy) return;
    setBusy(true); setError('');
    try {
      const result = await rpc<{ accepted: true; erase_deadline: string }>('account.delete', { confirm: true }, true);
      setDeadline(result.erase_deadline); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось запросить удаление'); }
    finally { setBusy(false); }
  }
  if (deadline) return <ErasureStatus status="erasing" deadline={deadline} />;
  return <section aria-label="Удаление аккаунта"><h2>Удалить аккаунт</h2>
    <p>Удаление необратимо: восстановить аккаунт, оригиналы и клипы будет невозможно. Завершим удаление в течение 72 часов.</p>
    <p>Клипы, уже скачанные или опубликованные в чужих лентах, мы удалить не можем: эти копии находятся не у нас.</p>
    <label className="check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} disabled={busy} /> Подтверждаю необратимое удаление</label>
    <button disabled={!confirm || busy} className="danger" onClick={() => void remove()}>{busy ? 'Запрашиваем удаление…' : 'Удалить аккаунт навсегда'}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
