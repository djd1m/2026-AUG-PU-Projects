'use client';
// из N6: projects/06-rag-sales-chatbase/apps/web/src/app/upgrade/UpgradeScreen.tsx — адаптировано (фича 30 payments,
// OWN-019): один платный план, классы N5 (.status-panel/.notice/.secondary), экран интереса N5 не дублируется — при off
// страница /upgrade отвечает 404 (AC-1), а карточки показывают прежний ProInterest.
// Ключ повтора создаётся ОДИН раз на экран: двойной клик и повтор после сбоя попадают в то же намерение (long-running-job),
// кнопка гаснет, пока запрос жив («третья копия» исключена).
import { useState } from 'react';

export interface UpgradeCurrent { plan: 'free' | 'paid'; plan_source: string; plan_paid_until: string | null }
export interface UpgradeProps { title: string; price: string; days: number; paidMinutes: number; current: UpgradeCurrent }

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export function CurrentPlanNote({ current, title }: { current: UpgradeCurrent; title: string }) {
  if (current.plan !== 'paid') return null;
  if (current.plan_source === 'payment' && current.plan_paid_until) {
    return <p role="status" className="notice" data-state="current-paid">Сейчас у вас тариф {title} до {date(current.plan_paid_until)}. Оплата прибавит ещё срок к этой дате.</p>;
  }
  return <p role="status" className="notice" data-state="current-manual">Сейчас у вас тариф {title}, назначенный вручную, — платить не нужно.</p>;
}

export function UpgradeScreen(p: UpgradeProps) {
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pay = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: key }), cache: 'no-store' });
      const body = await response.json().catch(() => null) as { data?: { intent_id: string; redirect_url: string | null }; error?: { message?: string } } | null;
      if ((response.status === 201 || response.status === 200) && body?.data) {
        window.location.assign(body.data.redirect_url ?? `/upgrade/return?intent=${encodeURIComponent(body.data.intent_id)}`);
        return;
      }
      setError(body?.error?.message ?? 'Не удалось начать оплату. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); }
    setBusy(false);
  };
  return <section className="status-panel" aria-labelledby="upgrade-title" data-state="pay">
    <h1 id="upgrade-title">Тариф {p.title}</h1>
    <p><strong>{p.price}</strong> за {p.days} дней. Оплата разовая, без автопродления: продлить — оплатить ещё раз.</p>
    <ul>
      <li>Новые клипы — без метки КлипМейкера.</li>
      <li>Клипы хранятся без срока, пока действует тариф; после окончания — ещё 3 дня.</li>
      <li>До {p.paidMinutes} минут записи в день.</li>
    </ul>
    <p className="muted">Уже готовые клипы не перерисовываются: метка вшита в кадр.</p>
    <CurrentPlanNote current={p.current} title={p.title} />
    <p>Оплата картой или СБП через ЮKassa. После оплаты вернётесь сюда, и тариф включится сам.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => { void pay(); }}>{busy ? 'Переходим к оплате…' : `Оплатить ${p.price}`}</button>
    <p><a className="button secondary" href="/dashboard">В кабинет</a></p>
  </section>;
}
