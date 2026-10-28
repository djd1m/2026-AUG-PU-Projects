'use client';
import { useEffect, useState } from 'react';
import { supportRequest } from '../../../../../lib/support-client';
type Row = Record<string, string | number | boolean | null>;
type Card = { account: Row; credits: Row | number | null; ledger: Row[]; payments: Row[]; jobs: Row[] };
// Explicit display allowlists prevent accidental rendering of newly added backend fields.
const fields = ['id', 'email', 'status', 'verified', 'plan', 'createdAt', 'created_at', 'balance', 'available', 'amount', 'delta', 'reason', 'kind', 'videoId', 'video_id', 'stage', 'failureCode', 'failure_code', 'at', 'billing_policy', 'available_seconds', 'reserved_seconds', 'source', 'total_seconds', 'remaining_seconds', 'expires_at', 'amount_minor', 'stage_progress', 'updated_at', 'finished_at'];
function Rows({ rows }: { rows: Row[] }) {
  return <ul className="support-records">{rows.slice(0, 20).map((row, i) => <li key={i}>{fields.filter(key => row[key] !== undefined).map(key => <p key={key}>{key}: {String(row[key] ?? '—')}</p>)}</li>)}</ul>;
}
export function AccountCard({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(null), [error, setError] = useState('');
  useEffect(() => { let active = true; setCard(null); setError('');
    void supportRequest<Card>(`/api/admin/support/accounts/${encodeURIComponent(id)}`).then(value => { if (active) setCard(value); }).catch(() => { if (active) setError('Карточка недоступна. Проверьте действующий доступ оператора.'); });
    return () => { active = false; };
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!card) return <p role="status">Загружаем карточку…</p>;
  return <section className="auth-card support-card"><h2>Аккаунт</h2><Rows rows={[card.account]} /><h2>Баланс</h2>{typeof card.credits === 'object' && card.credits ? <Rows rows={[card.credits]} /> : <p>{String(card.credits ?? '—')}</p>}
    <div className="support-diagnostics">{([['ledger', 'Последние начисления и списания'], ['payments', 'Последние платежи'], ['jobs', 'Последние обработки']] as const).map(([key, label]) => <section key={key}><h2>{label}</h2><Rows rows={card[key]} />{card[key].length === 0 && <p>Записей нет.</p>}</section>)}</div>
  </section>;
}
