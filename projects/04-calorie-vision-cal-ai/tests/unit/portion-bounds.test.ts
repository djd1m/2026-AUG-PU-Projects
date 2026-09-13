// Границы set_portion (FR-diary-and-streak-3, AC-diary-and-streak-7/8) — чистая арифметика,
// без базы: `isValidPortionMassG`/`isValidItemIndex` не читают ничего, кроме своих аргументов.

import { describe, expect, it } from 'vitest';
import { isValidItemIndex, isValidPortionMassG, PORTION_MAX_GRAMS, PORTION_MIN_GRAMS } from '../../apps/api/src/diary/portion-bounds.js';

describe('isValidPortionMassG', () => {
  it('порция вне диапазона 5-2000 отклоняется с сохранением прежнего значения', () => {
    // «Сохранение прежнего значения» здесь означает: валидатор отвечает false ДО любой записи —
    // вызывающий код (`set-diary-entry-portion.ts`) не трогает БД, если это не true. Сам факт
    // сохранения проверяет интеграционный тест; здесь — полнота границы для ПЯТИ форм отказа.
    expect(isValidPortionMassG(5000)).toBe(false);
    expect(isValidPortionMassG(0)).toBe(false);
    expect(isValidPortionMassG(-10)).toBe(false);
    expect(isValidPortionMassG('abc')).toBe(false);
    expect(isValidPortionMassG(null)).toBe(false);
  });

  it('дробное значение отклоняется — принимаются только целые граммы', () => {
    expect(isValidPortionMassG(180.5)).toBe(false);
  });

  it('границы диапазона включительно принимаются', () => {
    expect(isValidPortionMassG(PORTION_MIN_GRAMS)).toBe(true);
    expect(isValidPortionMassG(PORTION_MAX_GRAMS)).toBe(true);
    expect(isValidPortionMassG(PORTION_MIN_GRAMS - 1)).toBe(false);
    expect(isValidPortionMassG(PORTION_MAX_GRAMS + 1)).toBe(false);
  });

  it('undefined отклоняется так же, как null', () => {
    expect(isValidPortionMassG(undefined)).toBe(false);
  });
});

describe('isValidItemIndex', () => {
  it('индекс позиции вне списка отклоняется без изменения записи', () => {
    expect(isValidItemIndex(2, 2)).toBe(false); // список из двух позиций: валидные индексы 0 и 1
    expect(isValidItemIndex(-1, 2)).toBe(false);
    expect(isValidItemIndex('0', 2)).toBe(false);
    expect(isValidItemIndex(null, 2)).toBe(false);
  });

  it('индексы внутри списка принимаются', () => {
    expect(isValidItemIndex(0, 2)).toBe(true);
    expect(isValidItemIndex(1, 2)).toBe(true);
  });

  it('пустой список позиций не принимает ни один индекс', () => {
    expect(isValidItemIndex(0, 0)).toBe(false);
  });
});
