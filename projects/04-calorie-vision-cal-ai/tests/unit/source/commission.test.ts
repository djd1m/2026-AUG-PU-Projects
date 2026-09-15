// Арифметика комиссии и календарь выплат — AC-7, AC-8, AC-21 фичи
// `subscription-and-commission` (ADR-011, ADR-013, ADR-014).
//
// Слой unit по природе признака: округление, знак и граница зрелости — арифметика, и проверять
// её на развёрнутом стенде значило бы платить минутами за то, что ловится миллисекундами.

import { describe, expect, it } from 'vitest';
import {
  accrualAmountMinor,
  availableForPayoutMinor,
  balanceMinor,
  maturesAt,
  nextPayoutDate,
  previewNextPayout,
  DEFAULT_COMMISSION_RATE_BP,
  type CommissionEntry,
} from '../../../packages/shared/src/domain/commission.js';

const RUB = (rubles: number): number => rubles * 100;

describe('accrualAmountMinor (ADR-011: база — фактически полученное)', () => {
  it('50 % от ПОЛУЧЕННОГО, а не от цены витрины: 1000 ₽ с эквайрингом 3 % даёт 485 ₽', () => {
    expect(accrualAmountMinor(RUB(970), DEFAULT_COMMISSION_RATE_BP)).toBe(RUB(485));
  });

  it('тот же платёж при удержании трети (канал Telegram) даёт 325 ₽ — база спасает продукт от минуса', () => {
    expect(accrualAmountMinor(RUB(650), DEFAULT_COMMISSION_RATE_BP)).toBe(RUB(325));
  });

  it('округление ВНИЗ: сумма начислений не может превысить полученные деньги', () => {
    // 333 копейки * 50 % = 166,5 → 166, а не 167.
    expect(accrualAmountMinor(333, 5000)).toBe(166);
  });

  it('неположительный net не порождает положительного начисления НИКОГДА (fail-closed)', () => {
    for (const net of [0, -1, -RUB(1000)]) {
      expect(accrualAmountMinor(net, DEFAULT_COMMISSION_RATE_BP), String(net)).toBe(0);
    }
  });

  it('дробные деньги и дробная ставка отвергаются, а не округляются молча', () => {
    expect(() => accrualAmountMinor(970.5, 5000)).toThrow(/целыми/);
    expect(() => accrualAmountMinor(97000, 5000.5)).toThrow(/целыми/);
  });

  it('ставка вне 0..10000 базисных пунктов — отказ', () => {
    expect(() => accrualAmountMinor(97000, 10_001)).toThrow(/диапазона/);
    expect(() => accrualAmountMinor(97000, -1)).toThrow(/диапазона/);
  });
});

describe('balanceMinor (ADR-013: баланс есть сумма записей)', () => {
  const at = new Date('2026-09-01T00:00:00Z');

  it('возврат гасит начисление компенсирующей записью, обе остаются в истории', () => {
    const entries: CommissionEntry[] = [
      { kind: 'accrual', amountMinor: RUB(485), availableAt: at },
      { kind: 'clawback', amountMinor: -RUB(485), availableAt: at },
    ];
    expect(balanceMinor(entries)).toBe(0);
    expect(entries).toHaveLength(2);
  });

  it('отрицательный баланс — законное состояние: долг гасится будущими начислениями', () => {
    expect(balanceMinor([{ kind: 'clawback', amountMinor: -RUB(485), availableAt: at }])).toBe(-RUB(485));
  });
});

describe('зрелость начисления (ADR-014, AC-8/AC-21)', () => {
  const paidAt = new Date('2026-09-01T12:00:00Z');

  it('граница ВКЛЮЧАЮЩАЯ: ровно 14 дней уже доступно, 13 дней ещё нет', () => {
    const entry = (available: Date): CommissionEntry => ({ kind: 'accrual', amountMinor: RUB(485), availableAt: available });
    const ripe = entry(maturesAt(paidAt, 14));
    expect(availableForPayoutMinor([ripe], new Date('2026-09-15T12:00:00Z'))).toBe(RUB(485));
    expect(availableForPayoutMinor([ripe], new Date('2026-09-14T12:00:00Z'))).toBe(0);
  });

  it('обратное списание уменьшает доступное НЕМЕДЛЕННО, не дожидаясь зрелости', () => {
    const entries: CommissionEntry[] = [
      { kind: 'accrual', amountMinor: RUB(485), availableAt: new Date('2026-09-01T00:00:00Z') },
      { kind: 'clawback', amountMinor: -RUB(485), availableAt: new Date('2026-12-01T00:00:00Z') },
    ];
    // Иначе выплатили бы деньги, которые уже отозваны.
    expect(availableForPayoutMinor(entries, new Date('2026-09-10T00:00:00Z'))).toBe(0);
  });

  it('окно обязано быть целым неотрицательным числом дней', () => {
    expect(() => maturesAt(paidAt, -1)).toThrow(/неотрицательным/);
    expect(() => maturesAt(paidAt, 1.5)).toThrow(/неотрицательным/);
  });
});

describe('календарь выплат 5-го числа (OWN-011)', () => {
  it('до 5-го числа ближайшая выплата — в этом месяце', () => {
    expect(nextPayoutDate(new Date('2026-09-01T09:00:00Z')).toISOString()).toBe('2026-09-04T21:00:00.000Z');
  });

  it('после 5-го числа выплата переезжает на следующий месяц', () => {
    expect(nextPayoutDate(new Date('2026-09-20T09:00:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });

  it('декабрь переходит в январь следующего года', () => {
    expect(nextPayoutDate(new Date('2026-12-20T09:00:00Z')).toISOString()).toBe('2027-01-04T21:00:00.000Z');
  });

  it('5-е число считается по МОСКОВСКОМУ времени, как сутки и потолки продукта', () => {
    // 4 сентября 22:00 UTC — это уже 5 сентября 01:00 в Москве, выплата этого дня прошла.
    expect(nextPayoutDate(new Date('2026-09-04T22:00:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
  });
});

describe('предпросмотр выплаты: обе суммы видны ЗАРАНЕЕ (ADR-014)', () => {
  it('незрелое начисление показано как перенесённое, а не потерянное', () => {
    const now = new Date('2026-09-28T00:00:00Z');
    const entries: CommissionEntry[] = [
      { kind: 'accrual', amountMinor: RUB(485), availableAt: new Date('2026-09-20T00:00:00Z') },
      { kind: 'accrual', amountMinor: RUB(325), availableAt: new Date('2026-10-12T00:00:00Z') },
    ];
    const preview = previewNextPayout(entries, now);
    expect(preview.payoutDate.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(preview.dueMinor).toBe(RUB(485));
    expect(preview.deferredMinor).toBe(RUB(325));
    // Ничего не исчезло: сумма двух показанных чисел равна балансу.
    expect(preview.dueMinor + preview.deferredMinor).toBe(balanceMinor(entries));
  });
});
