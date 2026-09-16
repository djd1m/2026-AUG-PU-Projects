// OWN-013: имя блюда — по составу, а не по самой калорийной позиции.
import { describe, expect, it } from 'vitest';
import { composeDishName } from '../../apps/api/src/share/read-recognition-snapshot.js';

describe('composeDishName', () => {
  it('одна позиция — её название', () => {
    expect(composeDishName(['хлеб'])).toBe('хлеб');
  });
  it('две — через «и»', () => {
    expect(composeDishName(['огурец', 'хлеб'])).toBe('огурец и хлеб');
  });
  it('три — запятая и «и» перед последним (случай владельца 16.09.2026)', () => {
    expect(composeDishName(['огурец', 'помидор', 'хлеб'])).toBe('огурец, помидор и хлеб');
  });
  it('больше трёх — «и ещё N», заголовок не превращается в перечень', () => {
    expect(composeDishName(['рис', 'курица', 'салат', 'соус', 'хлеб'])).toBe('рис, курица и ещё 3');
  });
  it('пустые и пробельные названия отбрасываются, пустой список — пустая строка', () => {
    expect(composeDishName([' ', ''])).toBe('');
    expect(composeDishName([])).toBe('');
    expect(composeDishName(['  хлеб  ', ''])).toBe('хлеб');
  });
});
