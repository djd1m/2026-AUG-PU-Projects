// Возврат с формы оплаты: ТРИ состояния, и ни одно не угадывается (`long-running-job.md`).
// Слой unit: решение «что считать успехом» проверяется без браузера и таймеров.

import { describe, expect, it } from 'vitest';
import { decideFromSnapshot, MAX_POLL_ATTEMPTS } from '../../apps/web/app/pro/return/screen.js';

describe('decideFromSnapshot', () => {
  it('active с датой — успех', () => {
    const state = decideFromSnapshot({ status: 'active', current_period_end: '2026-10-16T00:00:00Z' }, 1);
    expect(state).toEqual({ kind: 'active', until: '2026-10-16T00:00:00Z' });
  });

  it('active БЕЗ даты успехом не считается: «до какого числа» — часть обещания', () => {
    expect(decideFromSnapshot({ status: 'active', current_period_end: null }, 1).kind).toBe('waiting');
  });

  it('пустой ответ — ЖДЁМ, а не «не получилось»: вебхук может отстать от редиректа', () => {
    expect(decideFromSnapshot({}, 1)).toEqual({ kind: 'waiting', attempts: 1 });
    expect(decideFromSnapshot({ status: 'none' }, 3).kind).toBe('waiting');
  });

  it('expired и past_due СРАЗУ после оплаты — отказ платежа, а не ожидание', () => {
    for (const status of ['expired', 'past_due']) {
      expect(decideFromSnapshot({ status }, 1).kind, status).toBe('failed');
    }
  });

  it('исчерпав попытки, говорит ЧЕСТНОЕ «не знаем», а не «наверное, получилось»', () => {
    const state = decideFromSnapshot({}, MAX_POLL_ATTEMPTS);
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') return;
    // Формулировка не утверждает отказ: мы действительно не знаем.
    expect(state.reason).toContain('не значит, что оплата не прошла');
  });

  it('три состояния РАЗЛИЧИМЫ: ни одна пара не совпадает', () => {
    const waiting = decideFromSnapshot({}, 1);
    const active = decideFromSnapshot({ status: 'active', current_period_end: '2026-10-16T00:00:00Z' }, 1);
    const failed = decideFromSnapshot({ status: 'expired' }, 1);
    expect(new Set([waiting.kind, active.kind, failed.kind]).size).toBe(3);
  });
});
