'use client';
// из N6: projects/06-rag-sales-chatbase/apps/web/src/app/upgrade/UpgradeScreen.tsx — адаптировано (фича 30 payments,
// OWN-019): один платный план, классы N5 (.status-panel/.notice/.secondary), экран интереса N5 не дублируется — при off
// страница /upgrade отвечает 404 (AC-1), а карточки показывают прежний ProInterest.
// Ключ повтора создаётся ОДИН раз на экран: двойной клик и повтор после сбоя попадают в то же намерение (long-running-job),
// кнопка гаснет, пока запрос жив («третья копия» исключена).
import { useState } from 'react';
import { CREDIT_SKUS,formatRubles,type CreditSku,type CreditPurchaseWindows } from '@clipmaker/shared/tariff';

export interface UpgradeCurrent { plan: 'free' | 'paid'; plan_source: string; plan_paid_until: string | null }
export interface UpgradeProps { purchaseWindows?: CreditPurchaseWindows; creditMode?: boolean; salesEnabled?: boolean; title: string; price: string; days: number; paidMinutes: number; current: UpgradeCurrent }

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
  const [keys]=useState(()=>({start_v1:newKey(),pro_v1:newKey(),addon_v1:newKey()}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pay = async (sku?:CreditSku) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sku ? {idempotency_key:keys[sku],sku} : { idempotency_key: key }), cache: 'no-store' });
      const body = await response.json().catch(() => null) as { data?: { intent_id: string; redirect_url: string | null }; error?: { message?: string } } | null;
      if ((response.status === 201 || response.status === 200) && body?.data) {
        window.location.assign(body.data.redirect_url ?? `/upgrade/return?intent=${encodeURIComponent(body.data.intent_id)}`);
        return;
      }
      setError(body?.error?.message ?? 'Не удалось начать оплату. Повторите');
    } catch { setError('Нет связи с сервером. Повторите'); }
    setBusy(false);
  };
  if (p.creditMode) return <section className="status-panel" aria-labelledby="credit-title"><h1 id="credit-title">Пакеты кредитов</h1>
    <p>1 кредит = 60 секунд обычной записи. Посекундный резерв до обработки, списание один раз при первом готовом клипе. Бонус при регистрации: 30 кредитов без срока.</p>
    <p>Покупка разовая, без автоматического списания. Старт и Про действуют 30 дней; неиспользованный остаток сгорает. Следующий базовый пакет начнётся после уже оплаченных базовых периодов.</p>
    {(Object.keys(CREDIT_SKUS) as CreditSku[]).map(sku=>{const offer=CREDIT_SKUS[sku];return <section key={sku} className="notice" aria-label={offer.title}>
      <h2>{offer.title}</h2><p><strong>{formatRubles(offer.priceMinor)}</strong> · {offer.credits} кредитов · {offer.hours} ч записи · 30 дней</p>
      <p>{offer.kind==='addon'?'Действует сразу после оплаты. Платные функции сохраняются все 30 дней, даже если кредиты закончились.':'Полная цена за следующий базовый период. Если оплаченного базового периода нет — действует с оплаты.'}</p>
      {p.purchaseWindows && <p data-state="prospective-period">При оплате сейчас: <time dateTime={offer.kind==='base'?p.purchaseWindows.baseStart:p.purchaseWindows.addonStart}>{date(offer.kind==='base'?p.purchaseWindows.baseStart:p.purchaseWindows.addonStart)}</time>
        {' '}— <time dateTime={offer.kind==='base'?p.purchaseWindows.baseEnd:p.purchaseWindows.addonEnd}>{date(offer.kind==='base'?p.purchaseWindows.baseEnd:p.purchaseWindows.addonEnd)}</time>.
        {offer.kind==='base' && p.purchaseWindows.scheduled && ' Начнётся позже, после уже оплаченных базовых периодов.'}</p>}
      <button disabled={busy || !p.salesEnabled || !p.purchaseWindows} onClick={()=>void pay(sku)}>{busy?'Переходим к оплате…':offer.kind==='addon'?'Купить сейчас':`Купить ${offer.title} на следующий период`}</button></section>;})}
    <p>Даты предварительные: другая покупка до подтверждения оплаты может сдвинуть базовый период, а время оплаты — начало дополнительного пакета. Итоговые даты покажем после подтверждения оплаты.</p>
    {!p.purchaseWindows && <p role="status">Не удалось определить даты пакетов. Обновите страницу перед оплатой.</p>}
    <p>Во время оплаченного периода новые клипы без метки; хранение — до конца оплаченного окна и ещё 3 дня. Немедленный переход с зачётом прошлых покупок пока недоступен: доступны Про на следующий период и дополнительный пакет сейчас.</p>
    {!p.salesEnabled && <p role="status">Продажа новых пакетов временно выключена. Ранее приобретённые кредиты сохраняются.</p>}
    {error && <p role="alert">{error}</p>}<a className="button secondary" href="/dashboard">В кабинет</a></section>;
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
