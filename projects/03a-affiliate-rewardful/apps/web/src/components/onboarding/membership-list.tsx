'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MembershipDTO } from '../../../../../packages/db/src/onboarding-contract';
import { ApiError, errorMessage, onboardingApi } from './api';
import { ErrorNotice } from './shell';

function roleName(role: MembershipDTO['role']) {
  return role === 'owner' ? 'Владелец' : role === 'operator' ? 'Оператор' : 'Партнёр';
}

export function MembershipList() {
  const router = useRouter();
  const [items, setItems] = useState<MembershipDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState('');

  async function load(next?: string) {
    setLoading(true);
    setError('');
    try {
      const data = await onboardingApi.me(next);
      setItems((current) => next ? [...current, ...data.memberships.items] : data.memberships.items);
      setCursor(data.memberships.next_cursor);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setUnauthorized(true);
      else setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function logout() {
    setLoading(true);
    setError('');
    try {
      await onboardingApi.logout();
      router.push('/login');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  if (unauthorized) {
    return <section className="empty-state"><h2>Нужно войти</h2><p>После входа здесь появятся ваши программы.</p><Link className="button button-primary" href="/login">Перейти ко входу</Link></section>;
  }

  return (
    <section aria-labelledby="memberships-title">
      <div className="section-heading"><h2 id="memberships-title">Доступные программы</h2><div className="button-row"><Link className="button" href="/join">Принять приглашение</Link><button className="button" type="button" disabled={loading} onClick={() => void logout()}>Выйти</button></div></div>
      {error ? <ErrorNotice message={error} /> : null}
      {!loading && items.length === 0 ? (
        <div className="empty-state"><h3>Доступа пока нет</h3><p>Вы уже вошли и можете принять личное приглашение.</p><Link className="button button-primary" href="/join">Ввести приглашение</Link></div>
      ) : null}
      <div className="card-grid">
        {items.map((membership) => (
          <article className="card membership-card" key={membership.id}>
            <div className="card-topline"><span className="tag">{roleName(membership.role)}</span><span className={`status-text ${membership.status}`}>{membership.status === 'active' ? 'Доступ активен' : 'Доступ отозван'}</span></div>
            <h3>{membership.program_name}</h3>
            {membership.role === 'partner' && membership.partner_status ? <p>Статус партнёра: {membership.partner_status === 'active' ? 'активен' : membership.partner_status === 'suspended' ? 'приостановлен' : 'приглашён'}</p> : null}
            <div className="button-row">
              {membership.status === 'active' && membership.role === 'owner' ? <Link className="button button-primary" href={`/programs/${encodeURIComponent(membership.program_id)}/setup`}>Управлять</Link> : null}
              {membership.status === 'active' && membership.role === 'partner' && membership.partner_status === 'active' ? <Link className="button button-primary" href={`/programs/${encodeURIComponent(membership.program_id)}/partner`}>Мои материалы</Link> : null}
            </div>
          </article>
        ))}
      </div>
      {loading ? <p className="loading" role="status">Загружаем доступ…</p> : null}
      {cursor && !loading ? <button className="button" type="button" onClick={() => void load(cursor)}>Показать ещё</button> : null}
    </section>
  );
}
