// Пункт 3 (частично): реквизиты выплаты. Главное проверяемое свойство — номера карт НЕ
// принимаются: хранение PAN тянет PCI DSS, и отказ обязан быть кодом, а не просьбой в подсказке.
import { describe, expect, it } from 'vitest';
import { looksLikeCardNumber, maskPhone, normalizePhone, validatePayoutDetails } from '../../apps/api/src/payouts/payout-details.js';

describe('телефон приводится к каноническому виду', () => {
  it.each([
    ['+7 999 123-45-67', '+79991234567'],
    ['8 (999) 123 45 67', '+79991234567'],
    ['79991234567', '+79991234567'],
    ['9991234567', '+79991234567'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
  it('не телефон — null, а не «как-нибудь примем»', () => {
    for (const bad of ['123', '+1 555 0100', 'телефон', '', '899912345678']) expect(normalizePhone(bad), bad).toBeNull();
  });
});

describe('номер карты распознаётся и ОТВЕРГАЕТСЯ', () => {
  it('настоящие тестовые номера карт распознаются', () => {
    for (const pan of ['4111111111111111', '5555 5555 5555 4444', '5555555555554477']) {
      expect(looksLikeCardNumber(pan), pan).toBe(true);
    }
  });
  it('телефон и обычный текст картой не считаются', () => {
    for (const ok of ['+79991234567', 'Сбербанк', '2026', '1234']) expect(looksLikeCardNumber(ok), ok).toBe(false);
  });
  it('карта в ЛЮБОМ поле — отказ, включая «примечание»: иначе её впишут туда', () => {
    expect(validatePayoutDetails({ method: 'other', note: 'карта 4111 1111 1111 1111' })).toEqual({ ok: false, error: 'card_number_refused' });
    expect(validatePayoutDetails({ method: 'sbp', phone: '4111111111111111' })).toEqual({ ok: false, error: 'card_number_refused' });
    expect(validatePayoutDetails({ method: 'sbp', phone: '+79991234567', bank: '5555555555554444' })).toEqual({ ok: false, error: 'card_number_refused' });
  });
});

describe('состав реквизитов', () => {
  it('СБП: телефон обязателен, банк необязателен', () => {
    expect(validatePayoutDetails({ method: 'sbp', phone: '+7 999 123-45-67' })).toEqual({
      ok: true, value: { method: 'sbp', phone: '+79991234567', bank: null, note: null },
    });
    expect(validatePayoutDetails({ method: 'sbp', phone: '+79991234567', bank: 'Т-Банк' }).ok).toBe(true);
    expect(validatePayoutDetails({ method: 'sbp', phone: null })).toEqual({ ok: false, error: 'invalid_phone' });
  });
  it('иной способ: описание обязательно — способ без адресата это отсутствие реквизитов', () => {
    expect(validatePayoutDetails({ method: 'other', note: 'ИП, счёт в Т-Банке, договор №12' }).ok).toBe(true);
    expect(validatePayoutDetails({ method: 'other', note: '   ' })).toEqual({ ok: false, error: 'invalid_note' });
  });
  it('неизвестный способ — отказ, а не «наверное, СБП» (fail-closed)', () => {
    expect(validatePayoutDetails({ method: 'крипта' as never, note: 'x' })).toEqual({ ok: false, error: 'invalid_method' });
  });
});

describe('показ реквизитов', () => {
  it('телефон маскируется: экран показывает «задано ли», а не сами данные', () => {
    const masked = maskPhone('+79991234567');
    expect(masked).toContain('67');
    expect(masked).not.toContain('9991234');
  });
});
