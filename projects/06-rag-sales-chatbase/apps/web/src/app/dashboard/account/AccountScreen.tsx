'use client';
// Экран удаления аккаунта (фича account-erasure; FR-AUTH-002, AC-13; решения владельца A-N6-054). Донор — N5
// projects/05-podcast-clips-opus/apps/web/src/app/dashboard/AccountDeletion.tsx — АДАПТИРОВАНО: примитивы N6 (.card,
// .notice, .check, .danger), повторный ввод пароля, последствия перечислены ДО подтверждения: боты и виджеты, боты у
// клиентов студии, сгорающие оплаченные дни, деньги партнёра (к выплате и долг сервиса — ничего не сгорает, A-N6-061), хранение записей оплат 5 лет.
import { useState } from 'react';
import type { ErasurePreview } from '@n6/db';
import { formatRub } from '@n6/rag/commission';
import { errorOf, send } from '../../../lib/api-client';

export function Consequences({ preview }: { preview: ErasurePreview }) {
  const items: string[] = [];
  items.push(preview.bots > 0
    ? `Удалим ваших ботов (${preview.bots}) вместе с источниками, фрагментами и журналами вопросов. Виджеты на сайтах перестанут отвечать сразу.`
    : 'Ботов у аккаунта нет — удалятся только данные аккаунта.');
  if (preview.clientBots > 0) items.push(`Боты, переданные клиентам (${preview.clientBots}), останутся у клиентов — у вас пропадёт только просмотр.`);
  if (preview.paidDaysLeft !== null) items.push(`Оплаченные дни плана (${preview.paidDaysLeft}) сгорят. Вернуть деньги можно по заявке в поддержку.`);
  if (preview.partner) {
    if (preview.partner.payoutMinor > 0) items.push(`К выплате ${formatRub(preview.partner.payoutMinor)} — переведём по реквизитам СБП до завершения удаления.`);
    if (preview.partner.debtMinor > 0) items.push(`Невыплаченное останется за вами как долг сервиса: ${formatRub(preview.partner.debtMinor)}, выплату запросите в поддержке.`);
  }
  items.push('Записи об оплатах и выплатах хранятся 5 лет без вашей почты — этого требует закон о бухгалтерском учёте.');
  return <ul className="stack" aria-label="Что произойдёт">{items.map((text) => <li key={text}>{text}</li>)}</ul>;
}

export function AccountDeletionForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  return <form className="stack" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const { status, body } = await send('/api/account', 'DELETE', { confirm: form.get('confirm') === 'on', password: String(form.get('password') ?? '') });
      if (status === 202) { window.location.assign('/account/erased'); return; }
      const problem = errorOf(body);
      setError({ field: problem?.field, message: problem?.message ?? 'Не удалось запросить удаление. Повторите' });
    } catch { setError({ message: 'Нет связи с сервером. Повторите' }); }
    setBusy(false);
  }}>
    <div className="field"><label htmlFor="erase-password">Пароль от аккаунта</label>
      <input id="erase-password" name="password" type="password" autoComplete="current-password" required
        aria-invalid={error?.field === 'password' || undefined} aria-describedby={error?.field === 'password' ? 'erase-password-error' : undefined} />
      {error?.field === 'password' && <p id="erase-password-error" className="field-error">{error.message}</p>}</div>
    <label className="check"><input type="checkbox" name="confirm" required
      aria-invalid={error?.field === 'confirm' || undefined} aria-describedby={error?.field === 'confirm' ? 'erase-confirm-error' : undefined} />
      Понимаю: удаление необратимо, отменить его нельзя</label>
    {error?.field === 'confirm' && <p id="erase-confirm-error" className="field-error">{error.message}</p>}
    {error && !error.field && <p role="alert" className="field-error">{error.message}</p>}
    <p><button type="submit" className="button danger" disabled={busy}>{busy ? 'Запрашиваю удаление…' : 'Удалить аккаунт навсегда'}</button></p>
  </form>;
}

export function AccountScreen({ preview }: { preview: ErasurePreview }) {
  return <section className="card stack" aria-labelledby="erase-title">
    <h1 id="erase-title">Удаление аккаунта</h1>
    <p className="notice danger-notice">Отменить удаление нельзя. Вход закроется сразу, данные сотрём не позже чем через 72 часа.</p>
    <Consequences preview={preview} />
    <AccountDeletionForm />
    <p><a className="button secondary" href="/dashboard">К ботам</a></p>
  </section>;
}
