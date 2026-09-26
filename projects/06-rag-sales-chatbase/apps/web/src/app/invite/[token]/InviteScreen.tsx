'use client';
// Приём приглашения студии (фича partner-and-studio; FR-PARTNER-002, SC-US-012-2). Разные состояния — разные экраны:
// открыто (войти / принять), принято, использовано, истекло, предел плана, ошибка. Кнопка гаснет, пока запрос жив.
import { useState } from 'react';
import type { InvitePreview } from '@n6/db';
import { dataOf, errorOf, send } from '../../../lib/api-client';

export type InviteOutcome = 'open' | 'accepted' | 'used' | 'expired' | 'plan_limit' | 'error';
export interface InviteProps { token: string; preview: InvitePreview; loggedIn: boolean }
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

export function InviteView({ token, preview, loggedIn, outcome, message, busy, onAccept }: InviteProps & {
  outcome: InviteOutcome; message: string; busy: boolean; onAccept: () => void; }) {
  const next = encodeURIComponent(`/invite/${token}`);
  const state = outcome === 'open' ? preview.state : outcome;
  return <section className="card stack" aria-labelledby="invite-title">
    <h1 id="invite-title">Бот «{preview.company_name}» для вашего сайта</h1>
    {state === 'open' && <>
      <p>Студия собрала для вас бота и передаёт его вам. После приёма бот — ваш: настройки, материалы и код установки в вашем кабинете. Студия видит только число ответов.</p>
      <p className="muted">Ссылка действует до {date(preview.expires_at)} и сработает один раз.</p>
      {loggedIn
        ? <p><button type="button" className="button" disabled={busy} onClick={onAccept}>{busy ? 'Принимаю…' : 'Принять бота'}</button></p>
        : <p className="cluster"><a className="button" href={`/login?mode=register&next=${next}`}>Создать аккаунт и принять</a>
          <a className="button secondary" href={`/login?next=${next}`}>Уже есть аккаунт — войти</a></p>}
    </>}
    {state === 'accepted' && outcome === 'accepted'
      && <p role="status" className="notice">Бот теперь ваш. <a href="/dashboard">Открыть кабинет</a></p>}
    {state === 'accepted' && outcome !== 'accepted'
      && <p role="status" className="notice danger-notice">Приглашение уже использовано.</p>}
    {state === 'used' && <p role="status" className="notice danger-notice">{message || 'Приглашение уже использовано.'}</p>}
    {state === 'expired' && <p role="status" className="notice danger-notice">{message || 'Срок приглашения истёк — попросите студию прислать новое.'}</p>}
    {state === 'plan_limit' && <p role="alert" className="notice danger-notice">{message} <a href="/pricing">Тарифы</a></p>}
    {state === 'error' && <p role="alert" className="field-error">{message}</p>}
  </section>;
}

export function InviteScreen(props: InviteProps) {
  const [outcome, setOutcome] = useState<InviteOutcome>('open');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { status, body } = await send(`/api/invites/${props.token}/accept`, 'POST', {});
      if (status === 200 && dataOf(body)) { setOutcome('accepted'); setBusy(false); return; }
      const problem = errorOf(body);
      setMessage(problem?.message ?? 'Не удалось принять бота. Повторите');
      setOutcome(problem?.code === 'used' ? 'used' : problem?.code === 'expired' ? 'expired' : problem?.code === 'plan_limit' ? 'plan_limit' : 'error');
    } catch { setMessage('Нет связи с сервером. Повторите'); setOutcome('error'); }
    setBusy(false);
  };
  return <InviteView {...props} outcome={outcome} message={message} busy={busy} onAccept={() => { void accept(); }} />;
}
