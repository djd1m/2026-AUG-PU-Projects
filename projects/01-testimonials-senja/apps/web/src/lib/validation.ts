// Валидация входа на границе системы (правило проекта «Validate input at system boundaries»).
// Формат ошибок общий для всех API-роутов: { errors: string[] } при 400.

export const EMAIL_MAX = 254; // RFC 5321 — длина адреса целиком

/**
 * Намеренно НЕ полная RFC-грамматика: единственный смысл проверки — отсечь очевидный мусор
 * до попадания в БД. Настоящая проверка почты — подтверждение письмом (вне MVP-недели).
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (email.length === 0 || email.length > EMAIL_MAX) return false;
  if (/\s/.test(email)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email);
}

export function normalizeEmail(value: string): string {
  // Только регистр и края. Точки в local-part НЕ схлопываем: для большинства почтовых
  // серверов "a.b@x.ru" и "ab@x.ru" — разные ящики, это правило Gmail, а не стандарт.
  return value.trim().toLowerCase();
}

/**
 * Тот же normalizeEmail, но для НЕПРОВЕРЕННОГО ввода: нестроковое значение — пустая строка.
 * Живёт рядом с базовой функцией НАМЕРЕННО: два объявления нормализации в разных файлах
 * разойдутся, и в этот день владелец не сможет войти в существующий аккаунт никогда.
 */
export function normalizeEmailFromInput(value: unknown): string {
  return typeof value === 'string' ? normalizeEmail(value) : '';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
