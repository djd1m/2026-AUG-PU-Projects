'use client';
// Контейнер экрана бота (FR-BOT-001): источники с лентой стадий и «Повторить», добавление сайта/PDF, тестовый чат
// владельца, настройки. Пока есть незавершённая задача — страница перечитывается сервером раз в 3 с (router.refresh):
// источник истины — строка index_job в Postgres, не состояние браузера (long-running-job).
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { dataOf, errorOf, send } from '../../../../lib/api-client';
import { requestUnverify, requestVerify } from '../../../../lib/verify-request';
import { AddSource, BotForm, OwnerChat, SourceList, type FieldErrors, type OwnerMessage, type SourceItemView } from '../../CabinetViews';
import { GateBanner } from '../../GateBanner';
import { MonthBanner, PublishBlock, SummaryBlock, type PublishView, type SummaryView } from './BotExtrasViews';
import { VerifyBlock, type VerificationEventView } from './VerifyBlock';

const REFRESH_MS = 3000;
export interface BotScreenProps { botId: string; companyName: string; contact: string; greeting: string; sources: SourceItemView[] }
// visitor-ask-and-limits: отметка «Я проверил ответы бота» (A-N6-035) и ответы бота в текущем месяце против предела плана
// (баннер исчерпания, FR-TARIFF-003, SC-US-007-2).
// public-page-and-summary: сводка за 7 дней (FR-BOT-004) и демо-страница (FR-GROWTH-005) — разметка в BotExtrasViews.
// gate-onboarding (A-N6-066): отметку сняла база (дата) и число посетителей с заглушкой «настраивается» за 7 дней.
// verify-audit (A-N6-077): дата установки стоящей отметки и последние события журнала отметки.
export interface BotScreenState { answersVerified: boolean; verification: { verifiedAt: string | null; events: VerificationEventView[] }; gate: { resetAt: string | null; stubVisitors: number }; monthAnswers: { used: number; limit: number }; summary: SummaryView | null; publicPage: PublishView }

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
  const [busySource, setBusySource] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
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
  // «Повторить»/«Обновить» — одна ручка (та же задача, новая серия); «Удалить» — после подтверждения.
  const reindex = async (sourceId: string) => {
    setBusySource(sourceId); setSourceErrors({});
    try {
      const { status, body } = await send(`/api/sources/${sourceId}/reindex`, 'POST', {});
      if (status === 202) { router.refresh(); return; }
      setSourceErrors({ [sourceId]: errorOf(body)?.message ?? 'Не удалось поставить в очередь. Попробуйте ещё раз' });
    } catch { setSourceErrors({ [sourceId]: 'Нет связи с сервером. Повторите' }); } finally { setBusySource(null); }
  };
  const removeSource = async (sourceId: string) => {
    setBusySource(sourceId); setSourceErrors({});
    try {
      const { status, body } = await send(`/api/sources/${sourceId}`, 'DELETE');
      if (status === 204) { setConfirming(null); router.refresh(); return; }
      // 404 — не «удалено»: так же отвечают на истёкшую сессию (ревью Codex фичи 16, находка 8). Сообщить и обновить список.
      if (status === 404) { setConfirming(null); setSourceErrors({ [sourceId]: 'Источник не найден или сессия истекла — обновите страницу и войдите снова' }); router.refresh(); return; }
      setSourceErrors({ [sourceId]: errorOf(body)?.message ?? 'Не удалось удалить. Попробуйте ещё раз' });
    } catch { setSourceErrors({ [sourceId]: 'Нет связи с сервером. Повторите' }); } finally { setBusySource(null); }
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
  // Отметку снимает и сервер (новые фрагменты после «Обновить», миграция 004): после router.refresh() состояние
  // обязано следовать за props, иначе кабинет показывает «проверено», а посетитель уже видит «настраивается»
  // (ревью Codex фичи 16, находка 7).
  useEffect(() => { setVerified(p.answersVerified); }, [p.answersVerified]);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  // Ошибку показывает тот блок, чьей кнопкой нажали (баннер ворот или блок «Ответы на сайте») — не оба сразу.
  const [verifyFrom, setVerifyFrom] = useState<'banner' | 'block'>('block');
  // Баннер после отметки из него сменяется строкой «Отметка поставлена», а не исчезает (AC-11 verify-audit).
  const [justVerified, setJustVerified] = useState(false);
  // verify-audit (A-N6-077): установка и снятие — РАЗНЫЕ действия. Установка — одним нажатием и только true (второе нажатие
  // двойного клика отметку не снимет); снятие — только кнопкой «Снять» подтверждения в VerifyBlock.
  const markVerified = async (from: 'banner' | 'block') => {
    if (verifying) return;
    setVerifying(true); setVerifyError(''); setVerifyFrom(from);
    const outcome = await requestVerify(p.botId, true);
    setVerifying(false);
    if (outcome.ok) { setVerified(outcome.verified); setJustVerified(from === 'banner' && outcome.verified); router.refresh(); } else setVerifyError(outcome.message);
  };
  const unmarkVerified = async () => {
    if (verifying) return;
    setVerifying(true); setVerifyError(''); setVerifyFrom('block'); setJustVerified(false);
    const outcome = await requestUnverify(p.botId);
    setVerifying(false);
    if (outcome.ok) { setVerified(outcome.verified); router.refresh(); } else setVerifyError(outcome.message);
  };
  const [page, setPage] = useState<PublishView>(p.publicPage);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const publish = async (next: { enabled: boolean; indexable: boolean }) => {
    setPublishing(true); setPublishError('');
    try {
      const { status, body } = await send(`/api/bots/${p.botId}/publish`, 'POST', next);
      const data = dataOf<{ url: string; slug: string; enabled: boolean; indexable: boolean }>(body);
      if (status === 200 && data) { setPage({ slug: data.slug, enabled: data.enabled, indexable: data.indexable, url: data.url }); return; }
      setPublishError(errorOf(body)?.message ?? 'Не удалось сохранить. Повторите');
    } catch { setPublishError('Нет связи с сервером. Повторите'); } finally { setPublishing(false); }
  };
  // Стирание журнала вопросов (account-erasure, FR-AUTH-002): подтверждение в два шага, затем сводка перечитывается.
  const [eraseLog, setEraseLog] = useState({ confirming: false, busy: false, error: '', done: false });
  const eraseQuestionLog = async () => {
    setEraseLog({ confirming: true, busy: true, error: '', done: false });
    try {
      const { status, body } = await send(`/api/bots/${p.botId}/question-log/erase`, 'POST', { confirm: true });
      if (status === 200 && dataOf(body)) { setEraseLog({ confirming: false, busy: false, error: '', done: true }); router.refresh(); return; }
      setEraseLog({ confirming: true, busy: false, error: errorOf(body)?.message ?? 'Не удалось стереть журнал. Повторите', done: false });
    } catch { setEraseLog({ confirming: true, busy: false, error: 'Нет связи с сервером. Повторите', done: false }); }
  };
  const ready = p.sources.some((s) => s.job?.state === 'done');
  return <BotLayout {...p} ready={ready}
    gate={<GateBanner verified={verified} justVerified={justVerified} ready={ready} resetAt={p.gate.resetAt} stubVisitors={p.gate.stubVisitors} chatHref="#chat-title"
      busy={verifying} error={verifyFrom === 'banner' ? verifyError : ''} onVerify={() => { void markVerified('banner'); }} />}
    banner={<MonthBanner used={p.monthAnswers.used} limit={p.monthAnswers.limit} />}
    summary={<SummaryBlock summary={p.summary} erase={{ ...eraseLog,
      onAsk: () => setEraseLog({ confirming: true, busy: false, error: '', done: false }),
      onConfirm: () => { void eraseQuestionLog(); },
      onCancel: () => setEraseLog({ confirming: false, busy: false, error: '', done: false }) }} />}
    verify={<VerifyBlock verified={verified} busy={verifying} error={verifyFrom === 'block' ? verifyError : ''}
      verifiedAt={p.verification.verifiedAt} events={p.verification.events}
      onSet={() => { void markVerified('block'); }} onUnset={() => { void unmarkVerified(); }} />}
    publish={<PublishBlock page={page} busy={publishing} error={publishError}
      onPublish={(enabled) => { void publish({ enabled, indexable: page.indexable }); }}
      onIndexable={(indexable) => { void publish({ enabled: page.enabled, indexable }); }} />}
    sourcesBlock={<><SourceList sources={p.sources} busy={busySource} confirming={confirming} errors={sourceErrors}
        onReindex={(id) => { void reindex(id); }} onConfirm={setConfirming} onDelete={(id) => { void removeSource(id); }} />
      <AddSource url={url} busy={adding} errors={sourceErrors} onUrl={setUrl} onSite={() => { void addSite(); }} onPdf={(f) => { void addPdf(f); }} botId={p.botId} /></>}
    chat={<OwnerChat companyName={p.companyName} messages={messages} draft={draft} busy={asking} error={chatError}
      ready={p.sources.some((s) => s.job?.state === 'done')} onDraft={setDraft} onAsk={() => { void ask(); }} />}
    settings={<>{saved && <p role="status" className="notice">Настройки сохранены</p>}
      <BotForm idPrefix="bot" name={settings.name} contact={settings.contact} greeting={settings.greeting} errors={settingsErrors} busy={saving}
        submitLabel="Сохранить настройки" contactRequired onChange={(f, v) => setSettings((s) => ({ ...s, [f]: v }))} onSubmit={() => { void save(); }} /></>} />;
}

export function BotLayout(p: BotScreenProps & { ready: boolean; sourcesBlock: ReactNode; chat: ReactNode; settings: ReactNode; banner?: ReactNode; gate?: ReactNode; verify?: ReactNode; summary?: ReactNode; publish?: ReactNode }) {
  return <>
    <div className="cabinet-head"><h1>{p.companyName}</h1>
      <p className="cluster"><a className="button" href={`/dashboard/bots/${p.botId}/install`}>Установка на сайт</a>
        <a className="button secondary" href="/dashboard">Все боты</a></p></div>
    {p.gate}
    {p.banner}
    {!p.contact && <p role="status" className="notice cabinet-notice">Укажите контакт для «не знаю» в настройках — без него бот не выдаёт код установки и не отвечает на сайте.</p>}
    <div className="bot-grid">
      <section className="stack" aria-labelledby="sources-title"><h2 id="sources-title">Источники</h2>{p.sourcesBlock}</section>
      <section className="stack" aria-labelledby="chat-title"><h2 id="chat-title">Задать вопрос</h2>{p.chat}</section>
    </div>
    {p.summary}
    {p.verify}
    {p.publish}
    <section className="card stack bot-settings" aria-labelledby="settings-title"><h2 id="settings-title">Настройки бота</h2>{p.settings}</section>
  </>;
}
