'use client';
import { useEffect, useRef, useState } from 'react';
import { supportRequest } from '../../../../lib/support-client';
type Account = { id: string; email: string; status: string; verified: boolean; plan: string };
type Result = { items: Account[]; nextCursor: string | null };
export function Accounts() {
  const [result, setResult] = useState<Result | null>(null), [query, setQuery] = useState(''), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const current = useRef(''), generation = useRef(0);
  async function load(search: string, cursor?: string) {
    const version = ++generation.current; setBusy(true); setError(''); setResult(null);
    try {
      const value = search ? await supportRequest<Result>('/api/admin/support/search', { query: search, ...(cursor ? { cursor } : {}) })
        : await supportRequest<Result>('/api/admin/support/accounts' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''));
      if (generation.current === version) setResult(value);
    } catch (cause) { if (generation.current === version) setError(cause instanceof Error ? cause.message : 'Данные недоступны.'); }
    finally { if (generation.current === version) setBusy(false); }
  }
  useEffect(() => { void load(''); return () => { generation.current++; }; }, []);
  return <section className="auth-card support-card"><form onSubmit={e => { e.preventDefault(); current.current = query.trim(); void load(current.current); }}>
    <label>Точная почта или UUID<input value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" maxLength={254} /></label>
    <button disabled={busy}>{busy ? 'Загружаем…' : 'Найти'}</button>
    <button className="text-button" type="button" disabled={busy} onClick={() => { current.current = ''; setQuery(''); void load(''); }}>Показать список</button>
  </form>
  {error && <p role="alert">{error}</p>}{busy && <p role="status">Загружаем аккаунты…</p>}
  {result && <><p role="status">На странице: {result.items.length}</p><ul className="support-records">{result.items.slice(0, 25).map(a => <li key={a.id}><a href={`/admin/support/accounts/${encodeURIComponent(a.id)}`}>{a.email}</a><p>{a.id}</p><p>Статус: {a.status}; почта: {a.verified ? 'подтверждена' : 'не подтверждена'}; тариф: {a.plan}</p></li>)}</ul>
    {result.nextCursor && <button disabled={busy} onClick={() => void load(current.current, result.nextCursor!)}>Следующие 25</button>}</>}
  </section>;
}
