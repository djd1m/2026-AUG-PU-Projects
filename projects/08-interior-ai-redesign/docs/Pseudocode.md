# RoomKind — Pseudocode

## Data Structures
Canonical logical entities; physical mapping lives in Architecture.

| Entity | Fields and values |
|---|---|
| account | id UUID, email canonical unique, password_hash, trial_granted boolean, billing_hold boolean, badge_free_entitlement boolean, created_at |
| session | token_hash unique, account_id, expires_at, revoked_at nullable |
| upload | id UUID, account_id, private_key, sha256, width, height, mime, created_at, deleted_at nullable |
| job | id UUID, account_id, upload_id, style enum warm/minimal/afrohemian/playful, idempotency_key, request_hash, status enum queued/running/succeeded/failed, fence integer, attempts integer, lease_until nullable, heartbeat_at nullable, output_key nullable, mode enum fixture/controlnet, quality enum unverified/accepted/rejected, reserved boolean, failure_reason nullable, created_at, finished_at nullable |
| credit_ledger | id UUID, account_id, delta integer, kind enum trial/purchase/reserve/release/refund, reference unique by kind+reference, created_at |
| payment_intent | id UUID, account_id, idempotency_key unique per account, package enum ROOM20, amount_minor90000, currency RUB, status enum created/pending/succeeded/canceled/review, provider_id unique nullable, partner_id nullable |
| provider_event | provider_id, event_type, unique(provider_id,event_type), payload_hash, processed_at |
| partner | id UUID, account_id nullable, code unique, active boolean |
| attribution | account_id unique, partner_id, source enum cookie/code, frozen_intent_id nullable, converted_payment_id unique nullable |
| share | token random unique, job_id unique, published boolean, description, composite_key, created_at, revoked_at nullable |
| event | id UUID, account_id nullable, type enum share_attempt/share_completed/export_delivered/share_visit/paid_conversion, reference, dedupe_key unique, created_at |
| attempt_budget | bucket enum platform/account, owner, day UTC, count; unique(bucket,owner,day) |

## Core Algorithms

### Algorithm: Account sessions
REQUIREMENT: `FR-auth-1`
Normalize email, validate password/body/rate budget. Hash password outside transaction. Insert account, unique trial ledger and session atomically; collision never grants again. Login performs dummy hash work on unknown account; create opaque session only for valid credential. Store HMAC token, set cookie; revoke on logout. Check origin for mutating requests.

### Algorithm: Receive and read image
REQUIREMENT: `FR-upload-1`
Authenticate; enforce streaming body byte cap; decode allowed image, enforce dimensions, strip metadata by re-encoding. Write temporary UUID file then atomic rename; insert upload row, cleanup orphan on failed DB write. On read/delete, select owner-scoped row before building filename; never concatenate user filename.

### Algorithm: Reserve and execute durable job
REQUIREMENT: `FR-redesign-1`
BEGIN lock account; lookup idempotency key, return matching job or conflict; check owner upload and available ledger balance; insert reserve ledger, job queued; COMMIT and return202 id. Worker lease SELECT SKIP LOCKED; claim attempt-budget buckets atomically, increment fence+attempts and set lease. Heartbeat guarded by fence. Generate outside transaction. Finish guarded by fence/status, attach output then set succeeded. Reclaim expired lease increments fence; after2 attempts terminal failed and unique release ledger. Late worker discards result. Client reload GET job; network error is unknown.

### Algorithm: Geometry evidence and release quality
REQUIREMENT: `FR-geometry-1`
Real worker loads pinned SD/depth model revisions, extracts depth from normalized input, runs ControlNet img2img and records provenance. Mode fixture never sets accepted. Run independent corpus measurement and retain outputs/anchors/reviewer result. Runtime new output starts unverified; operator reviews structural fidelity before accepted public example. Rejected output releases one reserve with unique ledger reference and marks failure. No evidence means unknown.

### Algorithm: Private gallery and comparison
REQUIREMENT: `FR-gallery-1`
Owner-filtered list jobs joined to upload; private API returns only owned media. Comparison slider changes visible clipping and accessible value; states use actual server response. Delete marks owned image deleted, disables shares in same transaction, cleanup removes files; unauthorised and absent both404.

### Algorithm: Provider-verified package purchase
REQUIREMENT: `FR-payment-1`
Create server-priced intent with immutable owner/package/amount/currency and attribution, unique client key. Network create after transaction uses same provider idempotency key; retry reuses intent. Webhook bounded parse accepts only payment id/type; provider GET verifies merchant/id/order/paid/status/amount/currency. BEGIN lock intent/account; claim unique event and unique purchase ledger; credit20 once, set entitlement and conversion; COMMIT. Canceled cannot overwrite succeeded. Verified refund updates intent review status and sets account billing_hold; pending operator resolution no new reservation or badge-free export. No guessed financial adjustment. Missing provider/runtime config => explicit unavailable. Fake adapter only test mode, never live fallback.

### Algorithm: Explicit share moment
REQUIREMENT: `FR-GROWTH-001`
Display CTA with result. User action requests composite, logs deduped attempt. On supported system share resolution log completion; on abort none. Download/export records export_delivered separately. Never claim destination publication from download. No background invitation.

### Algorithm: Attribution before purchase
REQUIREMENT: `FR-GROWTH-002`
Validate active partner code, reject self; store first valid cookie preference, show editable code before checkout. Explicit valid code overrides unconfirmed cookie. Freeze partner on intent; conversion only on provider-verified payment transaction. Replay must not create second conversion.

### Algorithm: Server composite entitlement
REQUIREMENT: `FR-GROWTH-003`
Read owner entitlement; compose before/after from private files, include AI redesign label always, RoomKind badge unless paid entitlement. Ignore client badge query. Serve authorized export; public token maps only composite, never original. Cache key includes entitlement and image hashes.

### Algorithm: Partner registry
REQUIREMENT: `FR-GROWTH-004`
Operator CLI inserts unique code with owner binding; public route cannot mint. Aggregate verified unique converted intents, exclude self and refunded/review entries. No commission writes.

### Algorithm: Publish and revoke useful example
REQUIREMENT: `FR-GROWTH-005`
Require explicit opt-in, owner, real mode, accepted quality and description≥40. Store random token and public composite with sanitized text; no email/location. Revoke transaction sets unpublished; route rechecks state every access, no-store. Gallery lists only published real accepted entries. Fixture shows labelled local preview only.

### Algorithm: Fail closed boundaries
REQUIREMENT: `NFR-security-1`
Startup checks DB URL/session secret/storage mode; production refuses fixture/test provider. Parse bounded bodies, fixed allowed style/model/provider config, UUID owner scopes and SQL parameters. Reject foreign Origin on writes. Errors omit credentials and raw user input; logs use opaque IDs.

### Algorithm: Attempt budget and measurement
REQUIREMENT: `NFR-performance-1`
Before each inference increment platform/day and account/day only if both below200/20; transaction rollback if either exhausted. Missing/invalid limits refuse startup. Every attempt, including retry/failure, counted. Store queue_ms and inference_ms; compute GPU-only warm p95 with hardware/model/source and n≥30. Unknown hardware/fixture samples cannot enter this metric.
