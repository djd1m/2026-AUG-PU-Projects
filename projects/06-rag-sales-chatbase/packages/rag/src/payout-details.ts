// Реквизиты выплаты партнёру (фича partner-and-studio). Донор — N4 projects/04-calorie-vision-cal-ai/apps/api/src/payouts/
// payout-details.ts — ПЕРЕНЕСЕНО (нормализация российского мобильного, отказ номеру карты по Луну в ЛЮБОМ поле); АДАПТИРОВАНО:
// только СБП на телефон (решение владельца 26.09: «раз в месяц 5-го по СБП»), способа «другое» нет.

export type PayoutDetailsError = 'invalid_method' | 'invalid_phone' | 'invalid_bank' | 'card_number_refused';
export interface PayoutDetails { method: 'sbp'; phone: string; bank: string | null }
export type PayoutDetailsResult = { ok: true; value: PayoutDetails } | { ok: false; error: PayoutDetailsError };

const PHONE_MAX = 20;
const BANK_MAX = 100;

/** Российский мобильный в любом привычном написании → канонический `+7XXXXXXXXXX`. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `+7${digits}`;
  return null;
}

/** Строка из 13–19 цифр, проходящая Луна, почти наверняка номер карты: хранение PAN тянет PCI DSS — отказ кодом. */
export function looksLikeCardNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48;
    if (double) { value *= 2; if (value > 9) value -= 9; }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export function validatePayoutDetails(input: { method?: unknown; phone?: unknown; bank?: unknown }): PayoutDetailsResult {
  if (input.method !== 'sbp') return { ok: false, error: 'invalid_method' };
  // Номер карты отвергается ДО всего остального и в ЛЮБОМ поле: иначе его впишут в «банк».
  for (const candidate of [input.phone, input.bank]) {
    if (typeof candidate === 'string' && looksLikeCardNumber(candidate)) return { ok: false, error: 'card_number_refused' };
  }
  if (typeof input.phone !== 'string' || input.phone.trim() === '' || input.phone.trim().length > PHONE_MAX) return { ok: false, error: 'invalid_phone' };
  const phone = normalizePhone(input.phone.trim());
  if (phone === null) return { ok: false, error: 'invalid_phone' };
  if (input.bank === undefined || input.bank === null || input.bank === '') return { ok: true, value: { method: 'sbp', phone, bank: null } };
  if (typeof input.bank !== 'string') return { ok: false, error: 'invalid_bank' };
  const bank = input.bank.trim();
  if (bank === '' || bank.length > BANK_MAX || /[\u0000-\u001f\u007f]/.test(bank)) return { ok: false, error: 'invalid_bank' };
  return { ok: true, value: { method: 'sbp', phone, bank } };
}

export const PAYOUT_DETAILS_MESSAGES: Readonly<Record<PayoutDetailsError, string>> = Object.freeze({
  invalid_method: 'Выплата возможна только по СБП на телефон',
  invalid_phone: 'Укажите российский мобильный номер: +7 900 000-00-00',
  invalid_bank: 'Название банка — до 100 символов',
  card_number_refused: 'Номер карты не принимаем: выплата идёт по СБП на телефон',
});
