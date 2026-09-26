// Экраны предпросмотра (фича preview-flow, CJM H: «Чтение сайта» → «Предпросмотр на ВАШЕМ сайте»). Только разметка по
// пропсам, без состояния и запросов: ту же разметку рендерит браузерный набор прибора (tests/browser/preview-flow.test.ts),
// состояние и опрос — PreviewScreen. Написано заново (ADR-016); классы и токены — design-shell (globals.css).
// Три состояния задачи различимы на экране (long-running-job): прогресс «k из ≤ 20» · окно чата · причина отказа;
// четвёртое — «нет ответа», а не вечный прогресс.
export type JobState = 'running' | 'done' | 'failed' | 'no_response';
export interface PreviewJobView { index_job_id: string; state: JobState; pages_done: number; pages_total: number | null; page_budget: number; chunks_done: number; reason?: string }
export interface PreviewSiteView { host: string; title: string; h1: string; suggestions: string[] }
export interface SourceView { title: string; url: string | null; excerpt: string }
export type ChatMessage =
  | { kind: 'question'; text: string }
  | { kind: 'answered'; text: string; source: SourceView; firstAnswer: boolean }
  | { kind: 'unknown'; text: string }
  | { kind: 'refused'; text: string };

// Причины канона §4 (index_job.failure_reason) → текст владельцу. Неизвестная — как internal.
const REASONS: Readonly<Record<string, { title: string; hint: string }>> = {
  robots_disallowed: { title: 'Сайт запрещает чтение роботам (robots.txt)', hint: 'Сохраните бота и загрузите прайс или памятку в PDF — бот ответит по ним.' },
  unreachable: { title: 'Сайт не открылся', hint: 'Проверьте адрес: сайт должен открываться без входа по паролю.' },
  blocked_address: { title: 'Этот адрес мы не читаем', hint: 'Адрес ведёт во внутреннюю или служебную сеть. Укажите публичный адрес сайта.' },
  no_text: { title: 'На сайте не нашлось текста', hint: 'Похоже, страницы собираются скриптами в браузере. Загрузите материалы в PDF после сохранения.' },
  quota_refused: { title: 'Бюджет предпросмотра исчерпан', hint: 'Предпросмотр читает до 20 страниц. Зарегистрируйтесь, чтобы прочитать сайт целиком.' },
  embedding_unavailable: { title: 'Сервис обработки текста временно недоступен', hint: 'Попробуйте через несколько минут.' },
  stalled: { title: 'Чтение сайта прервалось', hint: 'Задача не отвечала больше 5 минут. Попробуйте ещё раз.' },
  internal: { title: 'Не удалось прочитать сайт', hint: 'Попробуйте ещё раз или укажите другой адрес.' },
};
export const reasonText = (reason: string | undefined) => REASONS[reason ?? 'internal'] ?? REASONS.internal!;
const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

export function PreviewProgress({ host, view }: { host: string; view: PreviewJobView }) {
  if (view.state === 'failed') {
    const text = reasonText(view.reason);
    return <section className="preview-status stack" aria-labelledby="preview-title">
      <h1 id="preview-title" className="page-title">Бот не собрался</h1>
      <p role="alert" className="notice danger-notice"><strong>{text.title}.</strong> {text.hint}</p>
      <p className="muted">Задача {view.index_job_id}{host ? ` · ${host}` : ''}</p>
      <p><a className="button" href="/#site-url">Попробовать другой адрес</a></p>
    </section>;
  }
  if (view.state === 'no_response') {
    return <section className="preview-status stack" aria-labelledby="preview-title">
      <h1 id="preview-title" className="page-title">Проверяем, что с чтением сайта</h1>
      <p role="status" className="notice">Больше 5 минут не было новостей от задачи — это не «ещё читаем». Мы перепроверим и закроем её с причиной, если она остановилась.</p>
      <p className="muted">Задача {view.index_job_id}</p>
      <p><a className="button secondary" href="/#site-url">Начать с другим адресом</a></p>
    </section>;
  }
  const total = Math.min(view.pages_total ?? view.page_budget, view.page_budget);
  const done = Math.min(view.pages_done, total || view.page_budget);
  return <section className="preview-status stack" aria-labelledby="preview-title">
    <h1 id="preview-title" className="page-title">Читаем {host || 'сайт'}</h1>
    <p className="muted">Задача {view.index_job_id} · обычно 1–3 минуты</p>
    <div className="progress" role="progressbar" aria-label="Прочитано страниц" aria-valuemin={0} aria-valuemax={view.page_budget} aria-valuenow={done}
      aria-valuetext={`${done} из ${view.page_budget}`}><span style={{ width: `${Math.round((done / view.page_budget) * 100)}%` }} /></div>
    <p aria-live="polite">Читаем сайт: <strong>{done}</strong> из ≤ {view.page_budget} страниц · фрагментов: {view.chunks_done}</p>
    <ol className="plain-list muted">
      <li>robots.txt прочитан — обходим вежливо, по одной странице в секунду.</li>
      <li>Текст страниц режем на фрагменты: по ним бот и будет отвечать.</li>
      <li>Предпросмотр читает до {view.page_budget} страниц; после регистрации — весь сайт и PDF.</li>
    </ol>
  </section>;
}

function Message({ message, signedIn, onSave, saving }: { message: ChatMessage; signedIn: boolean; onSave: () => void; saving: boolean }) {
  if (message.kind === 'question') return <li className="chat-question">{message.text}</li>;
  if (message.kind === 'refused') {
    // role=alert — на вложенном элементе: у <li> роль остаётся listitem (axe: list).
    return <li className="chat-answer chat-refused"><span role="alert">{message.text}</span>{' '}
      <a href="/login?mode=register&from=preview">Зарегистрироваться</a></li>;
  }
  if (message.kind === 'unknown') return <li className="chat-answer">{message.text}</li>;
  const href = safeHref(message.source.url);
  return <li className="chat-answer-group">
    <div className="chat-answer">{message.text}</div>
    {/* Владельцу в предпросмотре — развёрнутая цитата по умолчанию (FR-WIDGET-004, PD-INSIGHT-001). */}
    <details className="source-quote" open>
      <summary><span>Источник:</span> <strong>{message.source.title}</strong></summary>
      <blockquote>{message.source.excerpt}</blockquote>
      {href && <a href={href} target="_blank" rel="noopener nofollow noreferrer">Открыть страницу ↗</a>}
    </details>
    {/* FR-GROWTH-001: призыв РОВНО под первым answered этого бота (сервер решает, первый ли). */}
    {message.firstAnswer && <div className="aha stack" role="region" aria-label="Бот готов">
      <p><strong className="accent-text">✓ Бот ответил по вашему сайту и показал источник.</strong></p>
      {signedIn
        ? <button type="button" onClick={onSave} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить бота и поставить на сайт'}</button>
        : <a className="button" href="/login?mode=register&from=preview">Сохранить бота и поставить на сайт</a>}
    </div>}
  </li>;
}

export interface PreviewChatProps {
  site: PreviewSiteView; messages: ChatMessage[]; questionsLeft: number | null; draft: string; busy: boolean; error: string;
  signedIn: boolean; saving: boolean;
  onDraft: (value: string) => void; onAsk: (question: string) => void; onSave: () => void;
}
export function PreviewChat(p: PreviewChatProps) {
  const host = p.site.host || 'ваш сайт';
  return <section className="preview-screen" aria-labelledby="preview-title">
    <div className="preview-head">
      <h1 id="preview-title" className="page-title">Спросите бота, как спросил бы клиент</h1>
      <p className="muted">Так бот будет выглядеть на {host}. Ответы — только по прочитанным страницам.</p>
    </div>
    <div className="preview-grid">
      <div className="chat-window" role="group" aria-label={`Бот сайта ${host}`}>
        <p className="chat-title"><strong>Бот {host}</strong></p>
        {p.messages.length > 0 && <ul className="chat-log" aria-live="polite">{p.messages.map((m, i) =>
          <Message key={i} message={m} signedIn={p.signedIn} onSave={p.onSave} saving={p.saving} />)}</ul>}
        {p.messages.length === 0 && p.site.suggestions.length > 0 && <div className="suggestions" role="group" aria-label="Подсказки">
          {p.site.suggestions.map((s) => <button key={s} type="button" className="secondary" disabled={p.busy} onClick={() => p.onAsk(s)}>{s}</button>)}
        </div>}
        <form className="chat-form" onSubmit={(event) => { event.preventDefault(); p.onAsk(p.draft); }}>
          <label htmlFor="preview-question" className="visually-hidden">Ваш вопрос</label>
          <input id="preview-question" name="question" type="text" autoComplete="off" maxLength={500} placeholder="Например: сколько стоит доставка?"
            value={p.draft} onChange={(event) => p.onDraft(event.target.value)} disabled={p.busy} />
          <button type="submit" disabled={p.busy}>{p.busy ? 'Ищем ответ…' : 'Спросить'}</button>
        </form>
        {p.error && <p role="alert" className="chat-error">{p.error}</p>}
        <p className="chat-foot muted">
          {p.questionsLeft !== null && <span>Осталось вопросов сегодня: {p.questionsLeft}. </span>}
          <a className="powered" href="/">Работает на Суфлёре</a>
        </p>
      </div>
      {/* Макет страницы — заголовок и первый H1 сайта (ADR-007: не скриншот). */}
      <div className="site-mock" aria-label={`Макет страницы ${host}`} role="img">
        <p className="mock-bar"><span aria-hidden="true">●●●</span> {host}</p>
        <p className="mock-title">{p.site.title || host}</p>
        {p.site.h1 && <p className="mock-h1">{p.site.h1}</p>}
        <p className="mock-lines" aria-hidden="true"><span /><span /><span /></p>
      </div>
    </div>
  </section>;
}
