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
  return <section className="limits-panel" aria-label="Остатки на сегодня"><h2>Осталось на сегодня</h2>
    <dl className="partner-counters">
      <div><dt>Загрузок</dt><dd>{remaining.uploads}</dd></div>
      <div><dt>Минут расшифровки</dt><dd>{remaining.minutes}</dd></div>
      <div><dt>Выделений и повторов</dt><dd>{remaining.selections}</dd></div>
    </dl><p className="muted">Первое выделение и каждый повтор используют один и тот же остаток.
      {' '}Лимиты обновятся {resetLabel(remaining.resets_at)}. Остатки обновляются каждые 30 секунд.</p>
  </section>;
}
