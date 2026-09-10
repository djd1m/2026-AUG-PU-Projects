'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { EnrollmentPreview } from '../../../../../packages/db/src/onboarding-contract';
import { ApiError, errorMessage, onboardingApi } from './api';
import { ErrorNotice, ProgramState, SuccessNotice } from './shell';

type AccountMode = 'new' | 'existing';

const scopeLabels: Record<string, string> = {
  read: 'просмотр', payout: 'подготовка выплат', tax: 'налоговые данные', reconcile: 'сверка',
};

function roleName(role: EnrollmentPreview['role']) {
  if (role === 'owner') return 'владелец';
  if (role === 'operator') return 'оператор';
  return 'партнёр';
}

export function JoinForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AccountMode>('new');
  const [grantToken, setGrantToken] = useState('');
  const [preview, setPreview] = useState<EnrollmentPreview | null>(null);
  const [readyToPreview, setReadyToPreview] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAccepted(false);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const identity = String(form.get('identity') ?? '');
    const password = String(form.get('password') ?? '');
    const token = String(form.get('grant_token') ?? '');
    setGrantToken(token);
    try {
      if (mode === 'new') {
        await onboardingApi.signup({ identity, password, grant_token: token });
      } else {
        await onboardingApi.login({ identity, password });
        await onboardingApi.bind(token);
      }
      setReadyToPreview(true);
      setPreview(await onboardingApi.preview(token));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function retryPreview() {
    setAccepted(false);
    setPending(true);
    setError('');
    try { setPreview(await onboardingApi.preview(grantToken)); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setPending(false); }
  }

  async function accept() {
    if (!preview) return;
    setError('');
    setPending(true);
    try {
      if (preview.role === 'partner') {
        if (!preview.policy) {
          setError('Владелец ещё не опубликовал условия. Принять приглашение пока нельзя.');
          return;
        }
        if (!accepted) {
          setError('Подтвердите согласие с показанными условиями.');
          return;
        }
        await onboardingApi.acceptPartner({
          grant_token: grantToken,
          policy_id: preview.policy.id,
          terms_hash: preview.policy.terms_hash,
          accepted: true,
        });
        router.push(`/programs/${encodeURIComponent(preview.program_id)}/partner`);
      } else {
        await onboardingApi.acceptEnrollment(grantToken);
        router.push(preview.role === 'owner'
          ? `/programs/${encodeURIComponent(preview.program_id)}/setup`
          : '/onboarding');
      }
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'terms_changed') { setAccepted(false); setPreview(null); setReadyToPreview(true); }
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (preview) {
    const policy = preview.policy;
    return (
      <section className="card join-card" aria-labelledby="preview-title">
        <p className="step-label">Шаг 2 из 2</p>
        <h2 id="preview-title">Проверьте доступ перед принятием</h2>
        <dl className="detail-list">
          <div><dt>Программа</dt><dd>{preview.program_name}</dd></div>
          <div><dt>Роль</dt><dd>{roleName(preview.role)}</dd></div>
          {preview.role === 'operator' ? <div><dt>Разрешения</dt><dd>{preview.scopes.map((scope) => scopeLabels[scope] ?? scope).join(', ')}</dd></div> : null}
        </dl>
        <ProgramState status={preview.program_status} />
        {preview.role === 'partner' && !policy ? (
          <ErrorNotice message="У программы пока нет действующих условий. Попросите владельца сначала сохранить их." />
        ) : null}
        {preview.role === 'partner' && policy ? (
          <div className="terms-panel">
            <h3>Условия участия</h3>
            <dl className="detail-list detail-list-compact">
              <div><dt>Ставка</dt><dd>{(policy.rate_bp / 100).toLocaleString('ru-RU')}%</dd></div>
              <div><dt>Срок атрибуции</dt><dd>{policy.attribution_days} дней</dd></div>
              <div><dt>Валюта</dt><dd>RUB</dd></div>
              <div><dt>Часовой пояс</dt><dd>{policy.timezone}</dd></div>
              <div><dt>Версия</dt><dd>{policy.version}</dd></div>
            </dl>
            <div className="terms-text" tabIndex={0}>{policy.terms_text}</div>
            <p className="hash-line">Контрольная сумма условий: <code>{policy.terms_hash}</code></p>
            <label className="check-row">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>Я прочитал(а) эти условия и явно принимаю их.</span>
            </label>
          </div>
        ) : null}
        {error ? <ErrorNotice message={error} /> : null}
        <div className="button-row">
          <button
            className="button button-primary"
            type="button"
            disabled={pending || (preview.role === 'partner' && !policy)}
            onClick={accept}
          >
            {pending ? 'Принимаем…' : `Принять роль: ${roleName(preview.role)}`}
          </button>
          <button className="button" type="button" disabled={pending} onClick={() => setPreview(null)}>Назад</button>
        </div>
      </section>
    );
  }

  if (readyToPreview) {
    return <section className="card join-card" aria-labelledby="retry-title"><p className="step-label">Шаг 2 из 2</p><h2 id="retry-title">Учётная запись подтверждена</h2><p>Не удалось загрузить приглашение. Код остаётся только в этом окне — можно повторить безопасную проверку.</p>{error ? <ErrorNotice message={error} /> : null}<div className="button-row"><button className="button button-primary" type="button" disabled={pending} onClick={() => void retryPreview()}>{pending ? 'Проверяем…' : 'Повторить проверку'}</button><Link className="button" href="/onboarding">Мои программы</Link></div></section>;
  }

  return (
    <section className="card join-card" aria-labelledby="join-title">
      <p className="step-label">Шаг 1 из 2</p>
      <h2 id="join-title">Подтвердите свою учётную запись</h2>
      <div className="segmented" role="group" aria-label="Тип учётной записи">
        <button className={mode === 'new' ? 'active' : ''} type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>Я здесь впервые</button>
        <button className={mode === 'existing' ? 'active' : ''} type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>У меня есть аккаунт</button>
      </div>
      <form method="post" className="form-stack" onSubmit={identify}>
        <label className="field">
          <span>Код приглашения</span>
          <textarea name="grant_token" rows={3} required autoComplete="off" spellCheck={false} />
          <small>Вставьте код из личного сообщения владельца. Мы не сохраняем его в браузере.</small>
        </label>
        <label className="field">
          <span>Электронная почта</span>
          <input name="identity" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className="field">
          <span>{mode === 'new' ? 'Придумайте пароль' : 'Пароль'}</span>
          <input name="password" type="password" autoComplete={mode === 'new' ? 'new-password' : 'current-password'} required minLength={8} maxLength={400} />
          {mode === 'new' ? <small>От 8 до 200 символов.</small> : null}
        </label>
        {error ? <ErrorNotice message={error} /> : null}
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? 'Проверяем…' : 'Войти и проверить приглашение'}
        </button>
      </form>
      {mode === 'existing' ? <SuccessNotice>Пароль существующего аккаунта останется прежним.</SuccessNotice> : null}
      <p className="card-note"><Link href="/login">Войти без приглашения</Link></p>
    </section>
  );
}
