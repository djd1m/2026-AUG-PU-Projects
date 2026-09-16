// Кабинеты партнёра и владельца — разбор ответов и форматирование без DOM.
import { describe, expect, it } from 'vitest';
import { formatRub, parseCabinetResponse, parsePayoutResponse, parseRubInput } from '../../apps/web/app/cabinet/cabinet-request';

function res(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('cabinet-request', () => {
  it('401 → unauthenticated, 403 → not_partner, 404 → closed (владельческий 404 не подсказывает существование маршрута)', async () => {
    expect((await parseCabinetResponse(res(401, { error: { code: 'unauthenticated' } }))).kind).toBe('unauthenticated');
    expect((await parseCabinetResponse(res(403, { error: { code: 'not_partner' } }))).kind).toBe('not_partner');
    expect((await parseCabinetResponse(res(404, { error: { code: 'not_found' } }))).kind).toBe('closed');
  });
  it('200 без data — error, а не пустой кабинет', async () => {
    expect((await parseCabinetResponse(res(200, {}))).kind).toBe('error');
  });
  it('выплата: 201 recorded, 200 duplicate, 422 rejected с сообщением сервера', async () => {
    expect(await parsePayoutResponse(res(201, { data: { recorded: true, available_after_minor: 500 } }))).toEqual({ kind: 'recorded', availableAfterMinor: 500 });
    expect((await parsePayoutResponse(res(200, { data: { recorded: false, reason: 'duplicate_payout_key' } }))).kind).toBe('duplicate');
    const r = await parsePayoutResponse(res(422, { error: { message: 'сумма превышает доступную' } }));
    expect(r).toEqual({ kind: 'rejected', message: 'сумма превышает доступную' });
  });
  it('копейки → рубли, отрицательные со знаком', () => {
    expect(formatRub(100000)).toBe('1\u00a0000,00 ₽');
    expect(formatRub(-1250)).toBe('−12,50 ₽');
  });
  it('ввод суммы: «1234,56» → 123456; мусор, ноль и отрицательное → null', () => {
    expect(parseRubInput('1234,56')).toBe(123456);
    expect(parseRubInput('1234.5')).toBe(123450);
    for (const bad of ['', 'abc', '0', '-5', '1,234']) expect(parseRubInput(bad), bad).toBeNull();
  });
});
