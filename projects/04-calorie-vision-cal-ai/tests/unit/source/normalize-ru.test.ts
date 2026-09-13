// `NormalizeRuName` (AC-source-and-correct-3, FR-source-and-correct-3).

import { describe, expect, it } from 'vitest';
import { normalizeRuName } from '@n4/shared';

describe('normalizeRuName — не режет кириллицу (AC-source-and-correct-3)', () => {
  it('регистр, пробелы и заглавные буквы дают одно и то же значение', () => {
    const forms = ['Гречка Варёная', 'гречка варёная  ', 'ГРЕЧКА ВАРЕНАЯ', '  гречка   варёная'];
    const normalized = forms.map(normalizeRuName);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('гречка вареная');
  });

  it('строка из ОДНИХ кириллических букв не становится пустой (граблю \\w не ловит кириллицу)', () => {
    expect(normalizeRuName('борщ')).toBe('борщ');
    expect(normalizeRuName('плов')).not.toBe('');
  });

  it('ё заменяется на е', () => {
    expect(normalizeRuName('свёкла')).toBe('свекла');
  });

  it('стоп-слова отбрасываются КАК ОТДЕЛЬНЫЕ токены, а не подстрокой', () => {
    expect(normalizeRuName('сыр с орехами')).toBe('сыр орехами');
    // «сыр» НЕ теряет первую букву от стоп-слова «с» — подстрочное удаление отрезало бы «ыр».
    expect(normalizeRuName('сыр')).toBe('сыр');
  });

  it('пунктуация и цифры: буквы и цифры остаются, остальное — пробел', () => {
    expect(normalizeRuName('йогурт 2.5%!!')).toBe('йогурт 2 5');
  });

  it('пустая строка и строка из одних разделителей дают пустой результат', () => {
    expect(normalizeRuName('')).toBe('');
    expect(normalizeRuName('   ,,,   ')).toBe('');
  });
});
