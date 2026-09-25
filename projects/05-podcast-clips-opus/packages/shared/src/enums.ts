export const ACCOUNT_PLAN = ['free', 'paid'] as const;
export type AccountPlan = typeof ACCOUNT_PLAN[number];
export const ACCOUNT_STATUS = ['active', 'erasing', 'deleted'] as const;
export type AccountStatus = typeof ACCOUNT_STATUS[number];
export const VIDEO_SOURCE = ['upload', 'url'] as const;
export type VideoSource = typeof VIDEO_SOURCE[number];
export const VIDEO_STATUS = ['uploading', 'queued', 'transcribing', 'selecting', 'rendering', 'done', 'failed'] as const;
export type VideoStatus = typeof VIDEO_STATUS[number];
// В Pseudocode перечислено 17 значений, хотя подпись таблицы утверждает «16».
export const VIDEO_FAILURE_REASON = [
  'too_large', 'not_media', 'no_audio', 'too_short', 'too_long', 'probe_timeout',
  'stt_failed', 'no_timestamps', 'no_fragments', 'schema_violation', 'refused_user_uploads',
  'refused_user_minutes', 'refused_global_minutes', 'refused_user_llm', 'refused_global_llm',
  'stalled', 'render_failed',
] as const;
export type VideoFailureReason = typeof VIDEO_FAILURE_REASON[number];
export const CLIP_STATUS = ['queued', 'rendering', 'done', 'failed'] as const;
export type ClipStatus = typeof CLIP_STATUS[number];
export const CLIP_FAILURE_REASON = ['no_disk', 'ffmpeg_failed', 'ffmpeg_timeout', 'stale_attempt_result', 'watermark_geometry'] as const;
export type ClipFailureReason = typeof CLIP_FAILURE_REASON[number];
export const JOB_STAGE = ['stt', 'select', 'render'] as const;
export type JobStage = typeof JOB_STAGE[number];
export const JOB_STATUS = ['running', 'succeeded', 'failed', 'deferred'] as const;
export type JobStatus = typeof JOB_STATUS[number];
export const GROWTH_EVENT_TYPE = ['download', 'link_copy', 'link_view', 'guest_sent', 'guest_opened', 'guest_registered', 'code_applied', 'interest'] as const;
export type GrowthEventType = typeof GROWTH_EVENT_TYPE[number];
export const ATTRIBUTION_SOURCE = ['explicit', 'guest_link', 'cookie'] as const;
export type AttributionSource = typeof ATTRIBUTION_SOURCE[number];
export const ATTRIBUTION_STATUS = ['pending', 'activated', 'rejected', 'partner_deleted'] as const;
export type AttributionStatus = typeof ATTRIBUTION_STATUS[number];
export const PARTNER_CODE_STATUS = ['active', 'blocked'] as const;
export type PartnerCodeStatus = typeof PARTNER_CODE_STATUS[number];
export const QUOTA_SCOPE = ['user_minutes', 'user_uploads', 'user_upload_refunds', 'user_llm', 'global_minutes', 'global_llm', 'user_rerenders'] as const;
export type QuotaScope = typeof QUOTA_SCOPE[number];
export const SOURCE_SCREEN = ['clip_card', 'guest_page', 'partner_dashboard'] as const;
export type SourceScreen = typeof SOURCE_SCREEN[number];
// Призыв к действию в конце клипа (ADR-017, FR-RESULT-006). Надписи — только из кода, не свободный текст.
export const CTA_KIND = ['none', 'watch_full', 'subscribe', 'open_link'] as const;
export type CtaKind = typeof CTA_KIND[number];

export function isEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
function closed<T extends string>(values: readonly T[], fallback: T, value: unknown): T {
  return isEnumValue(values, value) ? value : fallback;
}
export const readPlan = (v: unknown): AccountPlan => closed(ACCOUNT_PLAN, 'free', v);
export const readAccountStatus = (v: unknown): AccountStatus => closed(ACCOUNT_STATUS, 'deleted', v);
export const readVideoStatus = (v: unknown): VideoStatus => closed(VIDEO_STATUS, 'failed', v);
export const readClipStatus = (v: unknown): ClipStatus => closed(CLIP_STATUS, 'failed', v);
export const readJobStatus = (v: unknown): JobStatus => closed(JOB_STATUS, 'failed', v);
export const readAttributionStatus = (v: unknown): AttributionStatus => closed(ATTRIBUTION_STATUS, 'rejected', v);
export const readPartnerCodeStatus = (v: unknown): PartnerCodeStatus => closed(PARTNER_CODE_STATUS, 'blocked', v);
// Неизвестный вид призыва из хранилища читается как самый строгий — «без призыва».
export const readCtaKind = (v: unknown): CtaKind => closed(CTA_KIND, 'none', v);
// Для источников/событий нет безопасного разрешающего значения: null означает отказ действия.
export function readEnum<T extends string>(values: readonly T[], value: unknown): T | null {
  return isEnumValue(values, value) ? value : null;
}
export const SQL_ENUMS = {
  'account.plan': ACCOUNT_PLAN, 'account.status': ACCOUNT_STATUS,
  'video.source': VIDEO_SOURCE, 'video.status': VIDEO_STATUS, 'video.failure_reason': VIDEO_FAILURE_REASON,
  'clip.status': CLIP_STATUS, 'clip.failure_reason': CLIP_FAILURE_REASON,
  'job_attempt.stage': JOB_STAGE, 'job_attempt.status': JOB_STATUS,
  'growth_event.type': GROWTH_EVENT_TYPE, 'growth_event.source_screen': SOURCE_SCREEN,
  'attribution.source': ATTRIBUTION_SOURCE, 'attribution.replaced_source': ATTRIBUTION_SOURCE,
  'attribution.status': ATTRIBUTION_STATUS, 'partner_code.status': PARTNER_CODE_STATUS,
  'quota_counter.scope': QUOTA_SCOPE, 'pro_interest.source_screen': SOURCE_SCREEN,
  'video.cta_kind': CTA_KIND,
} as const;
