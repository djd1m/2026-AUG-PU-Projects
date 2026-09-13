// NormalizeAndFindCode — форма кода, границы 4/12 (AC-partner-codes-and-cabinet-1). Unit-
// слой: БАЗЫ НЕТ ВОВСЕ (`vitest.config.ts`). Случай «код проходит форму, но отсутствует в
// partner_code» требует настоящего Postgres — он в
// `tests/integration/partner/normalize-code.test.ts`, не здесь.
//
// Инвалидная форма ОБЯЗАНА короткнуть ДО обращения к базе (`02_pseudocode.md`, шаг 1-2):
// проверяется шпионом-заглушкой `query`, которая бросает исключение, если её вызвали, — не
// настоящим Postgres.

import { describe, expect, it, vi } from 'vitest';
import { normalizeAndFindCode, normalizeCode } from '../../../apps/api/src/partner/normalize-code.js';

function poolThatMustNotBeQueried(): { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn(async () => { throw new Error('DB не должна вызываться на invalid-форме'); }) };
}

describe('normalizeCode — обрезка пробелов и верхний регистр (FR-partner-codes-and-cabinet-1, шаг 1)', () => {
  it('обрезает пробелы по краям и приводит к верхнему регистру', () => {
    expect(normalizeCode(' liza10 ')).toBe('LIZA10');
    expect(normalizeCode('AbC123')).toBe('ABC123');
  });
});

describe('AC-partner-codes-and-cabinet-1: недействительная форма короткует ДО обращения к базе', () => {
  it('код короче 4 символов → invalid, query не вызван', async () => {
    const pool = poolThatMustNotBeQueried();
    const outcome = await normalizeAndFindCode(pool as never, 'AB');
    expect(outcome).toEqual({ kind: 'invalid' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('код длиной 13 символов (граница исключительно) → invalid, query не вызван', async () => {
    const pool = poolThatMustNotBeQueried();
    const outcome = await normalizeAndFindCode(pool as never, 'A'.repeat(13));
    expect(outcome).toEqual({ kind: 'invalid' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('код с дефисом/юникодом не проходит форму → invalid, query не вызван', async () => {
    const pool = poolThatMustNotBeQueried();
    expect(await normalizeAndFindCode(pool as never, 'LIZA-10')).toEqual({ kind: 'invalid' });
    expect(await normalizeAndFindCode(pool as never, 'ЛИЗА10')).toEqual({ kind: 'invalid' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('код ровно 4 и ровно 12 символов ПРОХОДИТ форму (граница включительно) — доходит до query', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    await normalizeAndFindCode(pool as never, 'AB12');
    await normalizeAndFindCode(pool as never, 'ABCDEFGH1234');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
