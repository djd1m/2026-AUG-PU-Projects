// FR-007 — тарифы. Источник: Specification FR-007, ADR-002.
//
// Единственное место, где живёт правило «что даёт платный тариф». Оно намеренно
// centralized: как только таких мест станет два, они разойдутся, и badge исчезнет
// где-то в одной ветке, а вместе с ним — growth-петля.
//
// Различие, релевантное MVP, ровно одно (Specification FR-007 AC): обязательность badge.
// Добавлять сюда «фичи платного тарифа» без строки в Specification нельзя.

export const TIERS = ['free', 'paid'] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** 30 дней — период, который продаётся (DEC-001, решение владельца 2026-09-02). */
export const PAID_PERIOD_DAYS = 30;

/**
 * Единственная функция, отвечающая на вопрос «нужен ли badge».
 *
 * Принимает ТАРИФ И СРОК ИЗ БД — и ничего больше. Отсутствие параметра, приходящего
 * от клиента, здесь не упрощение, а реализация инварианта ADR-002: не существует
 * значения, которым клиент мог бы повлиять на ответ. Момент времени параметром сделан
 * ради проверяемости (иначе тест на «просрочено» пришлось бы писать через ожидание),
 * но приходит он из системных часов, а не из запроса.
 *
 * FAIL-CLOSED В ОБЕИХ ОСЯХ. Badge НЕ требуется ровно в одном случае: тариф в точности
 * `'paid'` И срок разбирается в дату И эта дата в будущем. Всё остальное — неизвестный
 * тариф, `null`, пустая строка, неразбираемая дата, просроченная дата — badge требуется.
 *
 * Почему срок вообще появился: до 018 оплата ставила `tier = 'paid'` навсегда, и продажа
 * месяца означала бы обещать месяц, а выдавать пожизненно.
 */
export function badgeRequiredFor(
  tierFromDatabase: unknown,
  paidUntilFromDatabase?: unknown,
  now: Date = new Date(),
): boolean {
  if (tierFromDatabase !== 'paid') return true;
  const until = toDate(paidUntilFromDatabase);
  if (until === null) return true;
  return until.getTime() <= now.getTime();
}

/**
 * «Оплата действует прямо сейчас?» — тот же единственный источник, что и badgeRequiredFor.
 * Отдельная функция, а не `!badgeRequiredFor(...)` на месте вызова: отрицание правила про
 * badge читается как «badge не нужен», и смысл «оплачено» в нём теряется.
 */
export function isPaid(
  tierFromDatabase: unknown,
  paidUntilFromDatabase?: unknown,
  now: Date = new Date(),
): boolean {
  return !badgeRequiredFor(tierFromDatabase, paidUntilFromDatabase, now);
}

/**
 * Разбор срока. Непригодное значение трактуется как ОТСУТСТВУЮЩЕЕ, а не подчищается:
 * `new Date('мусор')` даёт Invalid Date, у которого getTime() это NaN, а любое сравнение
 * с NaN ложно — то есть «мусор» молча прошёл бы как «срок не истёк».
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Новый срок после оплаты: продление НЕ сжигает остаток. */
export function extendPaidUntil(current: unknown, now: Date = new Date()): Date {
  const from = toDate(current);
  const base = from !== null && from.getTime() > now.getTime() ? from : now;
  return new Date(base.getTime() + PAID_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/** Человекочитаемое описание для дашборда — что именно даёт переход. */
export function tierSummary(tier: Tier): { label: string; badge: string } {
  return tier === 'paid'
    ? { label: 'Платный', badge: 'Badge «Powered by Proofwall» скрыт' }
    : { label: 'Бесплатный', badge: 'Badge «Powered by Proofwall» показывается в виджете' };
}
