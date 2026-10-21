# sharing — algorithms

Logical data/ports/API source: ../../Pseudocode.md (exact current hash af2c885a068d86f6b8a1f884f124bc6353c64975bc1e41e9dee240dbd1932b59). No second model list/schema.

### Algorithm: ExportAndShare
REQUIREMENT: `FR-sharing-1`
REQUIREMENT: `AC-sharing-1`
REQUIREMENT: `AC-sharing-2`
REQUIREMENT: `AC-sharing-3`
REALISES: SC-US-014-1, SC-US-014-2, SC-US-014-3
INPUT: owner/current design, chosen caption, generated before/after image, rights confirmation. OUTPUT: downloadable image or private link.
1. GuardRequest + owner/revision check, render deterministic before/after at same camera. Ordinary uploader forbids share_image. Export service reencodes bounded owner-provided renderer image, strips metadata and persists immutable designId/hash + normalized key/hash + watermark/schema version provenance; server applies watermark unless current verified paidExport and no billingHold. Never trust client entitlement or hidden watermark checkbox.
2. Show preview image/caption only; require explicit publish action + rights. Recheck Account→Project locks and current entitlement so refund cannot race publish; match export provenance to design, forbid raw reference/photo/GLB. Create random link token; save hash + TTL, return raw token once. No plan/GLB/reference/budget fields in public DTO and image metadata stripped.
3. Public resolver rate-limits, checks hash/expiry/revocation/project active on EVERY image/view request, returns no-store/noindex; no static/presigned bypass. Revoke sets timestamp. A later image change needs a new snapshot/link; old image remains frozen until revoke.
COMPLEXITY: O(image bytes) bounded, O(1) link lookup.


### Algorithm: RecordGrowth
REQUIREMENT: `FR-sharing-2`
REQUIREMENT: `AC-sharing-4`
REQUIREMENT: `AC-sharing-5`
REQUIREMENT: `AC-sharing-6`
REALISES: SC-US-015-1, SC-US-015-2, SC-US-015-3
INPUT: allowlisted event/IDs/key. OUTPUT: event/count.
1. Validate origin/ownership for private events; derive event kind server-side where possible. Public share events retain no raw token/IP/personal source data; pseudonymous IDs only.
2. Insert unique eventKey with bounded safe metadata. Read-only local operator query returns known count per allowlisted kind over explicit30-day window, or unknown/error on DB failure. Index kind/createdAt. Count exact observed events, label export/share creation vs external social action distinctly; DB unavailable returns unknown/error, never invented zero.
COMPLEXITY: O(1) insert; indexed bounded aggregation.


### Algorithm: RenderAccessibleJourney
REQUIREMENT: `NFR-sharing-1`
REQUIREMENT: `AC-sharing-7`
REQUIREMENT: `AC-sharing-8`
REQUIREMENT: `AC-sharing-9`
REALISES: SC-US-018-1, SC-US-022-1, SC-US-023-1
INPUT: server view model, viewport, capabilities. OUTPUT: accessible canonical UI.
1. Render labelled fields, progress, focus/errors and manual/demo/live/stale labels from authoritative state. Keep values across navigation/save/reload.
2. On WebGL failure display plan/measurements/reference/list fallback; don't claim 3D success. Disable unavailable action with reason and a useful manual path.
3. Measure 390px/desktop keyboard flows; expose scene/status changes via text, not colour alone.
COMPLEXITY: O(visible bounded items).


