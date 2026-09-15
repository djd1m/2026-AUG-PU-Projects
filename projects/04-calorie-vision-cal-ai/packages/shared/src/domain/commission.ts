// Арифметика комиссии и календарь выплат (ADR-011, ADR-013, ADR-014, OWN-009, OWN-011).
//
// Здесь НЕТ ни базы, ни HTTP: это чистые функции, потому что деньги — ровно тот случай, где
// ошибка обязана ловиться самым дешёвым слоем. Округление, знак и граница зрелости проверяются
// таблицей значений, а не прогоном по стенду.
//
// Все суммы — ЦЕЛОЕ ЧИСЛО КОПЕЕК. Плавающая точка не используется нигде и стережётся отдельной
// проверкой по исходнику: 0,1 + 0,2 в double не равно 0,3, и на деньгах это расхождение
// накапливается молча.

/** Ставка в базисных пунктах: 5000 = 50,00 %. Живёт на партнёре, не константой (ADR-012). */
export type RateBp = number;

export const DEFAULT_COMMISSION_RATE_BP: RateBp = 5000;

export type CommissionKind = 'accrual' | 'clawback' | 'payout';

export interface CommissionEntry {
  readonly kind: CommissionKind;
  /** accrual > 0; clawback и payout < 0. Баланс есть СУММА записей (ADR-013). */
  readonly amountMinor: number;
  readonly availableAt: Date;
}

/**
 * Начисление с ФАКТИЧЕСКИ ПОЛУЧЕННОЙ суммы (ADR-011): `netMinor` приходит из события провайдера
 * и никогда не вычисляется нами — вычислить его значило бы угадать удержание.
 *
 * Округление ВНИЗ и это решение, а не небрежность: при округлении вверх сумма начислений по
 * множеству платежей может превысить полученные деньги, и продукт оказывается должен больше,
 * чем получил.
 *
 * Неположительный `net` не порождает положительного начисления НИКОГДА (fail-closed).
 */
export function accrualAmountMinor(netMinor: number, rateBp: RateBp): number {
  if (!Number.isInteger(netMinor) || !Number.isInteger(rateBp)) {
    throw new Error('суммы и ставка комиссии обязаны быть целыми: деньги не считаются дробным типом');
  }
  if (rateBp < 0 || rateBp > 10_000) throw new Error(`ставка вне диапазона 0..10000 базисных пунктов: ${rateBp}`);
  if (netMinor <= 0) return 0;
  return Math.floor((netMinor * rateBp) / 10_000);
}

/** Баланс партнёра НЕ хранится полем — он есть сумма записей (ADR-013). */
export function balanceMinor(entries: readonly CommissionEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
}

/**
 * Зрелость: начисление доступно к выплате не раньше `paid_at + holdDays` (ADR-014).
 * Граница ВКЛЮЧАЮЩАЯ: ровно holdDays — уже доступно (AC-21).
 */
export function maturesAt(paidAt: Date, holdDays: number): Date {
  if (!Number.isInteger(holdDays) || holdDays < 0) {
    throw new Error('окно возврата обязано быть целым неотрицательным числом дней');
  }
  return new Date(paidAt.getTime() + holdDays * 24 * 60 * 60 * 1000);
}

/** Доступно к выплате на момент `at`: только зрелые записи, но обратные списания — ВСЕГДА. */
export function availableForPayoutMinor(entries: readonly CommissionEntry[], at: Date): number {
  return entries.reduce((sum, entry) => {
    // Долг уменьшает доступное немедленно: ждать зрелости у отрицательной записи означало бы
    // выплатить деньги, которые уже отозваны (fail-closed в пользу продукта).
    if (entry.amountMinor < 0) return sum + entry.amountMinor;
    return entry.availableAt.getTime() <= at.getTime() ? sum + entry.amountMinor : sum;
  }, 0);
}

/**
 * Календарь выплат (OWN-011): 5-е число каждого месяца по московскому времени — той же зоне,
 * в которой живут сутки, стрик и потолки продукта (канон).
 *
 * Возвращает БЛИЖАЙШЕЕ 5-е число, наступающее строго после `at`, либо сегодняшнее 5-е, если
 * `at` ещё не прошло его начало.
 */
export function nextPayoutDate(at: Date): Date {
  const moscowOffsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(at.getTime() + moscowOffsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const fifth = Date.UTC(year, month, 5) - moscowOffsetMs;
  if (fifth > at.getTime()) return new Date(fifth);
  return new Date(Date.UTC(year, month + 1, 5) - moscowOffsetMs);
}

export interface PayoutPreview {
  /** Попадёт в ближайшую выплату 5-го числа. */
  readonly dueMinor: number;
  /** Не дозрело к этой дате и переезжает на следующее 5-е. */
  readonly deferredMinor: number;
  readonly payoutDate: Date;
}

/**
 * Обе суммы считаются ЗАРАНЕЕ и показываются партнёру до даты выплаты: перенос, обнаруженный
 * по факту, читается как пропавшие деньги (ADR-014, Consequences).
 */
export function previewNextPayout(entries: readonly CommissionEntry[], at: Date): PayoutPreview {
  const payoutDate = nextPayoutDate(at);
  const dueMinor = availableForPayoutMinor(entries, payoutDate);
  const total = balanceMinor(entries);
  return { dueMinor, deferredMinor: total - dueMinor, payoutDate };
}
