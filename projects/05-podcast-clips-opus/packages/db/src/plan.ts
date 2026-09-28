// Действующий план аккаунта в SQL — ОДНО место для всех чтений (фича 30 payments, AC-11, U6 плана).
// Оплаченный план истекает по plan_paid_until ДО прохода сторожа: иначе между концом срока и сторожем клип
// рендерился бы без метки и не получал срок хранения. Зеркало в TS — `effectivePlan` (@clipmaker/shared/tariff).
// Сравнение НА РАВЕНСТВО (ADR-004): всё, что не ровно 'paid', и неизвестный источник — 'free'.
const IDENT = /^[a-z][a-z0-9_]*$/;
const NOW = /^(now\(\)|\$[1-9][0-9]?)$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error('Непригодный псевдоним таблицы в SQL плана');
  return name;
}
function clock(now: string): string {
  if (!NOW.test(now)) throw new Error('Непригодное выражение времени в SQL плана');
  return now;
}
/** `(… 'paid' | 'free')` для строки account с псевдонимом `a`. `now` — `now()` или номер параметра с моментом. */
export function effectivePlanSql(a = 'a', now = 'now()'): string {
  const t = ident(a), at = clock(now);
  return `(CASE WHEN ${t}.plan='paid' AND (${t}.plan_source IN ('none','operator') OR (${t}.plan_source='payment' AND ${t}.plan_paid_until > ${at})) THEN 'paid' ELSE 'free' END)`;
}
/**
 * От какого момента считается срок хранения клипа бесплатного тарифа (FR-TARIFF-003, AC-12): от готовности записи,
 * но не раньше конца оплаченного срока. Иначе первый же проход ретенции после истечения стёр бы все клипы
 * оплаченного периода старше 3 суток — тихая потеря данных клиента. Не закончена запись — срока нет (NULL).
 * Снятие плана оператором стирает plan_paid_until (ops:set-plan), и срок снова считается от готовности.
 */
export function retentionFromSql(v = 'v', a = 'a'): string {
  const video = ident(v), account = ident(a);
  return `(CASE WHEN ${video}.finished_at IS NULL THEN NULL ELSE GREATEST(${video}.finished_at, ${account}.plan_paid_until) END)`;
}
