'use client';
// Кабинет студии (фича partner-and-studio; FR-PARTNER-002, FR-GROWTH-004, SC-US-012-1/2). Свои боты — «Передать клиенту»
// (одноразовая ссылка на 7 дней, студия пересылает её сама: почтового провайдера нет); переданные — «только чтение»:
// числа за 7 дней, без текстов вопросов посетителей клиента (A-N6-045). Когорта по коду студии за 30 дней; пусто —
// «данных ещё нет», а не 0 % (CFG-I7).
import { useState } from 'react';
import type { StudioBotView, StudioCabinet } from '@n6/db';
import { dataOf, errorOf, send } from '../../../lib/api-client';

const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

export function StudioScreen({ cabinet, origin }: { cabinet: StudioCabinet; origin: string }) {
  const own = cabinet.bots.filter((b) => !b.transferred);
  const transferred = cabinet.bots.filter((b) => b.transferred);
  return <>
    <div className="cabinet-head"><h1>Кабинет студии</h1></div>
    {cabinet.plan !== 'studio' && <p role="status" className="notice cabinet-notice">
      Передавать ботов клиентам можно на плане «Студия». <a href="/pricing">Тарифы</a></p>}
    {cabinet.code && <section className="card stack" aria-labelledby="studio-code-title">
      <h2 id="studio-code-title">Код студии</h2>
      <p>Клиенты, принявшие ваших ботов, закрепляются за кодом <strong>{cabinet.code}</strong>. Ссылка для новых клиентов:</p>
      <p className="snippet">{`${origin}/r/${cabinet.code}`}</p>
    </section>}
    <section className="card stack" aria-labelledby="studio-cohort-title">
      <h2 id="studio-cohort-title">Клиенты за 30 дней</h2>
      {cabinet.cohort
        ? <ul className="summary-counts" aria-label="Клиенты за 30 дней">
          <li><strong>{cabinet.cohort.invites_accepted}</strong> <span>приняли бота</span></li>
          <li><strong>{cabinet.cohort.installs_30d}</strong> <span>установок виджета</span></li>
          <li><strong>{cabinet.cohort.answers_30d}</strong> <span>ответов посетителям</span></li>
          <li><strong>{cabinet.cohort.conversions}</strong> <span>оплатили</span></li>
        </ul>
        : <p className="empty">Данных ещё нет: они появятся, когда клиент примет бота и поставит виджет на сайт.</p>}
    </section>
    <section className="card stack" aria-labelledby="studio-own-title">
      <h2 id="studio-own-title">Ваши боты</h2>
      {own.length === 0
        ? <p className="muted">Своих непереданных ботов нет. <a href="/dashboard">Создать бота</a></p>
        : <ul className="plain-list stack">{own.map((bot) => <li key={bot.bot_id} className="stack">
          <p><strong>{bot.company_name}</strong> <a href={`/dashboard/bots/${bot.bot_id}`}>Открыть</a></p>
          {cabinet.plan === 'studio' && <TransferForm bot={bot} />}
        </li>)}</ul>}
    </section>
    <section className="card stack" aria-labelledby="studio-transferred-title">
      <h2 id="studio-transferred-title">Переданы клиентам · только чтение</h2>
      {transferred.length === 0
        ? <p className="muted">Пока никто не принял бота.</p>
        : <ul className="plain-list stack">{transferred.map((bot) => <li key={bot.bot_id}>
          <p><strong>{bot.company_name}</strong></p>
          <ul className="summary-counts" aria-label={`Итоги бота ${bot.company_name} за 7 дней`}>
            <li><strong>{bot.answered_7d}</strong> <span>ответил за 7 дней</span></li>
            <li><strong>{bot.unknown_7d}</strong> <span>не знал</span></li>
            <li><strong>{bot.installs}</strong> <span>установок</span></li>
          </ul>
        </li>)}</ul>}
    </section>
  </>;
}

export function TransferForm({ bot }: { bot: StudioBotView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const id = `transfer-${bot.bot_id}`;
  if (link) {
    return <div className="stack" role="status">
      <p className="notice">Ссылка для клиента действует до {date(link.expires_at)} и сработает один раз. Отправьте её клиенту сами:</p>
      <p className="snippet">{link.url}</p>
    </div>;
  }
  return <form className="stack" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { status, body } = await send(`/api/bots/${bot.bot_id}/invite`, 'POST', { email: form.get('email') });
      const data = dataOf<{ url: string; expires_at: string }>(body);
      if (status === 201 && data) setLink(data);
      else { const problem = errorOf(body); setError({ field: problem?.field, message: problem?.message ?? 'Не удалось создать ссылку. Повторите' }); }
    } catch { setError({ message: 'Нет связи с сервером. Повторите' }); }
    setBusy(false);
  }}>
    <div className="field"><label htmlFor={`${id}-email`}>Почта клиента</label>
      <input id={`${id}-email`} name="email" type="email" autoComplete="off" required
        aria-invalid={error?.field === 'email' || undefined} aria-describedby={error?.field === 'email' ? `${id}-error` : undefined} />
      {error?.field === 'email' && <p id={`${id}-error`} className="field-error">{error.message}</p>}</div>
    {error && error.field !== 'email' && <p role="alert" className="field-error">{error.message}</p>}
    <p><button type="submit" className="button secondary" disabled={busy}>{busy ? 'Создаю ссылку…' : 'Передать клиенту'}</button></p>
  </form>;
}
