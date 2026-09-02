'use client';

// Оплата платного тарифа: единственное место в интерфейсе, откуда владелец может заплатить.
//
// До этого маршрут /api/checkout существовал, а вызвать его было нечем — то есть приём
// оплаты был реализован и недоступен одновременно. Найдено разбором цепочки, не тестом:
// каждая часть по отдельности работала.
//
// Классы взяты из настоящей дизайн-системы (globals.css). Прошлый раз в этом проекте были
// выдуманы четыре несуществующих класса, и владелец увидел неоформленную страницу —
// поэтому здесь только те, что есть в файле стилей.

import { useState } from 'react';

export function BillingBlock({ slug, priceRub, paidUntil }: {
  slug: string;
  priceRub: number;
  paidUntil: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = (await res.json().catch(() => null)) as { redirect_url?: string; error?: string } | null;
      if (!res.ok || !body?.redirect_url) {
        setError(body?.error ?? 'не удалось начать оплату');
        return;
      }
      window.location.href = body.redirect_url;
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  const active = paidUntil !== null;

  return (
    <>
      <h2 style={{ marginTop: 32 }}>Тариф</h2>
      {active ? (
        <p className="small muted" style={{ marginTop: 6, marginBottom: 12 }}>
          Оплачено до <b>{paidUntil}</b>. Продление добавит 30 дней к остатку — оплатить
          заранее можно без потери дней.
        </p>
      ) : (
        <p className="small muted" style={{ marginTop: 6, marginBottom: 12 }}>
          На бесплатном тарифе в виджете на вашем сайте видна строка «Powered by Proofwall».
          Платный тариф её убирает.
        </p>
      )}

      {error && <p className="errors" style={{ marginBottom: 12 }}>{error}</p>}

      <button className="btn btn--primary" type="button" onClick={pay} disabled={busy}>
        {busy ? 'Открываем оплату…' : active
          ? `Продлить на 30 дней — ${priceRub} ₽`
          : `Оплатить 30 дней — ${priceRub} ₽`}
      </button>
    </>
  );
}
