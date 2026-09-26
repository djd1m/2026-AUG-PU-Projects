'use client';
// Экран оформления (tariffs-and-interest). Донор — N4 projects/04-calorie-vision-cal-ai/apps/web/app/pro/screen.tsx —
// адаптировано: примитивы N6 (.card/.notice/.button), два режима — оплата ЮKassa и экран интереса (оплата не настроена).
// Ключ повтора создаётся ОДИН раз на экран: двойной клик и повтор после сбоя попадают в то же намерение (long-running-job),
// кнопка гаснет, пока запрос жив («третья копия» исключена).
import { useState } from 'react';
import { dataOf, errorOf, send } from '../../lib/api-client';

export interface UpgradeCurrent { plan: string; plan_source: string; plan_paid_until: string | null }
export interface UpgradeProps { plan: 'nobadge' | 'studio'; title: string; price: string; paymentsOn: boolean; current: UpgradeCurrent }

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function CurrentPlanNote({ current }: { current: UpgradeCurrent }) {
  if (current.plan === 'free') return null;
  const name = current.plan === 'studio' ? 'Студия' : 'Без бейджа';
  if (current.plan_source === 'payment' && current.plan_paid_until) {
    return <p role="status" className="notice">Сейчас у вас план «{name}» до {date(current.plan_paid_until)}. Оплата прибавит 30 дней.</p>;
  }
  return <p role="status" className="notice">Сейчас у вас план «{name}», назначенный вручную.</p>;
}

export function UpgradeScreen(p: UpgradeProps) {
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentsOn, setPaymentsOn] = useState(p.paymentsOn);
  const [interest, setInterest] = useState<'none' | 'recorded' | 'already_recorded'>('none');

  const pay = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { status, body } = await send('/api/checkout', 'POST', { plan: p.plan, idempotency_key: key });
      const data = dataOf<{ intent_id: string; redirect_url: string | null }>(body);
      if ((status === 201 || status === 200) && data) {
        window.location.assign(data.redirect_url ?? `/upgrade/return?intent=${encodeURIComponent(data.intent_id)}`);
        return;
      }
      const problem = errorOf(body);
      // Оплата выключена на сервере — экран интереса; кнопка обязана ожить (busy снимается ниже для ВСЕХ исходов, кроме ухода на форму).
      if (problem?.code === 'payments_off') setPaymentsOn(false);
      else setError(problem?.message ?? 'Не удалось начать оплату. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); }
    setBusy(false);
  };
  const ask = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { status, body } = await send('/api/interest', 'POST', { plan: p.plan, origin_screen: 'upgrade' });
      const data = dataOf<{ status: 'recorded' | 'already_recorded' }>(body);
      if (status === 200 && data) { setInterest(data.status); return; }
      setError(errorOf(body)?.message ?? 'Не удалось записать заявку. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); } finally { setBusy(false); }
  };

  return <section className="card stack upgrade" aria-labelledby="upgrade-title">
    <h1 id="upgrade-title">План «{p.title}»</h1>
    <p className="price">{p.price}<small>/30 дней</small></p>
    <p className="price-note">Цена предварительная. Оплата разовая, без автопродления.</p>
    <CurrentPlanNote current={p.current} />
    {paymentsOn
      ? <div className="stack" data-state="pay">
        <p>Оплата картой или СБП через ЮKassa. После оплаты вернётесь сюда, и план включится сам.</p>
        {error && <p role="alert" className="field-error">{error}</p>}
        <button type="button" className="button" disabled={busy} onClick={() => { void pay(); }}>{busy ? 'Переходим к оплате…' : `Оплатить ${p.price}`}</button>
      </div>
      : <div className="stack" data-state="interest">
        <p role="status" className="notice">Оплата скоро — сообщим.</p>
        {interest === 'none'
          ? <><p>Оставьте заявку: напишем на почту аккаунта, как только оплата откроется. Пока план можно получить по договорённости.</p>
            {error && <p role="alert" className="field-error">{error}</p>}
            <button type="button" className="button" disabled={busy} onClick={() => { void ask(); }}>{busy ? 'Записываем…' : 'Сообщите мне'}</button></>
          : <p role="status" className="notice">{interest === 'recorded' ? 'Записали. Напишем на почту аккаунта, когда оплата откроется.' : 'Заявка уже есть — сообщим, как только оплата откроется.'}</p>}
      </div>}
    <p><a className="button secondary" href="/pricing">Все тарифы</a></p>
  </section>;
}
