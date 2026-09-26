// Арифметика комиссии партнёра и календарь выплат (фича partner-and-studio, A-N6-043). Донор — N4
// projects/04-calorie-vision-cal-ai/packages/shared/src/domain/commission.ts — ПЕРЕНЕСЕНО почти как есть (floor, ставка в
// базисных пунктах, зрелость с включающей границей, долг уменьшает доступное сразу, 5-е число по Москве); добавлены
// числа владельца (26.09) и минимальная выплата с переносом.
//
// Чистые функции без базы и HTTP: деньги — тот случай, где ошибка ловится самым дешёвым слоем. Все суммы — ЦЕЛЫЕ копейки.

/** Ставка в базисных пунктах: 2000 = 20,00 %. Живёт на коде партнёра (partner_code.commission_rate_bp). */
export type RateBp = number;
/** Решения владельца на чекпойнте плана фичи 15 (26.09, A-N6-043). */
export const DEFAULT_COMMISSION_RATE_BP: RateBp = 2000;
/** Начисление доступно к выплате через 30 дней после оплаты — окно возврата разовой 30-дневной оплаты. */
export const COMMISSION_HOLD_DAYS = 30;
/** Комиссия идёт с платежей клиента 12 месяцев с его ПЕРВОЙ оплаты. */
export const COMMISSION_WINDOW_MONTHS = 12;
/** Выплата раз в месяц 5-го по СБП, минимум 1 000 ₽; меньшая сумма переносится на следующее 5-е. */
export const PAYOUT_MINIMUM_MINOR = 100_000;
export const PAYOUT_DAY_OF_MONTH = 5;

export type CommissionKind = 'accrual' | 'clawback' | 'payout';
export interface CommissionEntry {
  readonly kind: CommissionKind;
  /** accrual > 0; clawback и payout < 0. Баланс есть СУММА записей. */
  readonly amountMinor: number;
  readonly availableAt: Date;
}

/**
 * Начисление с ФАКТИЧЕСКИ ПОЛУЧЕННОЙ суммы: `netMinor` = сумма платежа − удержание ЮКассы (income_amount) и никогда не
 * угадывается. Округление ВНИЗ: при округлении вверх сумма начислений могла бы превысить полученные деньги.
 * Неположительный `net` не порождает положительного начисления НИКОГДА.
 */
export function accrualAmountMinor(netMinor: number, rateBp: RateBp): number {
  if (!Number.isInteger(netMinor) || !Number.isInteger(rateBp)) {
    throw new Error('суммы и ставка комиссии обязаны быть целыми: деньги не считаются дробным типом');
  }
  if (rateBp < 0 || rateBp > 10_000) throw new Error(`ставка вне диапазона 0..10000 базисных пунктов: ${rateBp}`);
  if (netMinor <= 0) return 0;
  return Math.floor((netMinor * rateBp) / 10_000);
}

/** База начисления: сумма − удержание. Удержание неизвестно (нет income_amount) — базы нет (null), а не «вся сумма». */
export function commissionBaseMinor(amountMinor: number, feeMinor: number | null): number | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  if (feeMinor === null || !Number.isInteger(feeMinor) || feeMinor < 0 || feeMinor > amountMinor) return null;
  return amountMinor - feeMinor;
}

/** Баланс партнёра НЕ хранится полем — он есть сумма записей. */
export function balanceMinor(entries: readonly CommissionEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
}

/** Зрелость: начисление доступно не раньше `paid_at + holdDays`. Граница ВКЛЮЧАЮЩАЯ. */
export function maturesAt(paidAt: Date, holdDays: number = COMMISSION_HOLD_DAYS): Date {
  if (!Number.isInteger(holdDays) || holdDays < 0) throw new Error('окно возврата обязано быть целым неотрицательным числом дней');
  return new Date(paidAt.getTime() + holdDays * 24 * 60 * 60 * 1000);
}

/** Доступно к выплате на момент `at`: только зрелые начисления, но отрицательные записи (сторно, выплаты) — ВСЕГДА. */
export function availableForPayoutMinor(entries: readonly CommissionEntry[], at: Date): number {
  return entries.reduce((sum, entry) => {
    // Долг уменьшает доступное немедленно: ждать зрелости у отрицательной записи — выплатить уже отозванное.
    if (entry.amountMinor < 0) return sum + entry.amountMinor;
    return entry.availableAt.getTime() <= at.getTime() ? sum + entry.amountMinor : sum;
  }, 0);
}

/** Ближайшее 5-е число по Москве, наступающее строго после `at` (или сегодняшнее, если его начало ещё впереди). */
export function nextPayoutDate(at: Date): Date {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(at.getTime() + moscowOffsetMs);
  const fifth = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), PAYOUT_DAY_OF_MONTH) - moscowOffsetMs;
  if (fifth > at.getTime()) return new Date(fifth);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, PAYOUT_DAY_OF_MONTH) - moscowOffsetMs);
}

/**
 * Дата выплаты, к которой относится момент `at`: весь день 5-го числа по Москве — СЕГОДНЯШНЯЯ выплата (с 00:00 до 24:00),
 * иначе ближайшее следующее 5-е (ревью фичи 15, находка 3: утром 5-го nextPayoutDate уже отдавал следующий месяц).
 */
export function payoutDateFor(at: Date): Date {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(at.getTime() + moscowOffsetMs);
  if (local.getUTCDate() === PAYOUT_DAY_OF_MONTH) return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), PAYOUT_DAY_OF_MONTH) - moscowOffsetMs);
  return nextPayoutDate(at);
}

export interface PayoutPreview {
  /** Попадёт в ближайшую выплату 5-го: зрелое на эту дату и не меньше минимума; иначе 0. */
  readonly dueMinor: number;
  /** Не дозрело, либо зрелое меньше минимума — переносится на следующее 5-е. */
  readonly deferredMinor: number;
  /** Отрицательный баланс (сторно после выплаты): гасится из будущих начислений, не взыскивается. */
  readonly debtMinor: number;
  readonly payoutDate: Date;
}

/** Обе суммы показываются ЗАРАНЕЕ: перенос, обнаруженный по факту, читается как пропавшие деньги (N4 ADR-014). */
export function previewNextPayout(entries: readonly CommissionEntry[], at: Date): PayoutPreview {
  const payoutDate = payoutDateFor(at);
  return previewFromTotals(balanceMinor(entries), availableForPayoutMinor(entries, payoutDate), payoutDate);
}
/** То же по суммам (кабинет считает их в SQL): total — баланс, availableMinor — доступное на дату выплаты. */
export function previewFromTotals(totalMinor: number, availableMinor: number, payoutDate: Date): PayoutPreview {
  if (totalMinor < 0) return { dueMinor: 0, deferredMinor: 0, debtMinor: -totalMinor, payoutDate };
  const available = Math.max(0, Math.min(availableMinor, totalMinor));
  const dueMinor = available >= PAYOUT_MINIMUM_MINOR ? available : 0;
  return { dueMinor, deferredMinor: totalMinor - dueMinor, debtMinor: 0, payoutDate };
}

/** Окно комиссии: платёж клиента попадает, если он не позже 12 месяцев с первой оплаты клиента. */
export function withinCommissionWindow(firstPaidAt: Date, paidAt: Date): boolean {
  const end = new Date(firstPaidAt.getTime());
  end.setUTCMonth(end.getUTCMonth() + COMMISSION_WINDOW_MONTHS);
  return paidAt.getTime() < end.getTime();
}

/** Рубли для экрана из копеек (целое деление, без плавающей точки). */
export function formatRub(minor: number): string {
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(minor);
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  const grouped = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}${kop === 0 ? '' : `,${String(kop).padStart(2, '0')}`} ₽`;
}
