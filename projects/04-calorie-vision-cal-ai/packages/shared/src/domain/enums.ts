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
  // Два значения за пределы исходных восьми канона (DEC-A-017/DEC-A-018). Десять значений.
  // `timeout` — общий бюджет задачи 30 с истёк (FR-scan-pipeline-20); его пишет и уборщик
  // застрявших заданий, и дедлайн вызова модели.
  // `normalize` — нормализация кадра не уложилась в свой дедлайн 3000 мс (FR-scan-pipeline-5).
  // Зеркалируется миграцией `002_failure_reason_timeout.sql`.
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

  // ─── Числа фичи `scan-pipeline` (литералы канона AC-scan-pipeline-33, не примерные) ───
  /** Общий бюджет задачи от `created_at`, мс (FR-scan-pipeline-20). */
  scanTaskBudgetMs: 30_000,
  /** Дедлайн одного вызова модели, мс (FR-scan-pipeline-6). */
  modelCallDeadlineMs: 25_000,
  /** Фиксированный дедлайн нормализации фото, мс, ОТДЕЛЬНЫЙ от бюджета задачи (FR-scan-pipeline-5). */
  normalizeDeadlineMs: 3_000,
  /** Ниже этого остатка бюджета эскалация НЕ предпринимается (FR-scan-pipeline-7, VS-05). */
  escalationMinRemainingMs: 8_000,
  /** Верхняя граница разрешения на приёме и при нормализации, включительно (FR-scan-pipeline-17). */
  maxInputBytes: 12_582_912,
  /** Общий бюджет распаковки в пикселях (decompression-bomb, FR-scan-pipeline-1/17). */
  maxDecodePixels: 50_000_000,
  /** Минимальное разрешение принимаемого фото. */
  minInputDimensionPx: 320,
  /** Длинная сторона нормализованной копии, px (FR-scan-pipeline-5). */
  normalizedMaxDimensionPx: 1568,
  /** Максимальный размер нормализованной копии, байт (5 МБ). */
  normalizedMaxBytes: 5_242_880,
  /** Предел итераций сжатия при нормализации (FR-scan-pipeline-5, шаг 5). */
  normalizeCompressIterations: 6,
  /** Качество JPEG нормализованной копии. */
  normalizedJpegQuality: 85,
  /** Срок жизни фото до уборки, суток (то же, что `photoRetentionDays`, имя по контексту фичи). */
  photoExpiryDays: 30,
  /** Возраст бесхозного объекта в бакете до уборки орфанов, мс (FR-scan-pipeline-14 шаг 12). */
  orphanObjectMaxAgeMs: 60 * 60 * 1000,
  /** Никогда не захваченное задание — сметается через это время, мс (FR-scan-pipeline-16 правило А). */
  neverLeasedSweepMs: 5 * 60 * 1000,
  /** Верхняя граница числа захватов задания (`foundation`, зависимость предиката выборки). */
  maxLeaseFence: 3,
  /** Название первичной модели (ADR-004). Значение из CHECK-ограничения `recognition.model_used`. */
  modelPrimary: 'haiku-4.5',
  /** Название эскалационной модели (ADR-004). */
  modelEscalation: 'sonnet-5',
  /** Грейс-период агрегатора журнала для непарных `START` (FR-scan-pipeline-21). */
  modelCallLogGraceMs: 2 * 60 * 1000,
} as const;
