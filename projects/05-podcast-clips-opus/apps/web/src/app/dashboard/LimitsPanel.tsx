'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resetLabel, type RemainingLimits } from '../../lib/limits-contract';

export function LimitsPanel({ remaining }: { remaining: RemainingLimits }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [router]);
  if (remaining.owner_unlimited === true) return <section className="limits-panel" aria-label="Без лимитов"><h2>Без лимитов</h2>
    <p>Загрузки, минуты обработки, выделения и пересборки — без дневных лимитов и списания кредитов.</p>
    <p className="muted">Доступны возможности Pro. Сохраняются ограничения размера и длительности файла, очередь обработки и доступность сервиса.</p></section>;
  if (remaining.credits) {
    const c=remaining.credits, credit=(n:number)=>(n/60).toLocaleString('ru-RU',{maximumFractionDigits:2});
    return <section className="limits-panel" aria-label="Баланс кредитов"><h2>Баланс кредитов</h2>
      <dl className="partner-counters"><div><dt>Доступно кредитов</dt><dd>{credit(c.available_seconds)}</dd></div>
      <div><dt>Часов обычной записи</dt><dd>{(c.available_seconds/3600).toLocaleString('ru-RU',{maximumFractionDigits:2})}</dd></div>
      <div><dt>Зарезервировано кредитов</dt><dd>{credit(c.reserved_seconds)}</dd></div></dl>
      {!!c.recovery_seconds && <p>Ещё {credit(c.recovery_seconds)} кредитов восстановлено на 24 часа только для повтора исходной записи.</p>}
      <p>1 кредит = 60 секунд исходной записи. Списание посекундное, за запись один раз.</p>
      <p>{c.next_expiry ? `Ближайшее окончание пакета: ${resetLabel(c.next_expiry)}.` : 'Бонусные кредиты не сгорают.'}</p>
      <p className="muted">Операционные ограничения: загрузок {remaining.uploads}, минут обработки {remaining.minutes}, выделений {remaining.selections} на сегодня.
      {' '}Эти ограничения обновятся {resetLabel(remaining.resets_at)}. Кредиты автоматически не пополняются.</p>
      <a className="button secondary" href="/upgrade?from=partner_dashboard">Выбрать пакет</a></section>;
  }
  return <section className="limits-panel" aria-label="Остатки на сегодня"><h2>Осталось на сегодня</h2>
    <dl className="partner-counters">
      <div><dt>Загрузок</dt><dd>{remaining.uploads}</dd></div>
      <div><dt>Минут расшифровки</dt><dd>{remaining.minutes}</dd></div>
      <div><dt>Выделений и повторов</dt><dd>{remaining.selections}</dd></div>
    </dl><p className="muted">Первое выделение и каждый повтор используют один и тот же остаток.
      {' '}Лимиты обновятся {resetLabel(remaining.resets_at)}. Остатки обновляются каждые 30 секунд.</p>
  </section>;
}
