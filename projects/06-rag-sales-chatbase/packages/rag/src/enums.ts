// Закрытые перечисления канона §4 — ЕДИНСТВЕННЫЙ источник в коде. CHECK миграции 001_init.sql
// сверяет с ними tests/enums.test.ts. Неизвестное значение читается как самое строгое
// (fail-closed-defaults): план → free, статус → deleted, задача → failed, причина → internal.
// Образец формы — N5 packages/shared/src/enums.ts; значения — канон N6.
export const ACCOUNT_PLAN = ['free', 'nobadge', 'studio'] as const;
export const ACCOUNT_STATUS = ['active', 'erasing', 'deleted'] as const;
export const BOT_STATUS = ['draft', 'active', 'deleted'] as const;
export const SOURCE_KIND = ['site', 'pdf'] as const;
export const SOURCE_STATUS = ['pending', 'indexing', 'ready', 'failed'] as const;
export const INDEX_JOB_STATUS = ['queued', 'running', 'done', 'failed'] as const;
export const INDEX_JOB_FAILURE_REASON = ['robots_disallowed', 'unreachable', 'blocked_address', 'no_text', 'not_pdf',
  'too_large', 'no_text_layer', 'quota_refused', 'embedding_unavailable', 'stalled', 'internal'] as const;
export const QUESTION_OUTCOME = ['answered', 'unknown', 'refused_limit', 'refused_origin'] as const;
export const QUOTA_SCOPE = ['visitor_answers', 'ip_answers', 'bot_day_answers', 'bot_month_answers', 'global_answers',
  'preview_session', 'ip_previews', 'global_previews', 'account_embed_tokens', 'global_embed_tokens'] as const;
export const GROWTH_EVENT_TYPE = ['badge_impression', 'badge_click', 'share_cta_shown', 'share_cta_click', 'widget_install',
  'first_answer', 'public_page_view', 'invite_sent', 'invite_accepted', 'interest'] as const;
export const ATTRIBUTION_SOURCE = ['code', 'invite', 'cookie'] as const;
export const ATTRIBUTION_STATUS = ['pending', 'converted', 'rejected'] as const;

export type AccountPlan = typeof ACCOUNT_PLAN[number];
export type AccountStatus = typeof ACCOUNT_STATUS[number];
export type BotStatus = typeof BOT_STATUS[number];
export type IndexJobStatus = typeof INDEX_JOB_STATUS[number];
export type QuotaScope = typeof QUOTA_SCOPE[number];

// Строгое сравнение без trim/toLowerCase (ADR-004): нормализация превращает опечатку в снятый бейдж.
function read<T extends readonly string[]>(values: T, value: unknown, strictest: T[number]): T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : strictest;
}
export const readAccountPlan = (value: unknown): AccountPlan => read(ACCOUNT_PLAN, value, 'free');
export const readAccountStatus = (value: unknown): AccountStatus => read(ACCOUNT_STATUS, value, 'deleted');
export const readBotStatus = (value: unknown): BotStatus => read(BOT_STATUS, value, 'deleted');
export const readIndexJobStatus = (value: unknown): IndexJobStatus => read(INDEX_JOB_STATUS, value, 'failed');
