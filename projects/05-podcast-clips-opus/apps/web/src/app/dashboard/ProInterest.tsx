'use client';
import { useState } from 'react';
import type { SourceScreen } from '@clipmaker/shared/enums';
import { PAID_PLAN_DAYS, PAID_PLAN_TITLE, PAID_PRICE_MINOR, formatRubles } from '@clipmaker/shared/tariff';
import { rpc } from '../../lib/rpc';

// Фича 30 payments (ADR-019): при включённой оплате (N5_PAYMENTS_MODE fake|live) — ссылка на /upgrade с экраном оплаты;
// при выключенной (не задан или off) — экран интереса РОВНО как раньше (ADR-005 для режима off, AC-1).
export function ProInterest({ source, paymentsOn = false }: { source: SourceScreen; paymentsOn?: boolean }) {
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  if (paymentsOn) {
    return <section aria-label="Тариф Pro" data-state="pro-offer"><p>Новые клипы без метки, хранение без срока и больше минут
      в день — тариф {PAID_PLAN_TITLE}, {formatRubles(PAID_PRICE_MINOR)} за {PAID_PLAN_DAYS} дней.</p>
      <a className="button secondary" href={`/upgrade?from=${source}`}>Оформить {PAID_PLAN_TITLE}</a></section>;
  }
  async function record() {
    setBusy(true); setError('');
    try { await rpc('interest.create', { source_screen: source }, true); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось записать интерес. Повторите позже'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Интерес к тарифу"><p>Сейчас доступен только бесплатный тариф.</p>
    <p>Нужны больше минут или клипы без метки? Отметьте интерес — это поможет нам оценить спрос.</p>
    <button className="secondary" disabled={busy || saved} onClick={() => void record()}>
      {saved ? 'Интерес записан' : busy ? 'Записываем…' : 'Нужен тариф побольше'}</button>
    {saved && <p role="status">Спасибо, ваш интерес записан.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
