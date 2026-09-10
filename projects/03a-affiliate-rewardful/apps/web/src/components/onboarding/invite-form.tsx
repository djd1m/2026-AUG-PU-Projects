'use client';

import { useState, type FormEvent } from 'react';
import type { Scope } from '../../../../../packages/db/src/onboarding-contract';
import { errorMessage, onboardingApi } from './api';
import { ErrorNotice, SuccessNotice } from './shell';

const operatorScopes: Array<{ value: Extract<Scope, 'read' | 'payout' | 'tax' | 'reconcile'>; label: string }> = [
  { value: 'read', label: 'Просмотр программы' },
  { value: 'payout', label: 'Подготовка выплат' },
  { value: 'tax', label: 'Работа с налоговыми данными' },
  { value: 'reconcile', label: 'Сверка операций' },
];

function isOperatorScope(value: string): value is Extract<Scope, 'read' | 'payout' | 'tax' | 'reconcile'> {
  return operatorScopes.some((scope) => scope.value === value);
}

export function InviteForm({ programId, canIssue }: { programId: string; canIssue: boolean }) {
  const [role, setRole] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [issuedToken, setIssuedToken] = useState('');
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIssuedToken('');
    setCopied(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (role !== 'partner' && role !== 'operator') {
      setError('Выберите роль приглашённого.');
      return;
    }
    const expiryRaw = String(form.get('expires_at') ?? '');
    const expiry = new Date(expiryRaw);
    const duration = expiry.valueOf() - Date.now();
    if (Number.isNaN(expiry.valueOf()) || duration <= 0 || duration > 72 * 60 * 60 * 1000) {
      setError('Срок приглашения должен быть в будущем и не превышать 72 часа.');
      return;
    }
    const scopes = form.getAll('scopes').map(String).filter(isOperatorScope);
    if (role === 'operator' && scopes.length === 0) {
      setError('Выберите оператору хотя бы одно разрешение.');
      return;
    }
    const common = {
      identity: String(form.get('identity') ?? ''),
      expires_at: expiry.toISOString(),
      evidence: {
        identity: { reference: String(form.get('identity_reference') ?? ''), sha256: String(form.get('identity_sha256') ?? '').toLowerCase() },
        authority: { reference: String(form.get('authority_reference') ?? ''), sha256: String(form.get('authority_sha256') ?? '').toLowerCase() },
      },
    };
    setPending(true);
    try {
      const result = role === 'partner'
        ? await onboardingApi.issue(programId, { ...common, role: 'partner' })
        : await onboardingApi.issue(programId, { ...common, role: 'operator', scopes });
      setIssuedToken(result.grant_token);
      formElement.reset();
      setRole('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(issuedToken);
      setCopied(true);
    } catch {
      setError('Автоматическое копирование недоступно. Выделите код в поле и скопируйте вручную.');
    }
  }

  return (
    <section className="card section-card" aria-labelledby="invite-title">
      <div className="section-heading"><div><p className="step-label">02 · Доступ</p><h2 id="invite-title">Новое приглашение</h2></div></div>
      <p>Приглашение связано с конкретной почтой и подтверждающими материалами. Отправьте полученный код самостоятельно.</p>
      {!canIssue && role === 'partner' ? <ErrorNotice message="Сначала сохраните действующие условия программы. Без них партнёр не сможет принять приглашение." /> : null}
      <form method="post" className="form-stack" onSubmit={submit}>
        <label className="field"><span>Электронная почта приглашённого</span><input name="identity" type="email" required maxLength={254} /></label>
        <label className="field"><span>Роль</span><select name="role" required value={role} onChange={(event) => setRole(event.target.value)}><option value="" disabled>Выберите роль</option><option value="partner">Партнёр</option><option value="operator">Оператор</option></select></label>
        {role === 'partner' ? <p className="field-help">Партнёр получает только доступ к своим материалам. Дополнительные разрешения не выдаются.</p> : null}
        {role === 'operator' ? <fieldset className="fieldset"><legend>Разрешения оператора</legend><p>Выберите явный набор. Настройка условий и приглашения недоступны оператору.</p>{operatorScopes.map((scope) => <label className="check-row" key={scope.value}><input type="checkbox" name="scopes" value={scope.value} /><span>{scope.label}</span></label>)}</fieldset> : null}
        <label className="field"><span>Действует до</span><input name="expires_at" type="datetime-local" required /><small>Не более 72 часов с момента выдачи.</small></label>
        <div className="evidence-grid">
          <fieldset className="fieldset"><legend>Подтверждение личности</legend><label className="field"><span>Ссылка или номер материала</span><input name="identity_reference" required maxLength={256} /></label><label className="field"><span>SHA-256 материала</span><input name="identity_sha256" required pattern="[a-fA-F0-9]{64}" spellCheck={false} /></label></fieldset>
          <fieldset className="fieldset"><legend>Подтверждение полномочий</legend><label className="field"><span>Ссылка или номер материала</span><input name="authority_reference" required maxLength={256} /></label><label className="field"><span>SHA-256 материала</span><input name="authority_sha256" required pattern="[a-fA-F0-9]{64}" spellCheck={false} /></label></fieldset>
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        <button className="button button-primary" type="submit" disabled={pending || (role === 'partner' && !canIssue)}>{pending ? 'Выдаём…' : 'Выдать приглашение'}</button>
      </form>
      {issuedToken ? <SuccessNotice><strong>Код показан один раз</strong><p>Скопируйте его сейчас и передайте адресату вручную. После обновления страницы код исчезнет.</p><label className="field"><span>Код приглашения</span><textarea value={issuedToken} readOnly rows={3} onFocus={(event) => event.currentTarget.select()} /></label><button className="button" type="button" onClick={() => void copyToken()}>{copied ? 'Скопировано' : 'Скопировать код'}</button></SuccessNotice> : null}
    </section>
  );
}
