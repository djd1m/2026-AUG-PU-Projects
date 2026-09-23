export const GUEST_CONSENT_VERSION = 'guest-publication-v1';
export const GUEST_CONSENT_TEXT = 'Гость согласен на публикацию этих клипов';
export interface GuestPackSummary {
  guest_pack_id: string; guest_name: string; url: string;
  sent_at: string | null; expires_at: string | null; revoked_at: string | null;
}
