'use client';
// Добавление текстового файла по адресу (text-source, FR-SOURCE-005, A-N6-080): POST /api/bots/{id}/sources с JSON
// { url, kind: 'text' } и новым Idempotency-Key; 202 — список источников перечитывается сервером (router.refresh), дальше
// лента задачи. Своё состояние, чтобы экран бота (BotScreen, общий с соседними фичами) менялся одной строкой AddSource.
// Кнопка гаснет на время запроса — третьей копии нет (long-running-job).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorOf, send } from '../../lib/api-client';
import { TextSourceForm } from './CabinetViews';

export function TextSourceAdder({ botId }: { botId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const { status, body } = await send(`/api/bots/${botId}/sources`, 'POST', { url, kind: 'text' }, { 'Idempotency-Key': crypto.randomUUID() });
      if (status === 202) { setUrl(''); router.refresh(); return; }
      setError(errorOf(body)?.message ?? 'Не удалось добавить файл. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); } finally { setBusy(false); }
  };
  return <TextSourceForm url={url} busy={busy} error={error || undefined} onUrl={setUrl} onSubmit={() => { void submit(); }} />;
}
