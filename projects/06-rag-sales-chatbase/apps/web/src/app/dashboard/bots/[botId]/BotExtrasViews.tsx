// Блоки экрана бота вне источников и чата: сводка за 7 дней (FR-BOT-004), демо-страница (FR-GROWTH-005), отметка
// «Я проверил ответы бота» (A-N6-035) и баннер месячного лимита (SC-US-007-2). Только разметка по пропсам — её же
// рендерит браузерный набор прибора (tests/browser/bot-cabinet.test.ts); состояние и запросы — BotScreen.
// Фича public-page-and-summary; отметка и баннер перенесены сюда из BotScreen (фича 12) без изменения текста.

export const VERIFY_RISK = 'Бот отвечает только по вашим материалам и к каждому ответу прикладывает фрагмент-источник. Но ссылка на фрагмент '
  + 'не доказывает, что текст ответа с ним совпадает: модель может добавить от себя — например, скидку или срок, которых в '
  + 'материалах нет. Задайте боту в чате выше вопросы, которые задают ваши клиенты, особенно о ценах, сроках и акциях. Пока '
  + 'отметки нет, посетители сайта видят «Бот ещё настраивается» и ваш контакт.';

export interface SummaryView { answered: number; unknown: number; refused_limit: number; last_unknown: { text: string; asked_at: string }[] }
const dateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Сводка: без процентов вовсе — «ответил / не знал / отказов» числами; пусто — «вопросов ещё не было» (CFG-I7).
export function SummaryBlock({ summary }: { summary: SummaryView | null }) {
  return <section className="card stack bot-extra" aria-labelledby="summary-title"><h2 id="summary-title">Вопросы посетителей за 7 дней</h2>
    {!summary ? <p role="status" className="notice danger-notice">Сводка временно недоступна. Обновите страницу позже.</p>
      : summary.answered + summary.unknown + summary.refused_limit === 0
        ? <p className="empty">Вопросов ещё не было. Они появятся здесь, когда посетители сайта или демо-страницы начнут спрашивать бота.</p>
        : <>
          <ul className="summary-counts" aria-label="Итоги за 7 дней">
            <li><strong>{summary.answered}</strong> <span>ответил</span></li>
            <li><strong>{summary.unknown}</strong> <span>не знал</span></li>
            <li><strong>{summary.refused_limit}</strong> <span>отказов по лимиту</span></li>
          </ul>
          {summary.last_unknown.length > 0 && <div className="stack">
            <h3>Вопросы, на которые бот не знал ответа</h3>
            <p className="muted">Добавьте страницу или PDF с ответом — бот начнёт отвечать на такие вопросы.</p>
            <ol className="plain-list question-list">
              {summary.last_unknown.map((q, i) => <li key={`${q.asked_at}-${i}`}><span>{q.text}</span> <time className="muted" dateTime={q.asked_at}>{dateTime(q.asked_at)}</time></li>)}
            </ol>
            <p><a className="button secondary" href="#sources-title">Добавить материалы</a></p>
          </div>}
        </>}
  </section>;
}

export interface PublishView { slug: string | null; enabled: boolean; indexable: boolean; url: string | null }
// Демо-страница: публикует и снимает владелец; индексация — отдельный явный переключатель, по умолчанию выключена.
export function PublishBlock(p: { page: PublishView; busy: boolean; error: string; onPublish: (enabled: boolean) => void; onIndexable: (indexable: boolean) => void }) {
  return <section className="card stack bot-extra" aria-labelledby="publish-title"><h2 id="publish-title">Демо-страница бота</h2>
    <p>Отдельная страница с чатом вашего бота на нашем сайте. Ссылкой можно поделиться в канале или мессенджере — посетители зададут вопросы, не заходя на ваш сайт.</p>
    {p.page.enabled && p.page.url
      ? <p role="status" className="notice">Опубликовано: <a href={p.page.url} target="_blank" rel="noopener">{p.page.url}</a></p>
      : <p role="status" className="notice">Не опубликовано{p.page.slug ? ': ссылка сейчас отвечает «страница не найдена»' : ''}.</p>}
    {p.error && <p role="alert" className="field-error">{p.error}</p>}
    <label className="check" htmlFor="publish-indexable">
      <input id="publish-indexable" type="checkbox" checked={p.page.indexable} disabled={p.busy} onChange={(e) => p.onIndexable(e.target.checked)} />
      <span>Разрешить поисковикам показывать страницу</span>
    </label>
    <p className="muted">По умолчанию страница закрыта от поисковиков: её видят только те, у кого есть ссылка.</p>
    <p><button type="button" className={p.page.enabled ? 'button secondary' : 'button'} disabled={p.busy} onClick={() => p.onPublish(!p.page.enabled)}>
      {p.busy ? 'Сохраняем…' : p.page.enabled ? 'Снять публикацию' : 'Опубликовать страницу'}</button></p>
  </section>;
}

export function VerifyBlock(p: { verified: boolean; busy: boolean; error: string; onToggle: () => void }) {
  return <section className="card stack bot-extra" aria-labelledby="verify-title"><h2 id="verify-title">Ответы на сайте</h2>
    <p>{VERIFY_RISK}</p>
    <p role="status" className={p.verified ? 'notice' : 'notice danger-notice'}>{p.verified ? 'Отмечено: посетители видят ответы бота.' : 'Не отмечено: посетители видят «Бот ещё настраивается».'}</p>
    {p.error && <p role="alert" className="field-error">{p.error}</p>}
    <p><button type="button" className={p.verified ? 'button secondary' : 'button'} disabled={p.busy} onClick={p.onToggle}>
      {p.verified ? 'Снять отметку' : 'Я проверил ответы бота'}</button></p></section>;
}

// Баннер исчерпания месяца называет, что тестовый чат владельца расходует тот же лимит (carry_over A-N6-033).
export function MonthBanner({ used, limit }: { used: number; limit: number }) {
  if (used < limit) return null;
  return <p role="alert" className="notice danger-notice cabinet-notice">Месячный лимит ответов исчерпан ({used} из {limit}): до 1-го числа посетители видят отказ с вашим контактом. Тестовые вопросы в кабинете расходуют тот же лимит. <a href="/pricing">Тарифы</a></p>;
}
