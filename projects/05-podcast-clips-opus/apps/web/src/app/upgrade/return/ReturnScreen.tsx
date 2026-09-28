'use client';
// из N6: projects/06-rag-sales-chatbase/apps/web/src/app/upgrade/return/ReturnScreen.tsx — адаптировано (фича 30 payments,
// AC-10): тексты N5, один тариф. Состояния — decideReturnState (lib/payment-return.ts): выполняется, успех,
// оплачено-но-не-действует, отказ, не подтверждено за отведённое время, не найдено — у каждого СВОЙ блок с data-state
// (long-running-job: два неразличимых на экране состояния — одно состояние). Опрос — GET /api/checkout/{intent_id}.
import { useEffect, useState } from 'react';
import { RETURN_FETCH_TIMEOUT_MS, RETURN_MAX_ATTEMPTS, RETURN_POLL_INTERVAL_MS, decideReturnState, type CheckoutSnapshot, type ReturnState } from '../../../lib/payment-return';

const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export function ReturnView({ state }: { state: ReturnState }) {
  switch (state.kind) {
    case 'waiting': return <div data-state="waiting" aria-busy="true">
      <h1>Ждём подтверждения оплаты</h1>
      <p role="status">Банк подтверждает платёж. Обычно это несколько секунд. Проверка {Math.min(state.attempts + 1, RETURN_MAX_ATTEMPTS)} из {RETURN_MAX_ATTEMPTS}.</p>
    </div>;
    case 'succeeded': return <div data-state="succeeded">
      <h1>Тариф Pro включён</h1>
      <p role="status" className="notice">{state.until ? `Оплачено до ${date(state.until)}.` : 'Оплата подтверждена.'} Новые клипы соберутся без метки и будут храниться без срока.</p>
      <p><a className="button" href="/dashboard">В кабинет</a></p>
    </div>;
    case 'paid_inactive': return <div data-state="paid_inactive">
      <h1>Оплата прошла, но тариф сейчас не действует</h1>
      <p role="status" className="notice">Срок оплаченного тарифа истёк или тариф снят вручную. Новые клипы снова получают метку.</p>
      <p><a className="button secondary" href="/upgrade?from=partner_dashboard">Оформить снова</a></p>
    </div>;
    case 'failed': return <div data-state="failed">
      <h1>Оплата не прошла</h1>
      <p role="alert">Платёж отменён. Деньги, если списались, вернутся на карту автоматически.</p>
      <p><a className="button" href="/upgrade?from=partner_dashboard">Попробовать снова</a></p>
    </div>;
    case 'unconfirmed': return <div data-state="unconfirmed">
      <h1>Подтверждение ещё не пришло</h1>
      <p role="status" className="notice">Это не значит, что оплата не прошла. Не платите повторно: откройте эту страницу через несколько минут. Если деньги списались, а тариф не включился, напишите нам — проверим вручную.</p>
      <button type="button" className="secondary" onClick={() => window.location.reload()}>Проверить ещё раз</button>
    </div>;
    case 'not_found': return <div data-state="not_found">
      <h1>Оплата не найдена</h1>
      <p role="alert">Ссылка устарела или открыта из другого аккаунта. Войдите в тот аккаунт, из которого оплачивали.</p>
      <p><a className="button secondary" href="/dashboard">В кабинет</a></p>
    </div>;
  }
}

export function ReturnScreen({ intentId }: { intentId: string }) {
  const [state, setState] = useState<ReturnState>({ kind: 'waiting', attempts: 0 });
  useEffect(() => {
    let attempts = 0, stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const poll = async () => {
      if (stopped) return;
      let snapshot: CheckoutSnapshot | null | 'not_found' = null;
      try {
        const response = await fetch(`/api/checkout/${encodeURIComponent(intentId)}`, { cache: 'no-store', signal: AbortSignal.timeout(RETURN_FETCH_TIMEOUT_MS) });
        if (response.status === 404) snapshot = 'not_found';
        else if (response.ok) snapshot = ((await response.json()) as { data?: CheckoutSnapshot }).data ?? null;
      } catch { snapshot = null; /* сбой опроса — не отказ оплаты */ }
      if (stopped) return;
      attempts += 1;
      const next = decideReturnState(snapshot, attempts, Date.now() - started);
      setState(next);
      if (next.kind === 'waiting') timer = setTimeout(() => { void poll(); }, RETURN_POLL_INTERVAL_MS);
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [intentId]);
  return <section className="status-panel" aria-live="polite"><ReturnView state={state} /></section>;
}
