'use client';

import { useEffect, useState } from 'react';
import type { AssetDTO, GrantDTO, MembershipDTO } from '../../../../../packages/db/src/onboarding-contract';
import { errorMessage, onboardingApi } from './api';
import { ErrorNotice, SuccessNotice } from './shell';

function roleName(role: MembershipDTO['role'] | GrantDTO['role']) {
  return role === 'owner' ? 'Владелец' : role === 'operator' ? 'Оператор' : 'Партнёр';
}

const scopeLabels: Record<string, string> = {
  read: 'просмотр', configure: 'настройка', invite: 'приглашения', payout: 'выплаты', tax: 'налоговые данные', reconcile: 'сверка',
};

export function MemberList({ programId }: { programId: string }) {
  const [members, setMembers] = useState<MembershipDTO[]>([]);
  const [grants, setGrants] = useState<GrantDTO[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const [grantCursor, setGrantCursor] = useState<string | null>(null);
  const [assets, setAssets] = useState<{ partnerId: string; items: AssetDTO[] } | null>(null);
  const [pendingId, setPendingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function initialLoad() {
    setLoading(true);
    setError('');
    try {
      const data = await onboardingApi.members(programId);
      setMembers(data.members.items);
      setGrants(data.grants.items);
      setMemberCursor(data.members.next_cursor);
      setGrantCursor(data.grants.next_cursor);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void initialLoad(); }, [programId]);

  async function moreMembers() {
    if (!memberCursor) return;
    setLoading(true);
    try {
      const data = await onboardingApi.members(programId, memberCursor);
      setMembers((current) => [...current, ...data.members.items]);
      setMemberCursor(data.members.next_cursor);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }

  async function moreGrants() {
    if (!grantCursor) return;
    setLoading(true);
    try {
      const data = await onboardingApi.members(programId, undefined, grantCursor);
      setGrants((current) => [...current, ...data.grants.items]);
      setGrantCursor(data.grants.next_cursor);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }

  async function runAction(id: string, action: () => Promise<unknown>) {
    setPendingId(id);
    setError('');
    try {
      await action();
      setAssets(null);
      await initialLoad();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setPendingId(''); }
  }

  async function showAssets(partnerId: string) {
    setPendingId(partnerId);
    setError('');
    try {
      const data = await onboardingApi.partnerAssets(programId, partnerId);
      setAssets({ partnerId, items: data.assets });
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setPendingId(''); }
  }

  return (
    <section className="card section-card" aria-labelledby="member-title">
      <div className="section-heading"><div><p className="step-label">03 · Команда</p><h2 id="member-title">Участники и приглашения</h2></div></div>
      {error ? <ErrorNotice message={error} /> : null}
      <h3>Участники</h3>
      <div className="table-wrap">
        <table><thead><tr><th>Роль</th><th>Статус</th><th>Разрешения</th><th><span className="visually-hidden">Действия</span></th></tr></thead>
          <tbody>{members.map((member) => <tr key={member.id}><td><strong>{roleName(member.role)}</strong></td><td>{member.partner_status === 'suspended' ? 'Приостановлен' : member.status === 'revoked' ? 'Доступ отозван' : 'Активен'}</td><td>{member.scopes.map((scope) => scopeLabels[scope] ?? scope).join(', ')}</td><td className="actions-cell">
            {member.role === 'operator' && member.status === 'active' ? <button className="button button-danger" type="button" disabled={pendingId === member.id} onClick={() => void runAction(member.id, () => onboardingApi.revokeOperator(programId, member.id))}>Отозвать доступ</button> : null}
            {member.role === 'partner' && member.partner_id && (member.status === 'active' || member.partner_status === 'suspended') ? <><button className="button" type="button" disabled={pendingId === member.partner_id} onClick={() => void showAssets(member.partner_id!)}>Материалы</button>{member.partner_status === 'active' ? <button className="button button-danger" type="button" disabled={pendingId === member.partner_id} onClick={() => void runAction(member.partner_id!, () => onboardingApi.setPartnerStatus(programId, member.partner_id!, 'suspended', 'active'))}>Приостановить</button> : member.partner_status === 'suspended' ? <button className="button" type="button" disabled={pendingId === member.partner_id} onClick={() => void runAction(member.partner_id!, () => onboardingApi.setPartnerStatus(programId, member.partner_id!, 'active', 'suspended'))}>Возобновить</button> : null}</> : null}
          </td></tr>)}</tbody>
        </table>
      </div>
      {memberCursor ? <button className="button" type="button" disabled={loading} onClick={() => void moreMembers()}>Ещё участники</button> : null}

      <h3 className="subsection-title">Приглашения</h3>
      <div className="table-wrap">
        <table><thead><tr><th>Роль</th><th>Срок</th><th>Статус</th><th><span className="visually-hidden">Действия</span></th></tr></thead>
          <tbody>{grants.map((grant) => { const unused = !grant.revoked_at && !grant.consumed_at; return <tr key={grant.id}><td>{roleName(grant.role)}</td><td>{new Date(grant.expires_at).toLocaleString('ru-RU')}</td><td>{grant.revoked_at ? 'Отозвано' : grant.consumed_at ? 'Принято' : 'Ожидает'}</td><td className="actions-cell">{unused ? <button className="button button-danger" type="button" disabled={pendingId === grant.id} onClick={() => void runAction(grant.id, () => onboardingApi.revokeGrant(programId, grant.id))}>Отозвать</button> : null}</td></tr>; })}</tbody>
        </table>
      </div>
      {grantCursor ? <button className="button" type="button" disabled={loading} onClick={() => void moreGrants()}>Ещё приглашения</button> : null}
      {loading ? <p className="loading" role="status">Обновляем список…</p> : null}

      {assets ? <div className="asset-admin" aria-labelledby="partner-assets-title"><div className="section-heading"><h3 id="partner-assets-title">Материалы выбранного партнёра</h3><button className="button" type="button" onClick={() => setAssets(null)}>Закрыть</button></div>{assets.items.length === 0 ? <p>Материалы не выданы.</p> : assets.items.map((asset) => <div className="asset-row" key={asset.id}><div><strong>{asset.kind === 'link' ? 'Ссылка' : 'Промокод'} · {asset.public_code}</strong><p>{asset.status === 'active' ? 'Выдан, отслеживание пока не работает' : 'Отозван'}</p></div>{asset.status === 'active' ? <button className="button button-danger" type="button" disabled={pendingId === asset.id} onClick={() => void runAction(asset.id, () => onboardingApi.revokeAsset(programId, asset.id))}>Отозвать материал</button> : null}</div>)}</div> : null}
      {!loading && members.length === 0 && grants.length === 0 ? <SuccessNotice>Участников и приглашений пока нет.</SuccessNotice> : null}
    </section>
  );
}
