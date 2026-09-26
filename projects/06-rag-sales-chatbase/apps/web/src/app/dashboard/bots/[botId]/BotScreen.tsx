'use client';
// Контейнер экрана бота (FR-BOT-001): источники с лентой стадий и «Повторить», добавление сайта/PDF, тестовый чат
// владельца, настройки. Пока есть незавершённая задача — страница перечитывается сервером раз в 3 с (router.refresh):
// источник истины — строка index_job в Postgres, не состояние браузера (long-running-job).
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { dataOf, errorOf, send } from '../../../../lib/api-client';
import { AddSource, BotForm, OwnerChat, SourceList, type FieldErrors, type OwnerMessage, type SourceItemView } from '../../CabinetViews';

const REFRESH_MS = 3000;
export interface BotScreenProps { botId: string; companyName: string; contact: string; greeting: string; sources: SourceItemView[] }
// visitor-ask-and-limits: отметка «Я проверил ответы бота» (A-N6-035) и ответы бота в текущем месяце против предела плана
// (баннер исчерпания, FR-TARIFF-003, SC-US-007-2).
export interface BotScreenState { answersVerified: boolean; monthAnswers: { used: number; limit: number } }

export const VERIFY_RISK = 'Бот отвечает только по вашим материалам и к каждому ответу прикладывает фрагмент-источник. Но ссылка на фрагмент '
  + 'не доказывает, что текст ответа с ним совпадает: модель может добавить от себя — например, скидку или срок, которых в '
  + 'материалах нет. Задайте боту в чате выше вопросы, которые задают ваши клиенты, особенно о ценах, сроках и акциях. Пока '
  + 'отметки нет, посетители сайта видят «Бот ещё настраивается» и ваш контакт.';

export function BotScreen(p: BotScreenProps & BotScreenState) {
  const router = useRouter();
  const active = p.sources.some((s) => s.job && (s.job.state === 'running' || s.job.state === 'no_response'));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [sourceErrors, setSourceErrors] = useState<FieldErrors>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const addSite = async () => {
    setAdding(true); setSourceErrors({});
    try {
      const { status, body } = await send(`/api/bots/${p.botId}/sources`, 'POST', { url }, { 'Idempotency-Key': crypto.randomUUID() });
      if (status === 202) { setUrl(''); router.refresh(); return; }
      setSourceErrors({ url: errorOf(body)?.message ?? 'Не удалось добавить сайт. Повторите' });
    } catch { setSourceErrors({ url: 'Нет связи с сервером. Повторите' }); } finally { setAdding(false); }
  };
  const addPdf = async (file: File | null) => {
    if (!file) return;
    setAdding(true); setSourceErrors({});
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const response = await fetch(`/api/bots/${p.botId}/sources`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: form });
      if (response.status === 202) { router.refresh(); return; }
      setSourceErrors({ pdf: errorOf(await response.json().catch(() => null))?.message ?? 'Не удалось загрузить PDF. Повторите' });
    } catch { setSourceErrors({ pdf: 'Нет связи с сервером. Повторите' }); } finally { setAdding(false); }
  };
  const retry = async (sourceId: string) => {
    setRetrying(sourceId); setSourceErrors({});
    try {
      const { status, body } = await send(`/api/sources/${sourceId}/reindex`, 'POST', {});
      if (status === 202) { router.refresh(); return; }
      setSourceErrors({ [sourceId]: errorOf(body)?.message ?? 'Не удалось повторить. Попробуйте ещё раз' });
    } catch { setSourceErrors({ [sourceId]: 'Нет связи с сервером. Повторите' }); } finally { setRetrying(null); }
  };

  const [messages, setMessages] = useState<OwnerMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState('');
  const ask = async () => {
    const question = draft.trim();
    if (!question || asking) return;
    setAsking(true); setChatError('');
    try {
      const { status, body } = await send(`/api/bots/${p.botId}/ask`, 'POST', { question });
      if (status === 429) { setMessages((m) => [...m, { kind: 'question', text: question }, { kind: 'refused', text: errorOf(body)?.message ?? 'Лимит исчерпан' }]); setDraft(''); return; }
      const data = dataOf<{ status: string; text: string; source?: { title: string; url: string | null; excerpt: string } }>(body);
      if (status !== 200 || !data) { setChatError(errorOf(body)?.message ?? 'Не удалось получить ответ. Повторите'); return; }
      const reply: OwnerMessage = data.status === 'answered' && data.source ? { kind: 'answered', text: data.text, source: data.source } : { kind: 'unknown', text: data.text };
      setMessages((m) => [...m, { kind: 'question', text: question }, reply]); setDraft('');
    } catch { setChatError('Нет связи с сервером. Повторите'); } finally { setAsking(false); }
  };

  const [settings, setSettings] = useState({ name: p.companyName, contact: p.contact, greeting: p.greeting });
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true); setSettingsErrors({}); setSaved(false);
    const patch: Record<string, string> = { company_name: settings.name, greeting: settings.greeting };
    if (settings.contact.trim() || p.contact) patch.contact = settings.contact;
    try {
      const { status, body } = await send(`/api/bots/${p.botId}`, 'PATCH', patch);
      if (status === 200) { setSaved(true); router.refresh(); return; }
      const error = errorOf(body);
      setSettingsErrors(error?.field ? { [error.field]: error.message } : { form: error?.message ?? 'Не удалось сохранить. Повторите' });
    } catch { setSettingsErrors({ form: 'Нет связи с сервером. Повторите' }); } finally { setSaving(false); }
  };
  const [verified, setVerified] = useState(p.answersVerified);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const toggleVerified = async () => {
    setVerifying(true); setVerifyError('');
    try {
      const { status, body } = await send(`/api/bots/${p.botId}/verify`, 'POST', { verified: !verified });
      const data = dataOf<{ answers_verified: boolean }>(body);
      if (status === 200 && data) { setVerified(data.answers_verified); return; }
      setVerifyError(errorOf(body)?.message ?? 'Не удалось сохранить отметку. Повторите');
    } catch { setVerifyError('Нет связи с сервером. Повторите'); } finally { setVerifying(false); }
  };
  const exhausted = p.monthAnswers.used >= p.monthAnswers.limit;
  return <BotLayout {...p} ready={p.sources.some((s) => s.job?.state === 'done')}
    banner={exhausted ? <p role="alert" className="notice danger-notice cabinet-notice">Месячный лимит ответов исчерпан ({p.monthAnswers.used} из {p.monthAnswers.limit}): до 1-го числа посетители видят отказ с вашим контактом. Тестовые вопросы в кабинете расходуют тот же лимит. <a href="/pricing">Тарифы</a></p> : null}
    verify={<section className="card stack" aria-labelledby="verify-title"><h2 id="verify-title">Ответы на сайте</h2>
      <p>{VERIFY_RISK}</p>
      <p role="status" className={verified ? 'notice' : 'notice danger-notice'}>{verified ? 'Отмечено: посетители видят ответы бота.' : 'Не отмечено: посетители видят «Бот ещё настраивается».'}</p>
      {verifyError && <p role="alert" className="field-error">{verifyError}</p>}
      <p><button type="button" className={verified ? 'button secondary' : 'button'} disabled={verifying} onClick={() => { void toggleVerified(); }}>
        {verified ? 'Снять отметку' : 'Я проверил ответы бота'}</button></p></section>}
    sourcesBlock={<><SourceList sources={p.sources} retrying={retrying} errors={sourceErrors} onRetry={(id) => { void retry(id); }} />
      <AddSource url={url} busy={adding} errors={sourceErrors} onUrl={setUrl} onSite={() => { void addSite(); }} onPdf={(f) => { void addPdf(f); }} /></>}
    chat={<OwnerChat companyName={p.companyName} messages={messages} draft={draft} busy={asking} error={chatError}
      ready={p.sources.some((s) => s.job?.state === 'done')} onDraft={setDraft} onAsk={() => { void ask(); }} />}
    settings={<>{saved && <p role="status" className="notice">Настройки сохранены</p>}
      <BotForm idPrefix="bot" name={settings.name} contact={settings.contact} greeting={settings.greeting} errors={settingsErrors} busy={saving}
        submitLabel="Сохранить настройки" contactRequired onChange={(f, v) => setSettings((s) => ({ ...s, [f]: v }))} onSubmit={() => { void save(); }} /></>} />;
}

export function BotLayout(p: BotScreenProps & { ready: boolean; sourcesBlock: ReactNode; chat: ReactNode; settings: ReactNode; banner?: ReactNode; verify?: ReactNode }) {
  return <>
    <div className="cabinet-head"><h1>{p.companyName}</h1>
      <p className="cluster"><a className="button" href={`/dashboard/bots/${p.botId}/install`}>Установка на сайт</a>
        <a className="button secondary" href="/dashboard">Все боты</a></p></div>
    {p.banner}
    {!p.contact && <p role="status" className="notice cabinet-notice">Укажите контакт для «не знаю» в настройках — без него бот не выдаёт код установки и не отвечает на сайте.</p>}
    <div className="bot-grid">
      <section className="stack" aria-labelledby="sources-title"><h2 id="sources-title">Источники</h2>{p.sourcesBlock}</section>
      <section className="stack" aria-labelledby="chat-title"><h2 id="chat-title">Задать вопрос</h2>{p.chat}</section>
    </div>
    {p.verify}
    <section className="card stack bot-settings" aria-labelledby="settings-title"><h2 id="settings-title">Настройки бота</h2>{p.settings}</section>
  </>;
}
