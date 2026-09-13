'use client';

// Экран достигнутого лимита (фича `pro-interest-and-limits-ui`, `RenderLimitScreen`,
// `02_pseudocode.md`). Показывается вместо результата, когда вызов, требующий скана,
// отвечает отказом по квоте — вызывающий (`scan-pipeline`) передаёт СЫРЫЕ `scope`/`reset_at`
// из тела ответа `POST /api/v1/scans`, эта фича их только форматирует (`03_architecture.md`,
// «Взаимодействие с соседними фичами»).
//
// Оплаты в неделе НЕТ (PD-PRICE-001): экран занимает её место, а не откладывает её
// (FR-pro-interest-and-limits-ui-4/8) — ни цены, ни тарифа, ни кнопки оплаты нет НИГДЕ в
// разметке, что проверяет снимок (`tests/integration/limit-screen-no-payment.test.tsx`).

import { useState, type FormEvent } from 'react';

export type RawScope = string | undefined;

/** Закрытый набор из ДВУХ значений, которые различает текст (FR-1). Третье — включая
 * гипотетическое `escalation`, которое сюда прийти не может по построению других фич
 * (`01_specification.md`, «Объём») — трактуется как САМОЕ ОБЩЕЕ (FR-2). */
export function isRecognizedScope(scope: RawScope): scope is 'user' | 'global' {
  return scope === 'user' || scope === 'global';
}

export function sourceScreenFor(scope: RawScope): 'user_limit' | 'global_limit' {
  return scope === 'user' ? 'user_limit' : 'global_limit';
}

export function reasonText(scope: RawScope): string {
  if (scope === 'user') return 'У вас на сегодня закончились сканы.';
  // Неопознанное трактуется как ОБЩИЙ случай — без утверждения о персональной причине,
  // которое могло бы оказаться неверным (`fail-closed-defaults`).
  return 'На сегодня лимит платформы исчерпан, это не про вас лично.';
}

/** Аномалия — сам показ экрана этим НЕ блокируется (FR-2, шаг 1 `RenderLimitScreen`). */
export function logUnknownScope(scope: RawScope): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('limit_screen_unknown_scope', { scope: scope ?? null });
  }
}

const RESET_FALLBACK = 'Лимит обновится ночью по московскому времени.';

/**
 * `reset_at`, успешно разобранный как дата, форматируется по `Europe/Moscow` (FR-3).
 * Неразбираемое или отсутствующее значение НЕ подставляется приблизительным временем
 * (`honest-configuration` CFG-I1/CFG-I4) — общая формулировка без конкретного часа.
 */
export function formatResetAt(resetAt: string | undefined, now: Date = new Date()): string {
  if (resetAt === undefined || resetAt.trim() === '') return RESET_FALLBACK;
  const parsed = new Date(resetAt);
  if (Number.isNaN(parsed.getTime())) return RESET_FALLBACK;

  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(parsed);

  const dayKey = (value: Date): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);

  if (dayKey(parsed) === dayKey(now)) return `Обновится в ${time} по Москве.`;

  // Дата обнуления НЕ сегодняшняя (отказ поздно вечером) — дата показывается тоже (FR-3).
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' }).format(parsed);
  return `Обновится в ${time} по Москве, ${date}.`;
}

/** Клиентская подсказка ДО отправки — удобство, не защита (FR-5): решение принимает сервер. */
export function contactHint(raw: string): 'email' | 'telegram' | null {
  const value = raw.trim();
  if (value === '') return null;
  if (value.includes('@') && value.lastIndexOf('.') > value.indexOf('@')) return 'email';
  if (/^@?[A-Za-z0-9_]{5,32}$/.test(value) || /^[1-9][0-9]{4,15}$/.test(value)) return 'telegram';
  return null;
}

async function submitInterest(contact: string, source: 'user_limit' | 'global_limit'): Promise<'recorded' | 'already_recorded' | 'invalid'> {
  const response = await fetch('/api/v1/interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ contact, source }),
  });
  if (response.ok) return 'recorded';
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  // Решение шага 4 `RenderLimitScreen`: `429 already_recorded_today` — это НЕ ошибка
  // пользователя, а подтверждение, что запись за сегодня уже есть.
  if (body?.error?.code === 'already_recorded_today') return 'already_recorded';
  return 'invalid';
}

export interface LimitScreenProps {
  readonly scope: RawScope;
  readonly resetAt: string | undefined;
}

export function LimitScreen({ scope, resetAt }: LimitScreenProps) {
  const [contact, setContact] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isRecognizedScope(scope)) logUnknownScope(scope);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPending(true);
    setError(null);
    submitInterest(contact, sourceScreenFor(scope))
      .then((outcome) => {
        if (outcome === 'recorded' || outcome === 'already_recorded') {
          setSubmitted(true);
          return;
        }
        setError('Не удалось сохранить контакт: проверьте значение (почта или Telegram) и попробуйте ещё раз.');
      })
      .catch(() => setError('Не удалось сохранить контакт: проверьте соединение и попробуйте ещё раз.'))
      .finally(() => setPending(false));
  };

  const hint = contactHint(contact);

  return (
    <main className="page" aria-label="экран лимита">
      <div className="card">
        <p className="limit__reason">{reasonText(scope)}</p>
        <p className="limit__reset">{formatResetAt(resetAt)}</p>
        <p className="limit__note">Оплаты сейчас нет — мы измеряем интерес к Pro, а не продаём его.</p>
      </div>
      {submitted ? (
        <p className="limit__submitted">Уже записали, спасибо.</p>
      ) : (
        <form className="limit__form" onSubmit={onSubmit}>
          <div className="limit__field">
            <label htmlFor="pro-interest-contact">Почта или Telegram</label>
            <input
              id="pro-interest-contact"
              name="contact"
              type="text"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="you@example.com или @username"
            />
            {hint !== null ? <span className="limit__hint">{hint === 'email' ? 'похоже на почту' : 'похоже на Telegram'}</span> : null}
          </div>
          <button type="submit" className="btn btn--primary btn--wide" disabled={pending}>
            Записать интерес
          </button>
          {error !== null ? (
            <p className="limit__error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}
