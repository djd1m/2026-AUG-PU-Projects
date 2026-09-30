// Закрытые множества N6b — объявлены ОДИН раз здесь (coding-style.md). CHECK-ограничения миграций обязаны
// совпадать с ними: тест packages/db/tests/unit/enums-vs-migrations.test.ts сверяет каждое множество с SQL.
// Окружение выбирает вариант, но не задаёт множество (honest-configuration CFG-I8).

export const ACCOUNT_KINDS = ['owner', 'studio'] as const;
export const PLANS = ['free', 'start', 'studio'] as const;
export const BADGE_REMOVAL = ['none', 'active'] as const;
export const SOURCE_KINDS = ['site', 'pdf'] as const;
export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed'] as const;
export const QUESTION_CHANNELS = ['sandbox', 'widget', 'demo'] as const;
export const QUESTION_OUTCOMES = [
  'answered', 'below_threshold', 'model_unknown', 'invalid_citation', 'limited', 'error',
] as const;
export const MODEL_CALL_KINDS = ['embed_index', 'embed_question', 'answer'] as const;
export const MODEL_CALL_STATES = ['started', 'succeeded', 'failed'] as const;
export const BADGE_EVENT_KINDS = ['impression', 'click', 'tamper'] as const;
export const GROWTH_EVENT_KINDS = ['first_cited_answer', 'badge_removal_intent'] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type Plan = (typeof PLANS)[number];

/** Имя CHECK-ограничения в миграции → множество. Используется стражем сверки. */
export const CHECKED_SETS: Readonly<Record<string, readonly string[]>> = {
  account_kind_check: ACCOUNT_KINDS,
  account_badge_removal_check: BADGE_REMOVAL,
  source_kind_check: SOURCE_KINDS,
  index_job_state_check: JOB_STATES,
  question_log_channel_check: QUESTION_CHANNELS,
  question_log_outcome_check: QUESTION_OUTCOMES,
  model_call_log_kind_check: MODEL_CALL_KINDS,
  model_call_log_state_check: MODEL_CALL_STATES,
  badge_event_kind_check: BADGE_EVENT_KINDS,
  growth_event_kind_check: GROWTH_EVENT_KINDS,
};

/**
 * Тариф толкуется в коде fail-closed (ADR-006): всё, что не ровно 'start' или 'studio', — 'free'.
 * Колонка account.plan — text без CHECK именно поэтому: неопознанное значение читается как free, а не роняет запись.
 */
export function planOf(value: unknown): Plan {
  return value === 'start' || value === 'studio' ? value : 'free';
}

/** Тип аккаунта при регистрации: неизвестное → owner (Pseudocode «Register and login», шаг 2). */
export function accountKindOf(value: unknown): AccountKind {
  return value === 'studio' ? 'studio' : 'owner';
}
