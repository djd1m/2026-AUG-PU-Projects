'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ANALYTICS_READY, CONSENT_KEY, browserAnalytics, routeCategory } from '../lib/acquisition-analytics';

/** Consent is separate from guest publication consent. Unknown always means off. */
export function AcquisitionAnalytics({ counter }: { counter: number | null }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [consent, setConsent] = useState<'unknown' | 'yes' | 'no'>('unknown');
  useEffect(() => {
    try { const stored = localStorage.getItem(CONSENT_KEY); if (stored === 'yes' || stored === 'no') setConsent(stored); } catch { /* consent remains off */ } finally { setHydrated(true); }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const adapter = browserAnalytics();
    adapter.configure(counter, consent === 'yes', pathname, window.location.search);
    const active = !!counter && consent === 'yes' && !!routeCategory(pathname);
    const activity = () => adapter.activity();
    const visible = () => { if (document.visibilityState === 'visible') activity(); };
    if (active) {
      window.dispatchEvent(new Event(ANALYTICS_READY));
      window.addEventListener('pointerdown', activity, { passive: true });
      window.addEventListener('keydown', activity);
      document.addEventListener('visibilitychange', visible);
    }
    return () => {
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      document.removeEventListener('visibilitychange', visible);
      adapter.stop();
    };
  }, [counter, consent, pathname, hydrated]);
  function choose(next: 'yes' | 'no') {
    if (next === 'no') browserAnalytics().withdraw();
    try { localStorage.setItem(CONSENT_KEY, next); } catch { /* current tab choice still works */ }
    setConsent(next);
  }
  if (!counter || !routeCategory(pathname)) return null;
  return <aside className="notice" aria-label="Аналитика сайта">
    {consent === 'unknown' ? <><p>Разрешить Яндекс Метрику для оценки посещений, регистраций, готовых клипов и подтверждений оплаты? Это необязательно.</p>
      <button type="button" onClick={() => choose('yes')}>Разрешить аналитику</button>{' '}
      <button type="button" className="secondary" onClick={() => choose('no')}>Отказаться</button></>
      : <button type="button" className="text-button" onClick={() => choose(consent === 'yes' ? 'no' : 'yes')}>
        {consent === 'yes' ? 'Отключить аналитику' : 'Разрешить аналитику'}</button>}
  </aside>;
}
