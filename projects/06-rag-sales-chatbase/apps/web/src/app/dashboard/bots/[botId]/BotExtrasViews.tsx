// Блоки экрана бота вне источников и чата: сводка за 7 дней (FR-BOT-004), демо-страница (FR-GROWTH-005), отметка
// «Я проверил ответы бота» (A-N6-035) и баннер месячного лимита (SC-US-007-2). Только разметка по пропсам — её же
// рендерит браузерный набор прибора (tests/browser/bot-cabinet.test.ts); состояние и запросы — BotScreen.
// Фича public-page-and-summary; отметка и баннер перенесены сюда из BotScreen (фича 12) без изменения текста.

import { stubVisitorsLine } from '../../GateBanner';

export const VERIFY_RISK = 'Бот отвечает только по вашим материалам и к каждому ответу прикладывает фрагмент-источник. Но ссылка на фрагмент '
  + 'не доказывает, что текст ответа с ним совпадает: модель может добавить от себя — например, скидку или срок, которых в '
  + 'материалах нет. Задайте боту в чате выше вопросы, которые задают ваши клиенты, особенно о ценах, сроках и акциях. Пока '
  + 'отметки нет, посетители сайта видят «Бот ещё настраивается» и ваш контакт.';

// not_verified_visitors (gate-onboarding, A-N6-066): посетители, получившие заглушку ворот A-N6-035, — отдельной строкой.
export interface SummaryView { answered: number; unknown: number; refused_limit: number; not_verified_visitors: number; last_unknown: { text: string; asked_at: string }[] }
const dateTime = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Стирание журнала вопросов бота владельцем (account-erasure, FR-AUTH-002, вторая фраза) — подтверждение в два шага,
// как у удаления источника (фича 16).
export interface EraseLogView { confirming: boolean; busy: boolean; error: string; done: boolean; onAsk: () => void; onConfirm: () => void; onCancel: () => void }
function EraseLog({ erase }: { erase: EraseLogView }) {
  return <div className="stack">
    {erase.done && <p role="status" className="notice">Журнал вопросов стёрт: тексты вопросов и история диалогов этого бота удалены.</p>}
    {erase.error && <p role="alert" className="field-error">{erase.error}</p>}
    {erase.confirming
      ? <><p className="notice danger-notice">Тексты вопросов и история диалогов этого бота удалятся без возможности восстановить.</p>
        <p className="cluster"><button type="button" className="button danger" disabled={erase.busy} onClick={erase.onConfirm}>{erase.busy ? 'Стираю…' : 'Стереть журнал'}</button>
          <button type="button" className="button secondary" disabled={erase.busy} onClick={erase.onCancel}>Отмена</button></p></>
      : <p><button type="button" className="button secondary" onClick={erase.onAsk}>Стереть журнал вопросов</button></p>}
  </div>;
}

// Сводка: без процентов вовсе — «ответил / не знал / отказов» числами; пусто — «вопросов ещё не было» (CFG-I7).
export function SummaryBlock({ summary, erase }: { summary: SummaryView | null; erase?: EraseLogView }) {
  return <section className="card stack bot-extra" aria-labelledby="summary-title"><h2 id="summary-title">Вопросы посетителей за 7 дней</h2>
    {!summary ? <p role="status" className="notice danger-notice">Сводка временно недоступна. Обновите страницу позже.</p>
      : summary.answered + summary.unknown + summary.refused_limit + summary.not_verified_visitors === 0
        ? <p className="empty">Вопросов ещё не было. Они появятся здесь, когда посетители сайта или демо-страницы начнут спрашивать бота.</p>
        : <>
          <ul className="summary-counts" aria-label="Итоги за 7 дней">
            <li><strong>{summary.answered}</strong> <span>ответил</span></li>
            <li><strong>{summary.unknown}</strong> <span>не знал</span></li>
            <li><strong>{summary.refused_limit}</strong> <span>отказов по лимиту</span></li>
          </ul>
          {summary.not_verified_visitors > 0 && <p className="notice danger-notice stub-count">{stubVisitorsLine(summary.not_verified_visitors)} — ответов
            они не увидели: нет отметки «Я проверил ответы бота».</p>}
          {summary.last_unknown.length > 0 && <div className="stack">
            <h3>Вопросы, на которые бот не знал ответа</h3>
            <p className="muted">Добавьте страницу или PDF с ответом — бот начнёт отвечать на такие вопросы.</p>
            <ol className="plain-list question-list">
              {summary.last_unknown.map((q, i) => <li key={`${q.asked_at}-${i}`}><span>{q.text}</span> <time className="muted" dateTime={q.asked_at}>{dateTime(q.asked_at)}</time></li>)}
            </ol>
            <p><a className="button secondary" href="#sources-title">Добавить материалы</a></p>
          </div>}
        </>}
    {summary && erase && <EraseLog erase={erase} />}
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
