// ClassifyContact (AC-pro-interest-and-limits-ui-5): контакт классифицируется ПО ФОРМЕ
// значения, а не по заявлению пользователя. Таблица примеров включает границы длины и
// обе формы Telegram (логин и числовой telegram_id).

import { describe, expect, it } from 'vitest';
import { classifyContact } from '@n4/shared';

describe('контакт классифицируется по форме значения, а не по намерению', () => {
  it('AC-5: три распознаваемые формы дают email/telegram/telegram', () => {
    expect(classifyContact('a@b.ru')).toEqual({ kind: 'email', normalized: 'a@b.ru' });
    expect(classifyContact('@ivan_petrov')).toEqual({ kind: 'telegram', normalized: '@ivan_petrov' });
    expect(classifyContact('79991234567')).toEqual({ kind: 'telegram', normalized: '79991234567' });
  });

  it('AC-5: пустая строка и произвольный текст не классифицируются', () => {
    expect(classifyContact('')).toEqual({ kind: 'unrecognized' });
    expect(classifyContact('просто текст')).toEqual({ kind: 'unrecognized' });
  });

  it('пустая строка из одних пробелов — тоже unrecognized (шаг 1, обрезка ДО проверки)', () => {
    expect(classifyContact('   ')).toEqual({ kind: 'unrecognized' });
  });

  it('email нормализуется в нижний регистр, Telegram — нет', () => {
    expect(classifyContact('  A@B.RU  ')).toEqual({ kind: 'email', normalized: 'a@b.ru' });
    expect(classifyContact('  @Ivan_Petrov  ')).toEqual({ kind: 'telegram', normalized: '@Ivan_Petrov' });
  });

  it('email без точки в домене НЕ угадывается как telegram (шаг 5)', () => {
    expect(classifyContact('a@b')).toEqual({ kind: 'unrecognized' });
  });

  it('Telegram-логин: границы длины 5/4/32/33 символов', () => {
    expect(classifyContact('abcd')).toEqual({ kind: 'unrecognized' }); // 4 — короче минимума
    expect(classifyContact('abcde')).toEqual({ kind: 'telegram', normalized: 'abcde' }); // 5 — минимум
    expect(classifyContact('a'.repeat(32))).toEqual({ kind: 'telegram', normalized: 'a'.repeat(32) }); // 32 — максимум
    expect(classifyContact('a'.repeat(33))).toEqual({ kind: 'unrecognized' }); // 33 — длиннее максимума
  });

  it('числовая строка короче 5 символов не проходит ни одну форму (общая нижняя граница)', () => {
    expect(classifyContact('1234')).toEqual({ kind: 'unrecognized' }); // 4 цифры — короче минимума
    expect(classifyContact('12345')).toEqual({ kind: 'telegram', normalized: '12345' }); // 5 цифр — минимум формы
  });

  it('верхняя граница длины входа: 254 символа проходит, 255 — нет (шаг 2)', () => {
    const local = 'a'.repeat(64);
    const domainAt254 = 'b'.repeat(254 - local.length - 1 - 1 - 2); // local + '@' + '.' + 'ru' = 254
    const at254 = `${local}@${domainAt254}.ru`;
    expect(at254).toHaveLength(254);
    expect(classifyContact(at254).kind).toBe('email');

    expect(classifyContact(`x${at254}`)).toEqual({ kind: 'unrecognized' }); // 255 символов
  });

  it('ведущие и хвостовые пробелы обрезаются до классификации', () => {
    expect(classifyContact('  a@b.ru  ')).toEqual({ kind: 'email', normalized: 'a@b.ru' });
  });
});
