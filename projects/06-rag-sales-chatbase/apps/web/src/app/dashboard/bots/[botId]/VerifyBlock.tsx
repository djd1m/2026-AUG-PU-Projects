'use client';
// Блок «Ответы на сайте» (A-N6-035) — verify-audit (A-N6-077, инцидент стенда 28.09). Прежде здесь была ОДНА кнопка-
// переключатель: после «Я проверил ответы бота» та же кнопка на том же месте становилась «Снять отметку», и второе нажатие
// молча выключало ответы посетителям. Теперь:
//   · «Я проверил ответы бота» ставит отметку одним нажатием (onSet — только установка);
//   · «Снять отметку» — второстепенная кнопка, которая НИЧЕГО не отправляет, а раскрывает подтверждение (role="alertdialog",
//     фокус на «Отмена» — безопасное по умолчанию; Escape и «Отмена» закрывают и возвращают фокус на кнопку);
//   · onUnset зовёт только кнопка «Снять» подтверждения.
// Строка «стоит с / снята когда и кем» и последние события — из журнала bot_verification_event (миграция 014).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export const VERIFY_RISK = 'Бот отвечает только по вашим материалам и к каждому ответу прикладывает фрагмент-источник. Но ссылка на фрагмент '
  + 'не доказывает, что текст ответа с ним совпадает: модель может добавить от себя — например, скидку или срок, которых в '
  + 'материалах нет. Задайте боту в чате выше вопросы, которые задают ваши клиенты, особенно о ценах, сроках и акциях. Пока '
  + 'отметки нет, посетители сайта видят «Бот ещё настраивается» и ваш контакт.';
export const UNSET_WARNING = 'Посетители сайта перестанут получать ответы и увидят «Бот ещё настраивается». Снять?';

export type VerificationEventKind = 'set' | 'unset_owner' | 'unset_new_material';
export interface VerificationEventView { kind: VerificationEventKind; at: string }
export interface VerifyBlockProps {
  verified: boolean;
  busy: boolean;
  error: string;
  // Дата установки стоящей отметки (ISO); null — не стоит или неизвестна.
  verifiedAt: string | null;
  // Последние события журнала, новые первыми.
  events: VerificationEventView[];
  onSet: () => void;
  onUnset: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const EVENT_TEXT: Record<VerificationEventKind, string> = {
  set: 'поставлена владельцем',
  unset_owner: 'снята владельцем',
  unset_new_material: 'снята из-за новых материалов',
};

// Строка состояния под заголовком: когда поставлена или когда и почему снята. Нет данных — не выдумываем дату.
export function verificationLine(verified: boolean, verifiedAt: string | null, events: VerificationEventView[]): string | null {
  if (verified) return verifiedAt ? `Отметка стоит с ${when(verifiedAt)}.` : null;
  const last = events[0];
  if (!last || last.kind === 'set') return null;
  return `Снята ${when(last.at)} ${last.kind === 'unset_owner' ? 'владельцем' : 'из-за новых материалов'}.`;
}

export function VerifyBlock(p: VerifyBlockProps) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // Отметку сняли (здесь или сервером) — подтверждение больше не о чем спрашивать.
  useEffect(() => { if (!p.verified) setConfirming(false); }, [p.verified]);
  useEffect(() => { if (confirming) cancel.current?.focus(); }, [confirming]);
  const close = () => { setConfirming(false); trigger.current?.focus(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !p.busy) { event.preventDefault(); close(); } };
  const line = verificationLine(p.verified, p.verifiedAt, p.events);
  return <section className="card stack bot-extra" aria-labelledby="verify-title"><h2 id="verify-title">Ответы на сайте</h2>
    <p>{VERIFY_RISK}</p>
    <p role="status" className={p.verified ? 'notice' : 'notice danger-notice'}>
      {p.verified ? 'Отмечено: посетители видят ответы бота.' : 'Не отмечено: посетители видят «Бот ещё настраивается».'}
      {line && <> <span className="verify-since">{line}</span></>}</p>
    {p.error && <p role="alert" className="field-error">{p.error}</p>}
    {p.verified
      ? <p><button ref={trigger} type="button" className="button secondary" disabled={p.busy} aria-expanded={confirming} aria-controls="verify-unset"
        onClick={() => setConfirming(true)}>Снять отметку</button></p>
      : <p><button ref={trigger} type="button" className="button" disabled={p.busy} onClick={p.onSet}>{p.busy ? 'Сохраняем…' : 'Я проверил ответы бота'}</button></p>}
    {p.verified && confirming && <div id="verify-unset" role="alertdialog" aria-labelledby="verify-unset-title" aria-describedby="verify-unset-text"
      className="notice danger-notice stack verify-confirm" onKeyDown={onKey}>
      <h3 id="verify-unset-title">Снять отметку «Я проверил ответы бота»?</h3>
      <p id="verify-unset-text">{UNSET_WARNING}</p>
      <p className="cluster">
        <button type="button" className="button danger" disabled={p.busy} onClick={p.onUnset}>{p.busy ? 'Снимаем…' : 'Снять'}</button>
        <button ref={cancel} type="button" className="button secondary" disabled={p.busy} onClick={close}>Отмена</button></p>
    </div>}
    {p.events.length > 0 && <details className="verify-history">
      <summary>История отметки</summary>
      <ol className="plain-list">
        {p.events.map((e, i) => <li key={`${e.at}-${i}`}><time dateTime={e.at}>{when(e.at)}</time> — {EVENT_TEXT[e.kind]}</li>)}
      </ol>
    </details>}
  </section>;
}
