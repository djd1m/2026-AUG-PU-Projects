// Ключи потолков (FR-foundation-5, `CheckAndConsumeQuota` шаг 2).
//
// Ключей у анонима ДВА, а не один: сессия устройства и усечённый префикс адреса.
// Смена любого одного обнулила бы защиту целиком.
//
// `primary` списывает ТРИ ключа, `escalation` — ЧЕТЫРЕ. Четвёртый — ОТДЕЛЬНЫЙ счётчик,
// а не тот же самый: без своей строки потолок 600 не с чем сравнить, и дорогая модель
// оказалась бы ограничена только вдесятеро более слабым потолком 3000 (ADR-007).

import type { QuotaLimits, QuotaScope } from '@n4/shared';

export type QuotaReason = 'primary' | 'escalation';

export interface QuotaKey {
  readonly scope: QuotaScope;
  readonly scopeKey: string;
  readonly limit: number;
}

/** Константа ключа общесистемных счётчиков. Одна строка на сутки, а не на пользователя. */
export const GLOBAL_SCOPE_KEY = 'all';

export function quotaKeys(
  reason: QuotaReason,
  sessionId: string,
  ipPrefix: string,
  limits: QuotaLimits,
): QuotaKey[] {
  const keys: QuotaKey[] = [
    { scope: 'user', scopeKey: sessionId, limit: limits.scanLimitUser },
    { scope: 'user', scopeKey: ipPrefix, limit: limits.scanLimitUser },
    { scope: 'global', scopeKey: GLOBAL_SCOPE_KEY, limit: limits.scanLimitDay },
  ];
  if (reason === 'escalation') {
    keys.push({ scope: 'escalation', scopeKey: GLOBAL_SCOPE_KEY, limit: limits.escalationLimitDay });
  }
  return keys;
}

/**
 * Календарные сутки в Europe/Moscow, а не в UTC: суточный потолок обязан сбрасываться
 * по московской полуночи, иначе ужин в 23:50 считается завтрашним днём.
 */
export function moscowDay(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts;
}
