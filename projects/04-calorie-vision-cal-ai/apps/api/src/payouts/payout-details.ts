// Реквизиты выплаты партнёру (пункт 3, частично). Проверка ВВОДА — здесь, до базы.

export type PayoutMethod = 'sbp' | 'other';

export interface PayoutDetailsInput {
  readonly method: PayoutMethod;
  readonly phone?: string | null;
  readonly bank?: string | null;
  readonly note?: string | null;
}

export type PayoutDetailsError =
  | 'invalid_method'
  | 'invalid_phone'
  | 'invalid_bank'
  | 'invalid_note'
  | 'card_number_refused';

export type PayoutDetailsResult =
  | { readonly ok: true; readonly value: { readonly method: PayoutMethod; readonly phone: string | null; readonly bank: string | null; readonly note: string | null } }
  | { readonly ok: false; readonly error: PayoutDetailsError };

const PHONE_MAX = 20;
const BANK_MAX = 100;
const NOTE_MAX = 300;

/** Российский мобильный в любом привычном написании → канонический `+7XXXXXXXXXX`. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `+7${digits}`;
  return null;
}

/**
 * Проверка Луна — та самая, которой проверяют номера карт. Нужна здесь НЕ чтобы принять номер,
 * а чтобы ОТКАЗАТЬ: строка из 13–19 цифр, проходящая Луна, почти наверняка номер карты, а
 * хранение PAN тянет PCI DSS. Отказ кодом, а не просьбой в подсказке поля.
 */
export function looksLikeCardNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

export function validatePayoutDetails(input: PayoutDetailsInput): PayoutDetailsResult {
  if (input.method !== 'sbp' && input.method !== 'other') return { ok: false, error: 'invalid_method' };

  // Номер карты отвергается ДО всего остального и в ЛЮБОМ поле: иначе его впишут в «примечание».
  for (const candidate of [input.phone, input.bank, input.note]) {
    if (typeof candidate === 'string' && looksLikeCardNumber(candidate)) return { ok: false, error: 'card_number_refused' };
  }

  if (input.method === 'sbp') {
    const raw = text(input.phone, PHONE_MAX);
    if (raw === null) return { ok: false, error: 'invalid_phone' };
    const phone = normalizePhone(raw);
    if (phone === null) return { ok: false, error: 'invalid_phone' };
    const bank = input.bank === undefined || input.bank === null || input.bank === '' ? null : text(input.bank, BANK_MAX);
    if (input.bank !== undefined && input.bank !== null && input.bank !== '' && bank === null) return { ok: false, error: 'invalid_bank' };
    return { ok: true, value: { method: 'sbp', phone, bank, note: null } };
  }

  const note = text(input.note, NOTE_MAX);
  if (note === null) return { ok: false, error: 'invalid_note' };
  return { ok: true, value: { method: 'other', phone: null, bank: null, note } };
}

/** Телефон для показа: последние две цифры открыты, остальное скрыто. */
export function maskPhone(phone: string): string {
  return phone.length < 4 ? phone : `${phone.slice(0, 2)}•••••${phone.slice(-2)}`;
}
