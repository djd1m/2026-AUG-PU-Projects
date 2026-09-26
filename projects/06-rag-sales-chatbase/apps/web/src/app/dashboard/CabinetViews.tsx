// Экраны кабинета (фича bot-cabinet; FR-BOT-001, FR-TARIFF-003, FR-INDEX-003). Только разметка по пропсам, без
// состояния и запросов: ту же разметку рендерит браузерный набор прибора (tests/browser/bot-cabinet.test.ts),
// состояние и запросы — BotListScreen / BotScreen. Написано заново (ADR-016); классы и токены — design-shell и
// preview-flow (globals.css). Лента стадий — адаптация N5 (lib/source-ribbon.ts).
import type { ReactNode } from 'react';
import { ribbonOf, STEP_STATE_TEXT, type RibbonJob } from '../../lib/source-ribbon';

export interface BotListItemView {
  bot_id: string; company_name: string; contact_set: boolean; sources: number; sources_ready: number; sources_failed: number; origins: number;
}
export interface BotListView { plan: 'free' | 'nobadge' | 'studio'; limit: number; bots: BotListItemView[] }
export interface SourceItemView { source_id: string; kind: 'site' | 'pdf'; title: string; job: (RibbonJob & { index_job_id: string }) | null }
export interface FieldErrors { [field: string]: string | undefined }

// Причины канона §4 (index_job.failure_reason) → текст владельцу в кабинете. Неизвестная — как internal.
const REASONS: Readonly<Record<string, string>> = {
  robots_disallowed: 'Сайт запрещает чтение роботам (robots.txt). Загрузите материалы в PDF',
  unreachable: 'Сайт не открылся. Проверьте, что он доступен без входа по паролю',
  blocked_address: 'Адрес ведёт во внутреннюю или служебную сеть — такие адреса мы не читаем',
  no_text: 'Текста не нашлось: страницы собираются скриптами в браузере. Загрузите PDF',
  not_pdf: 'Файл не является PDF',
  too_large: 'Файл больше 10 МБ или 100 страниц',
  no_text_layer: 'В PDF нет текстового слоя (скан). Нужен PDF с текстом',
  quota_refused: 'Суточный предел обработки текста исчерпан. Повторите завтра',
  embedding_unavailable: 'Сервис обработки текста был недоступен',
  stalled: 'Задача не отвечала больше 5 минут и закрыта',
  internal: 'Внутренняя ошибка при чтении источника',
};
export const cabinetReason = (reason: string | undefined) => REASONS[reason ?? 'internal'] ?? REASONS.internal!;
const PLAN_TITLE: Readonly<Record<BotListView['plan'], string>> = { free: 'Бесплатный', nobadge: 'Без бейджа', studio: 'Студия' };

export function Field(p: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return <div className="field">
    <label htmlFor={p.id}>{p.label}</label>
    {p.hint && <p id={`${p.id}-hint`} className="muted field-hint">{p.hint}</p>}
    {p.children}
    {p.error && <p id={`${p.id}-error`} role="alert" className="field-error">{p.error}</p>}
  </div>;
}
const describedBy = (id: string, hint: boolean, error?: string) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

export interface BotFormProps {
  idPrefix: string; name: string; contact: string; greeting: string; errors: FieldErrors; busy: boolean; submitLabel: string; contactRequired: boolean;
  onChange: (field: 'name' | 'contact' | 'greeting', value: string) => void; onSubmit: () => void;
}
export function BotForm(p: BotFormProps) {
  const id = (f: string) => `${p.idPrefix}-${f}`;
  return <form className="stack bot-form" noValidate onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }}>
    <Field id={id('name')} label="Название компании" error={p.errors.company_name}>
      <input id={id('name')} name="company_name" type="text" maxLength={200} autoComplete="organization" value={p.name}
        aria-invalid={Boolean(p.errors.company_name)} aria-describedby={describedBy(id('name'), false, p.errors.company_name)}
        onChange={(e) => p.onChange('name', e.target.value)} />
    </Field>
    <Field id={id('contact')} label={p.contactRequired ? 'Контакт для «не знаю» (обязателен)' : 'Контакт для «не знаю»'}
      hint="Его увидит посетитель, если ответа нет в материалах: почта, телефон или ссылка https://…" error={p.errors.contact}>
      <input id={id('contact')} name="contact" type="text" maxLength={300} autoComplete="off" value={p.contact} placeholder="+7 900 000-00-00"
        aria-invalid={Boolean(p.errors.contact)} aria-describedby={describedBy(id('contact'), true, p.errors.contact)}
        onChange={(e) => p.onChange('contact', e.target.value)} />
    </Field>
    <Field id={id('greeting')} label="Приветствие" hint="Первая фраза бота в окне чата. Можно оставить пустым" error={p.errors.greeting}>
      <input id={id('greeting')} name="greeting" type="text" maxLength={300} autoComplete="off" value={p.greeting} placeholder="Здравствуйте! Спросите о ценах и доставке"
        aria-invalid={Boolean(p.errors.greeting)} aria-describedby={describedBy(id('greeting'), true, p.errors.greeting)}
        onChange={(e) => p.onChange('greeting', e.target.value)} />
    </Field>
    {p.errors.form && <p role="alert" className="field-error">{p.errors.form}</p>}
    <p><button type="submit" disabled={p.busy}>{p.busy ? 'Сохраняем…' : p.submitLabel}</button></p>
  </form>;
}

export function BotListSection({ list, create }: { list: BotListView; create: ReactNode }) {
  const canCreate = list.bots.length < list.limit;
  return <>
    <div className="cabinet-head"><h1>Мои боты</h1>
      <p className="muted plan-line">План: <strong>{PLAN_TITLE[list.plan]}</strong> · ботов {list.bots.length} из {list.limit}</p></div>
    <ul className="bot-list" aria-label="Боты">{list.bots.map((bot) => <li key={bot.bot_id} className="card bot-card stack">
      <h2 className="bot-card-title"><a href={`/dashboard/bots/${bot.bot_id}`}>{bot.company_name}</a></h2>
      <p className="muted">Источников: {bot.sources} · готово {bot.sources_ready}{bot.sources_failed ? ` · с отказом ${bot.sources_failed}` : ''} · доменов: {bot.origins}</p>
      {bot.contact_set
        ? <p className="status-line"><span className="accent-text">●</span> Контакт для «не знаю» указан</p>
        : <p className="status-line warn-line">Нет контакта для «не знаю» — код установки не выдаётся</p>}
      <p className="cluster"><a className="button" href={`/dashboard/bots/${bot.bot_id}`}>Открыть</a>
        <a className="button secondary" href={`/dashboard/bots/${bot.bot_id}/install`}>Установка</a></p>
    </li>)}</ul>
    {canCreate
      ? <section className="card stack create-bot" aria-labelledby="create-title"><h2 id="create-title">Новый бот</h2>{create}</section>
      : <p className="notice limit-notice" role="status">Предел плана {list.plan}: не больше {list.limit} {list.limit === 1 ? 'бота' : 'ботов'}. Чтобы добавить ещё, <a href="/pricing">смените план</a>.</p>}
  </>;
}

export function SourceRibbon({ job, kind }: { job: RibbonJob | null; kind: 'site' | 'pdf' }) {
  const ribbon = ribbonOf(job, kind);
  return <ol className={`ribbon tone-${ribbon.tone}`} aria-label="Ход индексации">
    {ribbon.steps.map((step) => <li key={step.key} className={`ribbon-step is-${step.view}`}>
      <span className="ribbon-label">{step.label}</span>{' '}
      <span className="ribbon-state">{STEP_STATE_TEXT[step.view]}{step.detail ? ` · ${step.detail}` : ''}</span>
    </li>)}
  </ol>;
}

export function SourceList(p: { sources: SourceItemView[]; retrying: string | null; errors: FieldErrors; onRetry: (sourceId: string) => void }) {
  if (!p.sources.length) return <p className="empty">Источников пока нет. Добавьте адрес сайта или PDF — бот будет отвечать по ним.</p>;
  return <ul className="source-list" aria-label="Источники">{p.sources.map((s) => {
    const failed = s.job?.state === 'failed';
    return <li key={s.source_id} className="card source-item stack">
      <p className="source-title"><span className="source-kind">{s.kind === 'pdf' ? 'PDF' : 'Сайт'}</span> <strong>{s.title}</strong></p>
      <SourceRibbon job={s.job} kind={s.kind} />
      {s.job?.state === 'no_response' && <p role="status" className="notice">Больше 5 минут не было новостей от задачи — это не «ещё читаем». Сторож закроет её с причиной, если она остановилась.</p>}
      {failed && <p className="notice danger-notice"><span role="alert">{cabinetReason(s.job?.reason)}.</span></p>}
      {failed && (s.kind === 'site'
        ? <p><button type="button" className="secondary" disabled={p.retrying === s.source_id} onClick={() => p.onRetry(s.source_id)}>
            {p.retrying === s.source_id ? 'Ставим в очередь…' : 'Повторить'}</button></p>
        : <p className="muted">Файл после отказа удалён — загрузите исправленный PDF ниже.</p>)}
      {p.errors[s.source_id] && <p role="alert" className="field-error">{p.errors[s.source_id]}</p>}
    </li>;
  })}</ul>;
}

export function AddSource(p: { url: string; busy: boolean; errors: FieldErrors; onUrl: (value: string) => void; onSite: () => void; onPdf: (file: File | null) => void }) {
  return <div className="stack add-source">
    <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); p.onSite(); }}>
      <Field id="source-url" label="Адрес сайта" hint="Прочитаем страницы этого сайта: robots.txt, по одной странице в секунду" error={p.errors.url}>
        <input id="source-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="example.ru" value={p.url}
          aria-invalid={Boolean(p.errors.url)} aria-describedby={describedBy('source-url', true, p.errors.url)} onChange={(e) => p.onUrl(e.target.value)} />
      </Field>
      <p><button type="submit" disabled={p.busy}>{p.busy ? 'Добавляем…' : 'Добавить сайт'}</button></p>
    </form>
    <Field id="source-pdf" label="PDF: прайс, памятка, условия" hint="До 10 МБ и 100 страниц, с текстовым слоем (не скан)" error={p.errors.pdf}>
      <input id="source-pdf" name="file" type="file" accept="application/pdf,.pdf" className="file-input" disabled={p.busy}
        aria-describedby={describedBy('source-pdf', true, p.errors.pdf)} onChange={(e) => p.onPdf(e.target.files?.[0] ?? null)} />
    </Field>
  </div>;
}

export interface SourceChipView { title: string; url: string | null; excerpt: string }
export type OwnerMessage =
  | { kind: 'question'; text: string }
  | { kind: 'answered'; text: string; source: SourceChipView }
  | { kind: 'unknown'; text: string }
  | { kind: 'refused'; text: string };
const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
function OwnerMessageItem({ message }: { message: OwnerMessage }) {
  if (message.kind === 'question') return <li className="chat-question">{message.text}</li>;
  if (message.kind === 'refused') return <li className="chat-answer chat-refused"><span role="alert">{message.text}</span></li>;
  if (message.kind === 'unknown') return <li className="chat-answer">{message.text}</li>;
  const href = safeHref(message.source.url);
  return <li className="chat-answer-group">
    <div className="chat-answer">{message.text}</div>
    {/* Владельцу — развёрнутая цитата (FR-BOT-001: «с развёрнутыми цитатами»). */}
    <details className="source-quote" open>
      <summary><span>Источник:</span> <strong>{message.source.title}</strong></summary>
      <blockquote>{message.source.excerpt}</blockquote>
      {href && <a href={href} target="_blank" rel="noopener nofollow noreferrer">Открыть страницу ↗</a>}
    </details>
  </li>;
}
export function OwnerChat(p: { companyName: string; messages: OwnerMessage[]; draft: string; busy: boolean; error: string; ready: boolean;
  onDraft: (value: string) => void; onAsk: () => void }) {
  return <div className="chat-window" role="group" aria-label={`Тестовый чат бота ${p.companyName}`}>
    <p className="chat-title"><strong>Проверка бота</strong> <span className="muted">— так ответит посетитель</span></p>
    {!p.ready && <p className="muted">Пока ни один источник не готов, бот на всё ответит «не знаю».</p>}
    {p.messages.length > 0 && <ul className="chat-log" aria-live="polite">{p.messages.map((m, i) => <OwnerMessageItem key={i} message={m} />)}</ul>}
    <form className="chat-form" onSubmit={(e) => { e.preventDefault(); p.onAsk(); }}>
      <label htmlFor="owner-question" className="visually-hidden">Вопрос боту</label>
      <input id="owner-question" name="question" type="text" autoComplete="off" maxLength={500} placeholder="Например: сколько стоит доставка?"
        value={p.draft} onChange={(e) => p.onDraft(e.target.value)} disabled={p.busy} />
      <button type="submit" disabled={p.busy}>{p.busy ? 'Ищем ответ…' : 'Спросить'}</button>
    </form>
    {p.error && <p role="alert" className="chat-error">{p.error}</p>}
    <p className="chat-foot muted">Тестовые вопросы расходуют суточный лимит ответов бота.</p>
  </div>;
}
