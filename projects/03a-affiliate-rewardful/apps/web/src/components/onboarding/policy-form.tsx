'use client';

import { useState, type FormEvent } from 'react';
import type { ProgramDTO, SavePolicyInput } from '../../../../../packages/db/src/onboarding-contract';
import { errorMessage, onboardingApi } from './api';
import { ErrorNotice, SuccessNotice } from './shell';
import { rateToBasisPoints } from './rate';

type PolicyPayload = Omit<SavePolicyInput, 'program_id' | 'sessionTokenHash'>;


export function PolicyForm({ program, onSaved }: { program: ProgramDTO; onSaved: () => Promise<void> }) {
  const current = program.current_policy;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [effectiveMode, setEffectiveMode] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    const rateBp = rateToBasisPoints(String(form.get('rate') ?? ''), String(form.get('rate_unit') ?? ''));
    if (rateBp === null) {
      setError('Введите ставку от 0,01% до 100% или целое число от 1 до 10 000 базисных пунктов.');
      return;
    }
    const attributionValue = Number(form.get('attribution_days'));
    if (attributionValue !== 30 && attributionValue !== 60 && attributionValue !== 90) {
      setError('Выберите срок атрибуции.');
      return;
    }
    const attributionDays: 30 | 60 | 90 = attributionValue;
    if (effectiveMode !== 'now' && effectiveMode !== 'future') {
      setError('Выберите момент вступления условий в силу.');
      return;
    }
    const common = {
      rate_bp: rateBp,
      attribution_days: attributionDays,
      conflict_rule: 'explicit_promo_else_last_valid_cookie' as const,
      recurring_mode: 'every_eligible_payment' as const,
      commission_duration: 'lifetime' as const,
      currency: 'RUB' as const,
      timezone: String(form.get('timezone') ?? '').trim(),
      terms_text: String(form.get('terms_text') ?? ''),
      expected_version: program.latest_version,
      acknowledged: true as const,
    };
    if (form.get('acknowledged') !== 'on') {
      setError('Подтвердите фиксированные правила и заполненные условия.');
      return;
    }
    let payload: PolicyPayload;
    if (effectiveMode === 'future') {
      const localTime = String(form.get('effective_at') ?? '');
      const timestamp = localTime ? new Date(localTime) : null;
      if (!timestamp || Number.isNaN(timestamp.valueOf()) || timestamp.valueOf() <= Date.now()) {
        setError('Укажите будущие дату и время вступления условий в силу.');
        return;
      }
      payload = { ...common, effective_mode: 'future', effective_at: timestamp.toISOString() };
    } else {
      payload = { ...common, effective_mode: 'now' };
    }
    setPending(true);
    try {
      const result = await onboardingApi.savePolicy(program.id, payload);
      setSuccess(`Версия ${result.version} сохранена. Программа остаётся черновиком.`);
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card section-card" aria-labelledby="policy-title">
      <div className="section-heading"><div><p className="step-label">01 · Условия</p><h2 id="policy-title">Условия программы</h2></div>{current ? <span className="tag">Текущая версия: {current.version}</span> : null}</div>
      <p>Все поля обязательны. Ставка, текст и подтверждение не подставляются автоматически.</p>
      <form method="post" className="form-stack" onSubmit={submit}>
        <div className="field-pair">
          <label className="field">
            <span>Ставка вознаграждения</span>
            <input name="rate" inputMode="decimal" required defaultValue={current ? String(current.rate_bp) : ''} />
          </label>
          <label className="field">
            <span>Единица ставки</span>
            <select name="rate_unit" required defaultValue={current ? 'bp' : ''}>
              <option value="" disabled>Выберите единицу</option>
              <option value="percent">Проценты (до 2 знаков)</option>
              <option value="bp">Базисные пункты, целое число</option>
            </select>
          </label>
        </div>
        <p className="field-help">1% = 100 базисных пунктов. Допустимый диапазон: от 0,01% до 100%.</p>
        <label className="field">
          <span>Срок атрибуции</span>
          <select name="attribution_days" required defaultValue={current ? String(current.attribution_days) : ''}>
            <option value="" disabled>Выберите срок</option>
            <option value="30">30 дней</option><option value="60">60 дней</option><option value="90">90 дней</option>
          </select>
        </label>
        <label className="field">
          <span>Часовой пояс программы (IANA)</span>
          <input name="timezone" required placeholder="Например, Europe/Moscow" defaultValue={current?.timezone ?? ''} />
          {program.calendar_locked_at ? <small>Календарь уже зафиксирован: часовой пояс нельзя менять.</small> : null}
        </label>
        <label className="field">
          <span>Полный текст условий</span>
          <textarea name="terms_text" rows={9} required defaultValue={current?.terms_text ?? ''} />
        </label>
        <fieldset className="fieldset">
          <legend>Когда применить эту версию</legend>
          <label className="check-row"><input type="radio" name="effective_mode" value="now" checked={effectiveMode === 'now'} onChange={() => setEffectiveMode('now')} /><span>Сразу после сохранения</span></label>
          <label className="check-row"><input type="radio" name="effective_mode" value="future" checked={effectiveMode === 'future'} onChange={() => setEffectiveMode('future')} /><span>В будущий момент UTC</span></label>
          {effectiveMode === 'future' ? <label className="field"><span>Дата и время</span><input name="effective_at" type="datetime-local" required /><small>Введите местное время — оно будет отправлено как точный момент UTC.</small></label> : null}
        </fieldset>
        <div className="fixed-policy">
          <h3>Фиксированные правила этой версии</h3>
          <ul><li>Промокод имеет приоритет, иначе учитывается последний действующий cookie.</li><li>Вознаграждение относится к каждой подходящей оплате.</li><li>Срок начисления — всё время участия клиента.</li><li>Валюта — российский рубль (RUB).</li></ul>
          <label className="check-row"><input name="acknowledged" type="checkbox" required /><span>Подтверждаю эти фиксированные правила и все заполненные условия.</span></label>
        </div>
        {error ? <ErrorNotice message={error} /> : null}
        {success ? <SuccessNotice>{success}</SuccessNotice> : null}
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Сохраняем…' : 'Сохранить новую версию'}</button>
      </form>
    </section>
  );
}
