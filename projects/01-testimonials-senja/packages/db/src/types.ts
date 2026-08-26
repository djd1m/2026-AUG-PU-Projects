// packages/db/src/types.ts
//
// Типы строк таблиц — тонкий слой поверх SQL-схемы из packages/db/migrations/. Источник полей и
// их семантики — комментарии в самих миграциях (со ссылками на docs/Architecture.md,
// docs/Pseudocode.md). Здесь НЕТ бизнес-логики — только форма данных.

export type ProjectTier = 'free' | 'paid';

export type TestimonialStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export type TranscriptStatus = 'pending' | 'completed' | 'failed';
export type TranscriptSource = 'machine'; // Architecture §10: enum(machine) — расширяемо в будущем

export type CheckoutSessionStatus = 'pending' | 'completed' | 'expired';
export type PartnerCodeStatus = 'active' | 'revoked';
export type AttributionSource = 'cookie' | 'promo_code';
// Architecture §3 перечисляет только pending/converted/blocked; Pseudocode §7.2/§8 требуют
// expired/rejected — см. комментарий в migrations/004_growth.sql.
export type AttributionStatus = 'pending' | 'converted' | 'blocked' | 'expired' | 'rejected';

export interface Account {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface Session {
  id: string;
  account_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface Project {
  id: string;
  account_id: string;
  slug: string;
  branding: Record<string, unknown>;
  tier: ProjectTier;
  noindex: boolean;
  /** См. migrations/003_core.sql — расхождение Architecture/Pseudocode, [GAP] по правилу выставления. */
  deactivated: boolean;
  created_at: Date;
}

export interface Testimonial {
  id: string;
  project_id: string;
  status: TestimonialStatus;
  author_name: string;
  author_role: string | null;
  text: string;
  photo_url: string | null;
  video_object_key: string | null;
  transcript: string | null;
  transcript_status: TranscriptStatus;
  transcript_source: TranscriptSource;
  moderated_at: Date | null;
  created_at: Date;
}

export interface WidgetInstall {
  id: string;
  project_id: string;
  domain: string;
  first_seen_at: Date;
  last_seen_at: Date;
}

export interface AnalyticsEvent {
  id: string; // bigserial -> node-pg возвращает как string по умолчанию для int8
  project_id: string | null;
  account_id: string | null;
  event_type: string;
  domain: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface PartnerCode {
  id: string;
  code: string;
  partner_name: string;
  status: PartnerCodeStatus;
  /** [GAP: ставка по умолчанию не зафиксирована в документах] см. migrations/004_growth.sql */
  commission_rate: string | null; // numeric -> pg возвращает как строку
  created_at: Date;
}

export interface ReferralAttribution {
  id: string;
  account_id: string | null;
  partner_code_id: string;
  source: AttributionSource;
  status: AttributionStatus;
  reason: string | null;
  created_at: Date;
}

export interface Commission {
  id: string;
  referral_attribution_id: string;
  payment_event_id: string;
  amount: string; // numeric -> строка
  created_at: Date;
}

export interface CheckoutSession {
  id: string;
  project_id: string;
  provider_session_id: string;
  status: CheckoutSessionStatus;
  created_at: Date;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  event_id: string;
  payload: Record<string, unknown> | null;
  processed_at: Date;
}

export interface RateLimitEvent {
  id: string; // bigserial
  scope: string;
  key: string;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  project_id: string | null;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  action: string;
  reason: string | null;
  created_at: Date;
}
