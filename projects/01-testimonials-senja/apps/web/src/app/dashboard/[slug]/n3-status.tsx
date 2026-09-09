'use client';
import { useEffect, useState } from 'react';
type State = { enabled?: boolean; verified?: boolean; bound?: boolean; pending?: number; failed?: number;
  purchases?: Array<{ id: string; state: string; refund_review: boolean }> };
export function N3Status() {
  const [state, setState] = useState<State>({}); const [message, setMessage] = useState('');
  useEffect(() => {
    let stopped = false;
    async function update() {
      try { const response = await fetch('/api/n3/status'); if (response.ok && !stopped) setState(await response.json()); } catch { /* polling retries */ }
    }
    void update(); const timer = setInterval(() => void update(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  if (!state.enabled) return null;
  async function send() {
    try {
      const response = await fetch('/api/n3/proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send' }) });
      const result = await response.json(); setMessage(response.ok ? 'Письмо отправлено. Откройте ссылку в этом браузере.' : result.error);
    } catch { setMessage('Сеть недоступна. Повторите отправку.'); }
  }
  return <section aria-label="Партнёрская покупка" style={{ marginTop: 24 }}><h2>Партнёрская покупка</h2>
    <p>{!state.verified ? 'Подтвердите почту, чтобы покупка учитывалась в партнёрской программе.' : state.bound ? 'Почта подтверждена, партнёрская регистрация сохранена.' : 'Почта подтверждена. Доставка регистрации ожидается.'}</p>
    {!state.verified && <button className="btn" type="button" onClick={send}>Отправить письмо подтверждения</button>}
    <p role="status">{message}</p>
    {!!state.pending && <p>Ожидают доставки: {state.pending}. Повторы выполняются автоматически{state.failed ? '; есть ошибки доставки' : ''}.</p>}
    {state.purchases?.map(p => <p key={p.id}>{p.refund_review ? 'Возврат подтверждён. Срок тарифа требует ручной проверки.' : p.state === 'completed' ? 'Тестовая оплата подтверждена.' : p.state === 'canceled' ? 'Оплата отменена.' : 'Оплата ожидает подтверждения.'}</p>)}
  </section>;
}
