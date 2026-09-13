// Валидация `POST /api/v1/scans/{id}/correct` (AC-source-and-correct-18/20/22).

import { describe, expect, it } from 'vitest';
import { validateChoice, validateIndex, validateMassG, validateOp } from '../../../apps/api/src/correct/validate-input.js';

describe('validateOp — закрытое множество, fail-closed', () => {
  it('принимает ровно четыре значения', () => {
    for (const op of ['set_portion', 'replace_item', 'delete_item', 'resolve_conflict']) {
      expect(validateOp({ op }).ok).toBe(true);
    }
  });

  it('отвергает неизвестное значение, отсутствие и не-строку', () => {
    for (const bad of [undefined, null, '', 'unknown', 123, {}]) {
      const result = validateOp({ op: bad });
      expect(result.ok, JSON.stringify(bad)).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('unknown_op');
    }
  });
});

describe('validateMassG — AC-source-and-correct-18: десять граничных случаев', () => {
  const bad = [5000, 4, 0, -10, 12.5, 'abc', null, undefined, Number.NaN, Number.POSITIVE_INFINITY];

  it.each(bad)('mass_g=%p → 422 portion_out_of_range', (value) => {
    const result = validateMassG({ mass_g: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('portion_out_of_range');
  });

  it('границы включительно: 5 и 2000 принимаются', () => {
    expect(validateMassG({ mass_g: 5 }).ok).toBe(true);
    expect(validateMassG({ mass_g: 2000 }).ok).toBe(true);
  });

  it('за границей: 4 и 2001 отвергаются', () => {
    expect(validateMassG({ mass_g: 4 }).ok).toBe(false);
    expect(validateMassG({ mass_g: 2001 }).ok).toBe(false);
  });
});

describe('validateIndex — вне списка позиций и отрицательный', () => {
  it('99 и -1 при трёх позициях отвергаются', () => {
    expect(validateIndex({ index: 99 }, 3).ok).toBe(false);
    expect(validateIndex({ index: -1 }, 3).ok).toBe(false);
  });

  it('0 и 2 при трёх позициях приняты; 3 — уже за границей', () => {
    expect(validateIndex({ index: 0 }, 3).ok).toBe(true);
    expect(validateIndex({ index: 2 }, 3).ok).toBe(true);
    expect(validateIndex({ index: 3 }, 3).ok).toBe(false);
  });
});

describe('validateChoice — DEC-A-023: закрытое множество из ОДНОГО значения', () => {
  it('take_db принимается', () => {
    expect(validateChoice({ choice: 'take_db' }).ok).toBe(true);
  });

  it('model, base, пустая строка и отсутствие — все 422 unknown_choice', () => {
    for (const bad of ['model', 'base', '', undefined]) {
      const result = validateChoice({ choice: bad });
      expect(result.ok, JSON.stringify(bad)).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('unknown_choice');
    }
  });
});
