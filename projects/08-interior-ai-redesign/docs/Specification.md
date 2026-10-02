# RoomKind — Specification

Source: PD-SCOPE-001, PD-CJM-001, PD-QUALITY-001, PD-MONEY-001, `decisions-owner.md`. Requirements describe the accepted implementation target; they are not claims of passing tests.

### FR-auth-1
Email/password registration and login, opaque revocable cookie session (HttpOnly, SameSite=Lax, Secure outside localhost), CSRF origin check on mutations, generic failed-login response. One trial credit per account transaction. Password ≥12 chars, body size bounded, registration/login rate-limited; concurrent requests cannot grant twice.

### FR-upload-1
Authenticated JPEG/PNG/WebP upload ≤10MB and ≤20MP, magic-byte/decode validation, EXIF removal, opaque server filename. No remote URL input. Private read requires owner; wrong owner returns 404. Files are stored outside public web root; SQL parameters and path UUID validation protect boundaries.

### FR-redesign-1
Create with upload_id, enumerated style and idempotency key returns 202 + job_id before inference. Same key/body returns same job; changed body conflicts. Trial/paid credit reserved atomically with job and daily-attempt capacity. Postgres queue, lease, heartbeat, fencing, ≤2 automatic attempts, maximum 180 seconds per attempt. Silent status fetch failure displays unknown, never running. Failed job releases its credit once.

### FR-geometry-1
Worker uses actual SD + ControlNet-depth, saves input/model/config hashes, seed and timings. PD-QUALITY-001: acceptance corpus≥12 rooms×3 styles, no added/removed openings and anchor displacement≤2% image diagonal. Output flagged defective or not yet quality-verified cannot become a public accepted example. Failure to verify real GPU quality leaves this AC unknown, never pass. Fixture mode always labels the result and cannot grant production quality verification.

### FR-gallery-1
User can list only their jobs/images, reopen comparison slider, see queued/running/succeeded/failed/unknown states and clear error recovery. Separate before/after alt text, keyboard slider, minimum 16px body, mobile390 no horizontal overflow. Private galleries never indexed. Delete revokes sharing and removes associated private media through bounded cleanup.

### FR-payment-1
Package ROOM20: 20 credits / 90000 minor RUB, server authoritative. Hosted YooKassa checkout, 202 intent and idempotent retry. Provider GET verifies account, amount, RUB, order metadata and succeeded/paid status before transaction. Unique provider payment and credit ledger guard replay/concurrent duplicate. Return URL never grants credit. Config without provider keys refuses live checkout explicitly. Operator monetary refund workflow is outside MVP; refunded provider state freezes further spending and entitlement pending operator review; no automated monetary refund or guessed partial credit reversal.

### FR-GROWTH-001
Single share CTA directly next to first available result creates branded before/after composite. Explicit action opens system share or downloads artifact; neither path sends automatic messages. Track share_attempt separately from confirmed browser share completion or export delivery; cancelled share is not completed. Export delivery is labelled export, not proven external publication. Target≤2 actions from result to artifact.

### FR-GROWTH-002
Partner attribution survives onboarding until first verified paid conversion. First-party cookie plus independently accepted personal code at checkout; cookie failure still allows code. First valid attribution frozen at payment intent; manual code may replace unconfirmed cookie before that. Cookie lifetime30d, code validation server-side. Self-referral, owner-tampered code and duplicate conversions rejected; no partner payout.

### FR-GROWTH-003
Free export embeds visible RoomKind attribution in pixels. Removing badge requires confirmed paid-package entitlement server-side; client flag and direct media URL cannot bypass it. AI redesign label remains on share regardless of paid badge. Original private media never exposed through share token.

### FR-GROWTH-004
Operator creates unique per-partner opaque code and owner binding; public signup cannot mint privileged codes. Store distinct conversion counts and amount from verified payments. Self-referral, repeated payment delivery and reversed payment do not inflate conversions. No reward balance or commission engine.

### FR-GROWTH-005
Public gallery only after explicit per-result unchecked opt-in plus style, source context and useful owner description≥40 chars. Default private, permanent random token, no owner email/location/EXIF. Revocation immediately disables public route and composite access with no public cache; malformed HTML escaped. Only verified non-fixture results become indexed public entries; demo previews cannot claim SEO publication.

### NFR-security-1
Fail closed on missing signing secret/database/storage/runtime configuration; no secret browser bundle/log, public DB port, default password, external upload fetch, or permissive cross-origin write. Public routes have size/rate limits. Resource limits and DB parameterization apply to all paths. Test two-account isolation and replay mutations.

### NFR-performance-1
Warm generation target p95≤25s on≥30 actual GPU jobs, queue delay recorded separately. Measurements record source/model revision and hardware. Host has no confirmed CUDA, so target unverified. Daily inference-attempt ceiling200, account ceiling20; every attempt consumes capacity even if credit is refunded. Ceiling exhaustion refuses instead of silently degrading.

## Source look trace
FR-LOOK-001 accepted: large room canvas plus clear hierarchy. FR-LOOK-002 accepted: desktop two-column workspace and mobile single-column CTA. FR-LOOK-003 accepted: gallery/package navigation and text≥16px. Internal source path unmeasured due auth; our CJM A is a deliberate independent workflow, not a claim of exact source reproduction.

## Acceptance and evidence
Each requirement maps to an Algorithm block in `Pseudocode.md`; growth acceptance scenarios are in `test-scenarios.md`. Required correctness tests include real Postgres concurrency, negative auth/upload/provider cases, worker fencing/crash and browser E2E. GPU corpus/performance, deployment and paid external effects retain explicit status; no fixture can satisfy the real GPU criteria.
