export const GUEST_CONSENT_VERSION = 'guest-publication-v1';
export const GUEST_CONSENT_TEXT = 'Гость согласен на публикацию этих клипов';
export interface GuestPackSummary {
  guest_pack_id: string; guest_name: string; url: string;
  sent_at: string | null; expires_at: string | null; revoked_at: string | null;
}
/** «Гостю» on a clip card: mark the clip in the guest form. Pure, so the mark itself is testable without a DOM.
 *  Never creates a pack (ADR-008: consent is given only in the form). Fail-closed: a clip the form does not offer
 *  (not available, unknown id) is not added; an already marked clip is not duplicated. */
export function addGuestPreselect(selected: readonly string[], clipId: string, selectable: readonly string[]): string[] {
  if (!selectable.includes(clipId) || selected.includes(clipId)) return [...selected];
  return [...selected, clipId];
}
