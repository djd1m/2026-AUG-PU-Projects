// Пункт 1 роадмапа пробелов: ссылка `/r/{code}` и поле промокода. Разбор ответов и формат кода
// без DOM; у КАЖДОГО исхода свой текст — «ничего не произошло» означало бы потерянного
// посетителя, приведённого блогером.
import { describe, expect, it } from 'vitest';
import {
  isValidCodeFormat,
  messageFor,
  normalizeCode,
  parseApplyResponse,
  type ApplyCodeOutcome,
} from '../../apps/web/app/partner/apply-code-request';

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('формат кода — тот же, что CHECK в схеме', () => {
  it('нормализация: пробелы и регистр', () => {
    expect(normalizeCode('  bloger1 ')).toBe('BLOGER1');
  });
  it('годные и негодные', () => {
    for (const ok of ['ABCD', 'BLOGER1', 'A1B2C3D4E5F6']) expect(isValidCodeFormat(ok), ok).toBe(true);
    for (const bad of ['ABC', 'A1B2C3D4E5F6G', 'БЛОГЕР', 'blo ger', '', 'ABC-1']) expect(isValidCodeFormat(bad), bad).toBe(false);
  });
});

describe('разбор ответа маршрута применения кода', () => {
  it('200 → applied, 409 → conflict, 422 → invalid', async () => {
    expect((await parseApplyResponse(res(200, { data: { outcome: 'applied' } }))).kind).toBe('applied');
    const sameCode = await parseApplyResponse(res(409, { error: { code: 'conflict', details: { same_code: true } } }));
    expect(sameCode).toEqual({ kind: 'conflict', sameCode: true });
    const otherCode = await parseApplyResponse(res(409, { error: { code: 'conflict', details: { same_code: false } } }));
    expect(otherCode).toEqual({ kind: 'conflict', sameCode: false });
    expect((await parseApplyResponse(res(422, { error: { code: 'invalid_code' } }))).kind).toBe('invalid');
  });
  it('403 несёт ПРИЧИНУ отказа, а не общий отказ', async () => {
    const outcome = await parseApplyResponse(res(403, { error: { code: 'rejected', details: { reason: 'self_referral' } } }));
    expect(outcome).toEqual({ kind: 'rejected', reason: 'self_referral' });
  });
  it('429 и неизвестный код — названное сообщение, не пустота', async () => {
    expect((await parseApplyResponse(res(429))).kind).toBe('error');
    const weird = await parseApplyResponse(res(500));
    expect(weird.kind === 'error' && weird.message).toMatch(/500/);
  });
});

describe('текст для каждого исхода', () => {
  const outcomes: ApplyCodeOutcome[] = [
    { kind: 'applied' },
    { kind: 'conflict', sameCode: true },
    { kind: 'conflict', sameCode: false },
    { kind: 'invalid' },
    { kind: 'rejected', reason: 'self_referral' },
    { kind: 'rejected', reason: 'code_blocked' },
    { kind: 'rejected', reason: 'antifraud_ip_burst' },
    { kind: 'error', message: 'Нет соединения.' },
  ];
  it('ни один исход не даёт пустого текста', () => {
    for (const outcome of outcomes) {
      expect(messageFor(outcome, 'BLOGER1').length, JSON.stringify(outcome)).toBeGreaterThan(10);
    }
  });
  it('повторный переход по ТОЙ ЖЕ ссылке и чужой код названы РАЗНЫМИ словами', () => {
    const same = messageFor({ kind: 'conflict', sameCode: true }, 'BLOGER1');
    const other = messageFor({ kind: 'conflict', sameCode: false }, 'BLOGER1');
    expect(same).not.toBe(other);
    expect(same).toMatch(/уже был применён/);
  });

  it('самореферал и блокировка кода названы РАЗНЫМИ словами — посетитель должен понять, что делать', () => {
    const self = messageFor({ kind: 'rejected', reason: 'self_referral' }, 'X');
    const blocked = messageFor({ kind: 'rejected', reason: 'code_blocked' }, 'X');
    expect(self).not.toBe(blocked);
  });
});
