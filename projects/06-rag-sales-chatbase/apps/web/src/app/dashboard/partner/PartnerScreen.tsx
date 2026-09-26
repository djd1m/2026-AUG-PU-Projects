'use client';
// Кабинет партнёра (фича partner-and-studio; FR-PARTNER-001, FR-GROWTH-002/007; AC-13). Донор — N4 projects/04-calorie-
// vision-cal-ai/apps/web/app/cabinet/* — АДАПТИРОВАНО: примитивы N6 (.card/.notice/.summary-counts), кабинет по сессии.
// Показывает СУММЫ и даты, никогда — плательщиков (152-ФЗ). Обе суммы — «к выплате 5-го» и «перенесено» — заранее:
// перенос, обнаруженный по факту, читается как пропавшие деньги (N4 ADR-014).
import { useState } from 'react';
import type { PartnerCabinet } from '@n6/db';
import { formatRub } from '@n6/rag/commission';
import { dataOf, errorOf, send } from '../../../lib/api-client';

const GROUP: Readonly<Record<string, string>> = { studio: 'студия', partner: 'партнёр' };
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
const KIND: Readonly<Record<string, string>> = { accrual: 'Начисление', clawback: 'Сторно (возврат клиенту)', payout: 'Выплата' };

export function PartnerScreen({ cabinet, origin }: { cabinet: PartnerCabinet; origin: string }) {
  const m = cabinet.money;
  const c = cabinet.cohort;
  return <>
    <div className="cabinet-head"><h1>Партнёрская программа</h1></div>
    <section className="card stack" aria-labelledby="codes-title">
      <h2 id="codes-title">{cabinet.codes.length === 1 ? 'Ваш код' : 'Ваши коды'}</h2>
      <p className="muted">20 % с оплат привлечённых клиентов в течение 12 месяцев с их первой оплаты. Начисление доступно к выплате через 30 дней.</p>
      <ul className="plain-list stack">
        {cabinet.codes.map((code) => <li key={code.code} className="stack">
          <p><strong>{code.code}</strong> <span className="muted">· {GROUP[code.group] ?? code.group}</span></p>
          {code.frozen
            ? <p role="status" className="notice danger-notice">Код приостановлен до проверки: слишком много регистраций с одного адреса. Напишите нам — разберёмся.</p>
            : <p className="snippet">{`${origin}/r/${code.code}`}</p>}
        </li>)}
      </ul>
    </section>
    <section className="card stack" aria-labelledby="cohort-title">
      <h2 id="cohort-title">Привлечённые</h2>
      {c.registrations === 0 && c.rejected === 0
        ? <p className="muted">Регистраций по вашим кодам ещё не было.</p>
        : <ul className="summary-counts" aria-label="Привлечённые по вашим кодам">
          <li><strong>{c.registrations}</strong> <span>регистраций</span></li>
          <li><strong>{c.installs}</strong> <span>установили виджет</span></li>
          <li><strong>{c.conversions}</strong> <span>оплатили</span></li>
          {c.rejected > 0 && <li><strong>{c.rejected}</strong> <span>не засчитано (свой код)</span></li>}
        </ul>}
    </section>
    <section className="card stack" aria-labelledby="money-title">
      <h2 id="money-title">Деньги</h2>
      {m.debt_minor > 0
        ? <p role="status" className="notice">Клиенту вернули оплату после выплаты: {formatRub(m.debt_minor)} зачтутся из будущих начислений. Взыскивать не будем.</p>
        : <ul className="summary-counts" aria-label="Деньги">
          <li><strong>{formatRub(m.due_minor)}</strong> <span>к выплате {date(m.payout_date)}</span></li>
          <li><strong>{formatRub(m.deferred_minor)}</strong> <span>перенесено на следующий месяц</span></li>
        </ul>}
      <p className="muted">Выплата — раз в месяц 5-го числа по СБП, от {formatRub(m.minimum_minor)}. Меньшая сумма переносится на следующий месяц.</p>
      {cabinet.entries.length > 0 && <div className="table-wrap" role="region" aria-label="Последние движения денег" tabIndex={0}><table>
        <thead><tr><th scope="col">Движение</th><th scope="col">Сумма</th><th scope="col">Дата</th></tr></thead>
        <tbody>{cabinet.entries.map((e, i) => <tr key={`${e.created_at}-${i}`}><td>{KIND[e.kind] ?? e.kind}</td><td>{formatRub(e.amount_minor)}</td><td>{date(e.created_at)}</td></tr>)}</tbody>
      </table></div>}
    </section>
    <PayoutDetailsForm current={cabinet.payout_details} />
  </>;
}

export function PayoutDetailsForm({ current }: { current: PartnerCabinet['payout_details'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  return <section className="card stack" aria-labelledby="payout-title">
    <h2 id="payout-title">Реквизиты для выплаты</h2>
    {current
      ? <p role="status" className="notice">СБП: {current.phone_masked}{current.bank ? ` · ${current.bank}` : ''}</p>
      : <p className="muted">Без реквизитов выплату не провести. Номер карты не принимаем — только телефон для СБП.</p>}
    {saved && <p role="status" className="notice">Реквизиты сохранены</p>}
    <form className="stack" onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(null); setSaved(false);
      const form = new FormData(event.currentTarget);
      try {
        const { status, body } = await send('/api/partner/payout-details', 'POST', { method: 'sbp', phone: form.get('phone'), bank: form.get('bank') || null });
        if (status === 200 && dataOf(body)) { setSaved(true); }
        else { const problem = errorOf(body); setError({ field: problem?.field, message: problem?.message ?? 'Не удалось сохранить. Повторите' }); }
      } catch { setError({ message: 'Нет связи с сервером. Повторите' }); }
      setBusy(false);
    }}>
      <div className="field"><label htmlFor="payout-phone">Телефон для СБП</label>
        <input id="payout-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+7 900 000-00-00"
          aria-invalid={error?.field === 'phone' || undefined} aria-describedby={error?.field === 'phone' ? 'payout-phone-error' : undefined} />
        {error?.field === 'phone' && <p id="payout-phone-error" className="field-error">{error.message}</p>}</div>
      <div className="field"><label htmlFor="payout-bank">Банк (необязательно)</label>
        <input id="payout-bank" name="bank" type="text" maxLength={100}
          aria-invalid={error?.field === 'bank' || undefined} aria-describedby={error?.field === 'bank' ? 'payout-bank-error' : undefined} />
        {error?.field === 'bank' && <p id="payout-bank-error" className="field-error">{error.message}</p>}</div>
      {error && !error.field && <p role="alert" className="field-error">{error.message}</p>}
      <p><button type="submit" className="button" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить реквизиты'}</button></p>
    </form>
  </section>;
}

export function NotPartner() {
  return <section className="card stack" aria-labelledby="not-partner-title">
    <h1 id="not-partner-title">Партнёрская программа</h1>
    <p>Приводите владельцев сайтов в Суфлёр и получайте 20 % с их оплат в течение года.</p>
    <p className="muted">Код партнёра выдаём по запросу — напишите нам. Студия получает свой код автоматически, когда впервые передаёт бота клиенту.</p>
    <p><a className="button secondary" href="/dashboard">К ботам</a></p>
  </section>;
}
