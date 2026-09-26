'use client';
// Контейнер «Установка»: сохранение контакта (PATCH), добавление домена (POST origins), копирование кода.
// Код установки строит СЕРВЕР (installSnippet): после сохранения контакта страница перечитывается, а не
// «открывает» код у себя — иначе запрет «без контакта кода нет» обходился бы в браузере.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstallSnippet } from '@n6/rag/bot-settings';
import { errorOf, send } from '../../../../../lib/api-client';
import type { FieldErrors } from '../../../CabinetViews';
import { InstallView } from '../../../InstallViews';

export function InstallScreen(p: { botId: string; companyName: string; snippet: InstallSnippet; origins: string[] }) {
  const router = useRouter();
  const [contact, setContact] = useState('');
  const [domain, setDomain] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const call = async (url: string, method: 'POST' | 'PATCH', payload: unknown, fieldName: string, done: () => void) => {
    setBusy(true); setErrors({});
    try {
      const { status, body } = await send(url, method, payload);
      if (status === 200 || status === 201) { done(); router.refresh(); return; }
      setErrors({ [fieldName]: errorOf(body)?.message ?? 'Не удалось сохранить. Повторите' });
    } catch { setErrors({ [fieldName]: 'Нет связи с сервером. Повторите' }); } finally { setBusy(false); }
  };
  return <InstallView {...p} contact={contact} domain={domain} errors={errors} busy={busy} copied={copied}
    onContact={setContact} onDomain={setDomain}
    onSaveContact={() => { void call(`/api/bots/${p.botId}`, 'PATCH', { contact }, 'contact', () => setContact('')); }}
    onAddDomain={() => { void call(`/api/bots/${p.botId}/origins`, 'POST', { domain }, 'domain', () => setDomain('')); }}
    onCopy={() => {
      if (p.snippet.kind !== 'ready') return;
      void navigator.clipboard?.writeText(p.snippet.tag).then(() => setCopied(true), () => setCopied(false));
    }} />;
}
