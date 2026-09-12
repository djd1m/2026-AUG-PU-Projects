// Закрытые перечисления канона §4 как union-типы, а не строки и не булевы флаги.
// Источник — `docs/canon.md` и `docs/Pseudocode.md` (владелец логических полей).
// Ни одно множество здесь не изобретается и не расширяется молча.

export const RECOGNITION_STATUSES = ['queued', 'done', 'failed', 'refused'] as const;
export type RecognitionStatus = (typeof RECOGNITION_STATUSES)[number];

export const RECOGNITION_FAILURE_REASONS = [
  'provider_unavailable',
  'provider_timeout',
  'schema_violation',
  'no_food_detected',
  'no_food_matched',
  'quota_exhausted_user',
  'quota_exhausted_global',
  'quota_exhausted_escalation',
  // DEC-A-018: `timeout` пишет уборщик застрявших заданий и дедлайн вызова модели,
  // `normalize` — неудачная нормализация кадра (фича scan-pipeline). Десять значений.
  'timeout',
  'normalize',
] as const;
export type RecognitionFailureReason = (typeof RECOGNITION_FAILURE_REASONS)[number];

export const ATTRIBUTION_STATUSES = ['pending', 'activated', 'rejected'] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export const ATTRIBUTION_SOURCES = ['explicit', 'deeplink', 'cookie'] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

export const QUOTA_SCOPES = ['user', 'global', 'escalation'] as const;
export type QuotaScope = (typeof QUOTA_SCOPES)[number];

export const GROWTH_EVENT_TYPES = ['install', 'activation', 'share_click', 'card_view', 'code_applied'] as const;
export type GrowthEventType = (typeof GROWTH_EVENT_TYPES)[number];

export const PHOTO_FILE_STATES = ['present', 'purged'] as const;
export type PhotoFileState = (typeof PHOTO_FILE_STATES)[number];

export const ACCOUNT_STATUSES = ['active', 'erasing', 'erased'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const PRO_INTEREST_CONTACT_KINDS = ['email', 'telegram'] as const;
export type ProInterestContactKind = (typeof PRO_INTEREST_CONTACT_KINDS)[number];

export const PRO_INTEREST_SOURCE_SCREENS = ['user_limit', 'global_limit'] as const;
export type ProInterestSourceScreen = (typeof PRO_INTEREST_SOURCE_SCREENS)[number];

export const PARTNER_STATUSES = ['active', 'suspended'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_CODE_STATUSES = ['active', 'blocked'] as const;
export type PartnerCodeStatus = (typeof PARTNER_CODE_STATUSES)[number];

/** Числа канона §7. Это НЕ настройки окружения — переменной для них нет намеренно. */
export const CANON = {
  /** Порог эскалации к Sonnet 5 по уверенности (ADR-004). */
  escalationConfidenceThreshold: 0.6,
  /** Таймзона календарных суток, границ дня, стрика и суточных потолков. */
  timezone: 'Europe/Moscow',
  /** Срок жизни анонимного дневника, суток. */
  anonymousDiaryDays: 7,
  /** Срок хранения фото, суток. */
  photoRetentionDays: 30,
  /** Аренда задания воркером, секунд (ADR-003). */
  leaseSeconds: 60,
} as const;
