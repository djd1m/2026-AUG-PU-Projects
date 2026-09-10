'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProgramDTO } from '../../../../../packages/db/src/onboarding-contract';
import { ApiError, errorMessage, onboardingApi } from './api';
import { InviteForm } from './invite-form';
import { MemberList } from './member-list';
import { PolicyForm } from './policy-form';
import { ErrorNotice, ProgramState } from './shell';

export function ProgramSetup({ programId }: { programId: string }) {
  const [program, setProgram] = useState<ProgramDTO | null>(null);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [denied, setDenied] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationMessage, setActivationMessage] = useState('');

  async function load() {
    setError('');
    try {
      setProgram(await onboardingApi.program(programId));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setUnauthorized(true);
      else if (caught instanceof ApiError && caught.status === 404) setDenied(true);
      else setError(errorMessage(caught));
    }
  }

  useEffect(() => { void load(); }, [programId]);

  async function tryActivation() {
    setActivating(true);
    setActivationMessage('');
    try {
      await onboardingApi.activate(programId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'integration_not_ready') {
        setActivationMessage('Подключение Proofwall ещё не готово. Программа сохранена как черновик и не активирована.');
      } else setActivationMessage(errorMessage(caught));
    } finally { setActivating(false); }
  }

  if (unauthorized) return <div className="empty-state"><h2>Нужно войти</h2><p>Настройки доступны после входа владельца.</p><Link className="button button-primary" href="/login">Перейти ко входу</Link></div>;
  if (denied) return <div className="empty-state"><h2>Программа недоступна</h2><p>У вас нет доступа к этой программе.</p><Link className="button" href="/onboarding">Мои программы</Link></div>;
  if (!program) return error ? <ErrorNotice message={error} /> : <p className="loading" role="status">Загружаем программу…</p>;

  return (
    <div className="setup-layout">
      <section className="program-summary">
        <div><p className="step-label">{program.public_slug}</p><h2>{program.name}</h2><p>Ваша роль: {program.role === 'owner' ? 'владелец' : program.role === 'operator' ? 'оператор' : 'партнёр'}.</p></div>
        <ProgramState status={program.program_status} />
      </section>
      {program.role !== 'owner' ? <div className="empty-state"><h2>Только просмотр</h2><p>Настраивать условия и выдавать приглашения может владелец программы.</p><Link className="button" href="/onboarding">Вернуться к программам</Link></div> : <>
        <PolicyForm key={program.latest_version} program={program} onSaved={load} />
        <InviteForm programId={program.id} canIssue={program.current_policy !== null} />
        <MemberList programId={program.id} />
        <section className="card activation-card" aria-labelledby="activation-title"><div><p className="step-label">04 · Запуск</p><h2 id="activation-title">Активация</h2><p>До готовности интеграции программа остаётся черновиком. Кнопка проверяет реальное состояние и не создаёт видимость запуска.</p></div><button className="button" type="button" disabled={activating} onClick={() => void tryActivation()}>{activating ? 'Проверяем…' : 'Проверить готовность'}</button>{activationMessage ? <ErrorNotice message={activationMessage} /> : null}</section>
      </>}
    </div>
  );
}
