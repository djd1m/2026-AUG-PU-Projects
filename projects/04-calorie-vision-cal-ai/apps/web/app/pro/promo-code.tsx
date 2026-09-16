'use client';

// Поле «есть промокод» на экране Pro — второй вход для партнёрского кода (первый — ссылка
// `/r/{code}`). Нужен тем, кто пришёл без ссылки: услышал код в видео, увидел в описании канала.
//
// Источник — `explicit` (ADR-008): код, введённый руками, СИЛЬНЕЕ перехода по ссылке и
// вытесняет слабую привязку. Свёрнуто по умолчанию: подавляющее большинство приходит без кода,
// и открытое поле для них — лишний вопрос перед оплатой.

import { useState } from 'react';
import { applyCode, isValidCodeFormat, messageFor, normalizeCode } from '../partner/apply-code-request';

export function PromoCode(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const normalized = normalizeCode(code);
    if (!isValidCodeFormat(normalized)) {
      setNotice({ ok: false, text: 'Код — от 4 до 12 знаков: латинские буквы и цифры.' });
      return;
    }
    setPending(true);
    setNotice(null);
    const outcome = await applyCode(normalized, 'explicit');
    setPending(false);
    setNotice({ ok: outcome.kind === 'applied', text: messageFor(outcome, normalized) });
    if (outcome.kind === 'applied') setCode('');
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setOpen(true)}>
        есть промокод
      </button>
    );
  }

  return (
    <form className="limit__form" onSubmit={(e) => void submit(e)}>
      <div className="limit__field">
        <label htmlFor="promo-code">Промокод блогера</label>
        <input
          id="promo-code"
          className="stepper__input"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="BLOGER1"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <button type="submit" className="btn btn--ghost btn--wide" disabled={pending}>
        {pending ? 'Проверяем…' : 'Применить код'}
      </button>
      {notice !== null ? (
        <p className={notice.ok ? 'muted' : 'limit__error'} role={notice.ok ? undefined : 'alert'}>
          {notice.text}
        </p>
      ) : null}
    </form>
  );
}
