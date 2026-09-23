'use client';
import { useState } from 'react';
import type { SourceScreen } from '@clipmaker/shared/enums';
import { rpc } from '../../lib/rpc';

export function ProInterest({ source }: { source: SourceScreen }) {
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
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
