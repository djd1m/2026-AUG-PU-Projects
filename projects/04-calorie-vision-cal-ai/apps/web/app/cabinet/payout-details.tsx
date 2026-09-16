'use client';

// Реквизиты выплаты партнёра (пункт 3, частично). Без них владелец переводит деньги «куда-то»:
// сегодня выплата фиксируется в кабинете, а адресата перевода продукт не знал вовсе.
//
// Номера карт здесь не принимаются, и это сказано ПРЯМО в подсказке — отказ на сервере человек
// увидел бы уже после ввода, а объяснение должно стоять до него.

import { useEffect, useState } from 'react';
import { fetchPayoutDetails, savePayoutDetails, type PayoutDetails } from './cabinet-request';

export function PayoutDetailsForm(): React.JSX.Element {
  const [current, setCurrent] = useState<PayoutDetails | null>(null);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'sbp' | 'other'>('sbp');
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const details = await fetchPayoutDetails();
      setCurrent(details);
      if (details?.method !== null && details?.method !== undefined) setMethod(details.method);
    })();
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const outcome = await savePayoutDetails(
      method === 'sbp' ? { method, phone, bank: bank === '' ? null : bank } : { method, note },
    );
    setPending(false);
    if (outcome.kind === 'saved') {
      setNotice({ ok: true, text: 'Реквизиты сохранены.' });
      setCurrent(await fetchPayoutDetails());
      setOpen(false);
      return;
    }
    setNotice({ ok: false, text: outcome.message });
  };

  const summary =
    current?.method === 'sbp'
      ? `СБП: ${current.phone_masked ?? ''}${current.bank === null ? '' : ` · ${current.bank}`}`
      : current?.method === 'other'
        ? `Иное: ${current.note ?? ''}`
        : 'не заданы — владелец не знает, куда переводить';

  return (
    <section className="card">
      <h3>Реквизиты выплаты</h3>
      <p className="muted">{summary}</p>
      {!open ? (
        <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setOpen(true)}>
          {current?.method === null || current?.method === undefined ? 'указать реквизиты' : 'изменить'}
        </button>
      ) : (
        <form className="limit__form" onSubmit={(e) => void submit(e)}>
          <nav className="cabinet__windows" aria-label="способ выплаты">
            <button type="button" className={`btn btn--tiny ${method === 'sbp' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMethod('sbp')}>
              СБП
            </button>
            <button type="button" className={`btn btn--tiny ${method === 'other' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setMethod('other')}>
              иное
            </button>
          </nav>
          {method === 'sbp' ? (
            <>
              <div className="limit__field">
                <label htmlFor="payout-phone">Телефон для СБП</label>
                <input id="payout-phone" className="stepper__input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" />
              </div>
              <div className="limit__field">
                <label htmlFor="payout-bank">Банк (необязательно)</label>
                <input id="payout-bank" className="stepper__input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Т-Банк" />
              </div>
            </>
          ) : (
            <div className="limit__field">
              <label htmlFor="payout-note">Как переводить</label>
              <input id="payout-note" className="stepper__input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ИП, счёт в Т-Банке, договор №12" />
            </div>
          )}
          <p className="muted">Номера карт не принимаем и не храним — только телефон для СБП или описание способа.</p>
          <button type="submit" className="btn btn--primary btn--wide" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить реквизиты'}
          </button>
        </form>
      )}
      {notice !== null ? (
        <p className={notice.ok ? 'muted' : 'limit__error'} role={notice.ok ? undefined : 'alert'}>
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
