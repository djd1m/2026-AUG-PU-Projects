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

/**
 * Единственная функция, отвечающая на вопрос «нужен ли badge».
 *
 * Принимает ТАРИФ ИЗ БД и ничего больше. Отсутствие второго аргумента здесь —
 * не упрощение, а реализация инварианта ADR-002: не существует параметра, которым
 * клиент мог бы повлиять на ответ.
 *
 * Неизвестное/повреждённое значение тарифа трактуется как free: «не смогли
 * определить» обязано означать самый строгий вариант, а не самый мягкий.
 */
export function badgeRequiredFor(tierFromDatabase: unknown): boolean {
  return tierFromDatabase !== 'paid';
}

/** Человекочитаемое описание для дашборда — что именно даёт переход. */
export function tierSummary(tier: Tier): { label: string; badge: string } {
  return tier === 'paid'
    ? { label: 'Платный', badge: 'Badge «Powered by Proofwall» скрыт' }
    : { label: 'Бесплатный', badge: 'Badge «Powered by Proofwall» показывается в виджете' };
}
