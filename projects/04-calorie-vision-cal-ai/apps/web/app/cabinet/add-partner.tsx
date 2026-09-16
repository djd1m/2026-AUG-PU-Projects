'use client';

// Форма заведения партнёра в кабинете владельца (пункт 2, 16.09.2026). До неё блогер
// заводился SQL-запросом в базе — владелец не обязан открывать psql.
//
// Свёрнута по умолчанию: заведение партнёра — редкое действие, а кабинет каждый день читают
// ради денег, не ради формы.

import { useState } from 'react';
import { createPartner, PARTNER_CODE_RE } from './cabinet-request';

export function AddPartner({ onCreated }: { readonly onCreated: () => Promise<void> | void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (displayName.trim() === '' || contact.trim() === '') {
      setNotice({ ok: false, text: 'Имя и контакт обязательны.' });
      return;
    }
    if (!PARTNER_CODE_RE.test(normalizedCode)) {
      setNotice({ ok: false, text: 'Код — от 4 до 12 знаков: заглавная латиница и цифры.' });
      return;
    }
    setPending(true);
    setNotice(null);
    const outcome = await createPartner({ displayName: displayName.trim(), contact: contact.trim(), code: normalizedCode });
    setPending(false);
    if (outcome.kind === 'created') {
      setNotice({ ok: true, text: `Партнёр заведён. Его ссылка: /r/${outcome.code} — выпишите приглашение в списке ниже.` });
      setDisplayName('');
      setContact('');
      setCode('');
      await onCreated();
      return;
    }
    setNotice({ ok: false, text: outcome.message });
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setOpen(true)}>
        + завести партнёра
      </button>
    );
  }

  return (
    <form className="limit__form" onSubmit={(e) => void submit(e)}>
      <div className="limit__field">
        <label htmlFor="partner-name">Имя блогера</label>
        <input id="partner-name" className="stepper__input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Иван Петров" />
      </div>
      <div className="limit__field">
        <label htmlFor="partner-contact">Контакт</label>
        <input id="partner-contact" className="stepper__input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="@его_канал" />
      </div>
      <div className="limit__field">
        <label htmlFor="partner-code">Код (он же ссылка /r/КОД)</label>
        <input
          id="partner-code"
          className="stepper__input"
          value={code}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="BLOGER1"
        />
      </div>
      <p className="muted">Ставка — 50 % по умолчанию, как во всех договорённостях.</p>
      <button type="submit" className="btn btn--primary btn--wide" disabled={pending}>
        {pending ? 'Заводим…' : 'Завести партнёра'}
      </button>
      {notice !== null ? (
        <p className={notice.ok ? 'muted' : 'limit__error'} role={notice.ok ? undefined : 'alert'}>
          {notice.text}
        </p>
      ) : null}
    </form>
  );
}
