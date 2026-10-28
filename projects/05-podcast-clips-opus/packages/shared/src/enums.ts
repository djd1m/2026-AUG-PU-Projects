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
  'refused_credit_balance', 'refused_user_minutes', 'refused_global_minutes', 'refused_user_llm', 'refused_global_llm',
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
// Оплата ЮKassa (фича 30, ADR-019, миграция 021).
export const PLAN_SOURCE = ['none', 'payment', 'operator'] as const;
export type PlanSource = typeof PLAN_SOURCE[number];
export const PAYMENT_INTENT_STATUS = ['created', 'succeeded', 'canceled'] as const;
export const PAYMENT_PROVIDER = ['yookassa', 'fake'] as const;
export type PaymentProviderName = typeof PAYMENT_PROVIDER[number];
export const PAYMENT_STATUS = ['succeeded', 'refunded'] as const;
export const PAYMENT_REVIEW_REASON = ['amount_mismatch', 'refund', 'unknown_intent', 'account_erasing','intent_already_fulfilled','payment_identity_mismatch'] as const;
export const OPERATOR_ACTION = ['set_plan','credit_opt_in','set_owner_unlimited'] as const;

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
export const BILLING_POLICY = ['legacy_daily_v1','credits_v1'] as const;
export const CREDIT_INTENT_SKU = ['legacy_pro990_v1','start_v1','pro_v1','addon_v1'] as const;
export const CREDIT_GRANT_SOURCE = ['signup','migration_trial','payment','recovery'] as const;
export const CREDIT_BASE_SKU = ['start_v1','pro_v1'] as const;
export const CREDIT_CHARGE_STATE = ['reserved','settled','released'] as const;
export const SUPPORT_EMAIL_PURPOSE = ['verify','reset'] as const;
export type SupportEmailPurpose = typeof SUPPORT_EMAIL_PURPOSE[number];
export const SUPPORT_EMAIL_DELIVERY_STATE = ['pending','accepted','failed','unknown'] as const;
export type SupportEmailDeliveryState = typeof SUPPORT_EMAIL_DELIVERY_STATE[number];
export const SUPPORT_AUDIT_ACTION = ['grant','revoke','list','search','card'] as const;
export type SupportAuditAction = typeof SUPPORT_AUDIT_ACTION[number];
export const SQL_ENUMS = {
  'support_email_token.purpose': SUPPORT_EMAIL_PURPOSE,
  'support_email_token.delivery_state': SUPPORT_EMAIL_DELIVERY_STATE,
  'support_mail_admission.purpose': SUPPORT_EMAIL_PURPOSE,
  'support_audit.action': SUPPORT_AUDIT_ACTION,
  'account.billing_policy': BILLING_POLICY,'video.billing_policy':BILLING_POLICY,
  'payment_intent.sku': CREDIT_INTENT_SKU,'credit_grant.source':CREDIT_GRANT_SOURCE,
  'credit_grant.base_sku':CREDIT_BASE_SKU,'video_credit_charge.state':CREDIT_CHARGE_STATE,
  'account.plan': ACCOUNT_PLAN, 'account.status': ACCOUNT_STATUS,
  'video.source': VIDEO_SOURCE, 'video.status': VIDEO_STATUS, 'video.failure_reason': VIDEO_FAILURE_REASON,
  'clip.status': CLIP_STATUS, 'clip.failure_reason': CLIP_FAILURE_REASON,
  'job_attempt.stage': JOB_STAGE, 'job_attempt.status': JOB_STATUS,
  'growth_event.type': GROWTH_EVENT_TYPE, 'growth_event.source_screen': SOURCE_SCREEN,
  'attribution.source': ATTRIBUTION_SOURCE, 'attribution.replaced_source': ATTRIBUTION_SOURCE,
  'attribution.status': ATTRIBUTION_STATUS, 'partner_code.status': PARTNER_CODE_STATUS,
  'quota_counter.scope': QUOTA_SCOPE, 'pro_interest.source_screen': SOURCE_SCREEN,
  'video.cta_kind': CTA_KIND,
  'account.plan_source': PLAN_SOURCE, 'payment_intent.status': PAYMENT_INTENT_STATUS,
  'payment_event.provider': PAYMENT_PROVIDER, 'payment.provider': PAYMENT_PROVIDER, 'payment.status': PAYMENT_STATUS,
  'payment.review_reason': PAYMENT_REVIEW_REASON, 'operator_action.action': OPERATOR_ACTION,
  'operator_action.plan_before': ACCOUNT_PLAN, 'operator_action.plan_after': ACCOUNT_PLAN,
} as const;
