'use client';
// Контейнер «Установка»: сохранение контакта (PATCH), добавление домена (POST origins), копирование кода.
// Код установки строит СЕРВЕР (installSnippet): после сохранения контакта страница перечитывается, а не
// «открывает» код у себя — иначе запрет «без контакта кода нет» обходился бы в браузере.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InstallSnippet } from '@n6/rag/bot-settings';
import { errorOf, send } from '../../../../../lib/api-client';
import { requestVerify } from '../../../../../lib/verify-request';
import type { FieldErrors } from '../../../CabinetViews';
import { InstallView } from '../../../InstallViews';

export interface InstallGateState { verified: boolean; ready: boolean; resetAt: string | null; stubVisitors: number }

export function InstallScreen({ gate, ...p }: { botId: string; companyName: string; snippet: InstallSnippet; origins: string[]; plan?: string; gate: InstallGateState }) {
  const router = useRouter();
  const [contact, setContact] = useState('');
  const [domain, setDomain] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Отметка «Я проверил ответы бота» прямо из баннера (gate-onboarding): тот же POST /verify, что на экране бота;
  // после успеха страница перечитывается сервером — баннер исчезает по данным БД, а не по состоянию браузера.
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [justVerified, setJustVerified] = useState(false);
  // Ревью круга 1: сервер снял отметку (новые материалы) после установки в этой вкладке — оптимистическое «поставлена» уходит,
  // баннер снова предупреждает. Срабатывает только на СМЕНЕ серверного значения, не на нажатии.
  useEffect(() => { if (!gate.verified) setJustVerified(false); }, [gate.verified]);
  const verify = async () => {
    if (verifying) return;
    setVerifying(true); setVerifyError('');
    const outcome = await requestVerify(p.botId, true);
    setVerifying(false);
    if (outcome.ok) { setJustVerified(outcome.verified); router.refresh(); } else setVerifyError(outcome.message);
  };
  const call = async (url: string, method: 'POST' | 'PATCH', payload: unknown, fieldName: string, done: () => void) => {
    setBusy(true); setErrors({});
    try {
      const { status, body } = await send(url, method, payload);
      if (status === 200 || status === 201) { done(); router.refresh(); return; }
      setErrors({ [fieldName]: errorOf(body)?.message ?? 'Не удалось сохранить. Повторите' });
    } catch { setErrors({ [fieldName]: 'Нет связи с сервером. Повторите' }); } finally { setBusy(false); }
  };
  return <InstallView {...p} gate={{ ...gate, verified: gate.verified || justVerified, justVerified, chatHref: `/dashboard/bots/${p.botId}#chat-title`, busy: verifying, error: verifyError, onVerify: () => { void verify(); } }}
    contact={contact} domain={domain} errors={errors} busy={busy} copied={copied}
    onContact={setContact} onDomain={setDomain}
    onSaveContact={() => { void call(`/api/bots/${p.botId}`, 'PATCH', { contact }, 'contact', () => setContact('')); }}
    onAddDomain={() => { void call(`/api/bots/${p.botId}/origins`, 'POST', { domain }, 'domain', () => setDomain('')); }}
    onCopy={() => {
      if (p.snippet.kind !== 'ready') return;
      void navigator.clipboard?.writeText(p.snippet.tag).then(() => setCopied(true), () => setCopied(false));
    }} />;
}
