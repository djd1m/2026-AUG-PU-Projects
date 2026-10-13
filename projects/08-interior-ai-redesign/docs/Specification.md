# RoomKind — Specification

Source: PD-SCOPE-001, PD-CJM-001, PD-QUALITY-001, PD-MONEY-001, `decisions-owner.md`. Revised only against independent review findings1–6; design AC are not test passes. Stable AC IDs below map individually to named scenarios in `test-scenarios.md`.

2026-10-03 I7 documentation reconciliation, source `be450153910208e2c043de24f7efab540b052c82`. Accepted I1–I6 includes R1/R2/R3 closures; I7 full runtime is pending at author time on parent-owned source `8890e0b7`. Fresh whole-feature review and I8 actual52 main+2 disabled browser/hosted-row restore remain pending. Historical proof retains its tested revision; this update does not declare F07/full MVP ready. F07 original [specification](features/f07-replicate/01_specification.md) is preserved byte-for-byte; hosted specialization is recorded in [ADR-006](ADR.md#adr-006--hosted-depth-inference-and-conservative-remote-effects).

### FR-auth-1

- **AUTH-01:** Register/login accept canonical email and passwords of12–128 characters; shorter/longer values reject. Unique email and trial ledger grant exactly1 trial credit even under concurrent registration.
- **AUTH-02:** Opaque32-byte sessions expire after7d, are revocable at logout and use HttpOnly, SameSite=Lax, Secure outside localhost; invalid, unknown and expired credentials return a generic denial with dummy hashing for unknown accounts.
- **AUTH-03:** Auth JSON bodies≤16KiB; register≤5/IP/hour, login≤10/IP+email/15min and≤50/IP/15min, then429. Mutations require exact configured Origin; missing/foreign/null rejected except provider webhook, which independently verifies provider state.
- **AUTH-04:** All account resources use authenticated owner scopes; absent and wrong-owner IDs both return404 with no image bytes.

### FR-upload-1

- **UPLOAD-01:** Authenticated JPEG/PNG/WebP require matching magic bytes and successful decode, file≤10485760bytes and decoded pixels≤20000000. Preserve dimensions after orientation normalization; re-encode without EXIF into server UUID files outside public root.
- **UPLOAD-02:** No remote URL input or user path; validated UUID plus owner-scoped row determines all reads/deletes. Temp files are removed after failed DB write; orphan sweep deletes only unreferenced UUID files older than1h.

### FR-redesign-1

- **JOB-01:** POST upload_id/style/idempotency_key validates owner and style warm/minimal/afrohemian/playful, returns202+job_id before inference. Same owner/key/body returns original job without new effects, changed body409.
- **JOB-02:** Admission atomically reserves1 credit, job and first attempt ticket, checking billing_hold=false under account lock. Both UTC budget buckets are incremented together; exhaustion refuses429 without job/credit effects. Tickets conservatively consume daily capacity even if not executed; unused tickets are never refunded.
- **JOB-03:** Queue expires60s after admission; job hard deadline is admission+360s. Each started attempt has deadline=min(start+180s,job deadline), heartbeat10s, lease30s, max2 started attempts. Deadlines are enforced regardless of healthy heartbeats; no third attempt.
- **JOB-04:** Local fixture/controlnet retry claims a new ticket atomically before inference. Hosted known-ID reclaim uses only GET, the same consumed ticket/attempt and original deadline under a new fence. Durable submitting without ID or ambiguous submission never replays; no second hosted create after submission, even after provider failure/cancellation. Retry capacity exhaustion, queued expiry, deadline, deletion, quality rejection or final failure marks job failed and releases reserved credit exactly once; late fence cannot attach output or double release.
- **JOB-05:** Status fetch error shows unknown, never running; refresh by stable job_id resumes actual state without another reserve.

### FR-geometry-1

- **GEOM-01:** Explicit controlnet uses pinned local SD+ControlNet-depth; explicit replicate uses the pinned hosted depth API with depth derived from sanitized input. Both bind immutable input/output/depth/config hashes, seed, mode and worker source. Local evidence retains model revisions/hardware/warm/inference; hosted v1 binds model/version/contract, submission/prediction/request, original/transmitted hashes and numeric transform, with provider hardware/warm/inference/billing explicitly null. DB queue time and measured local elapsed time have separate sources. No fabricated local manifest, GPU fallback or model upgrade.
- **GEOM-02:** Acceptance corpus≥12 rooms×3 styles requires zero added/removed openings and anchors displaced≤2% image diagonal; retain licensed inputs, paired outputs, anchors, source/config/model and independent reviewer evidence. Local hardware is recorded; hosted unavailable hardware is explicitly null, which cannot establish PERF-03 warm performance. Unmeasured remains unknown.
- **GEOM-03:** New results are unverified. Operator-only quality review records actor/time/decision/evidence digest/output hash and corpus report digest; acceptance requires real mode, complete immutable generation evidence and matching bytes. Ordinary account, fixture, missing evidence or changed output cannot be accepted/published. Rejection revokes shares and releases credit once.

### FR-gallery-1

- **GALLERY-01:** Owner-only paginated gallery max50 reopens comparison and queued/running/succeeded/failed/unknown status with retry/resume instructions. Private gallery/media have noindex and private/no-store caching.
- **GALLERY-02:** Comparison has separate before/after alt text, keyboard-operated labelled slider, visible focus, body≥16px, aria-live status, reduced-motion support and no horizontal overflow at390px.
- **GALLERY-03:** Delete transaction tombstones upload/job, fences active work, revokes shares immediately; file cleanup completes within1h when maintenance worker is available and retries failed deletes. No tombstoned media is served meanwhile.

### FR-payment-1

- **PAY-01:** ROOM20 is server-priced20 credits/90000minor RUB. Hosted checkout intent returns202 before provider work; same owner/key/body reuses intent and provider idempotency key, changed body409. Return URL never grants credit; missing keys explicitly refuses live checkout.
- **PAY-02:** Before effects authenticated provider GET must match merchant, provider payment ID, immutable intent/account metadata,90000RUB, paid=true and succeeded status. Each mismatch rejects; network/parse/5s timeout leaves retryable503 and no processed-event claim.
- **PAY-03:** Account lock then intent lock serializes settlement. Unique provider payment, event and purchase ledger grant once for concurrent duplicates; canceled cannot overwrite succeeded; succeeded cannot overwrite review. Repeated valid purchases grant packages but first-conversion uniqueness remains account-scoped.
- **PAY-04:** Refund notification uses authenticated GET refund ID plus bound payment GET: exact refund/payment IDs, succeeded refund, positive RUB amount≤original payment, merchant/order/account match. Any verified partial/full refund sets permanent billing_hold and intent review, disables effective badge-free entitlement and excludes that conversion. No automated money movement or guessed credit reversal; MVP has no hold-clear operation.
- **PAY-05:** Reservation, retry/start and every badge-free delivery, including cached/public composite, recheck hold under account serialization. Operations linearized after hold cannot start/spend or deliver badge-free; queued jobs release once. Already-started inference may finish private, already-authorized bounded response may finish. Later success/new package cannot clear hold or grant new effective entitlement/conversion; already reviewed intent never gains new purchase ledger.

### FR-GROWTH-001

- **SHARE-01:** One CTA beside first available result obtains branded before/after artifact in≤2 user actions; explicit user action only, no automatic invitations/messages.
- **SHARE-02:** Deduped share_attempt differs from native API resolved share_completed and download export_delivered. Abort/failure records no completion; unavailable native API offers download, which never claims external publication.
- **SHARE-03:** Composite export requires owner or an active permitted public token; cross-owner ID cannot emit private bytes.

### FR-GROWTH-002

- **ATTR-01:** Partner cookie is first-party,30d, stored/read for attribution only after separate unchecked tracking opt-in. Denial/expiry clears stored attribution; essential session cookie unaffected. Manual code at checkout works without tracking-cookie consent.
- **ATTR-02:** Validate active owner-bound code server-side; self/tampered/inactive codes reject. First valid unconfirmed cookie may be replaced by explicit manual code before intent creation; intent snapshots attribution immutably.
- **ATTR-03:** Under account lock the first committed verified successful payment wins account.first_paid_payment_id even with no partner. Insert at most1 conversion using winning intent snapshot; all later purchases cannot backfill/reassign it. Refunded winning payment invalidates conversion permanently, never promotes another purchase.

### FR-GROWTH-003

- **BADGE-01:** Server composites always embed AI redesign label; RoomKind pixel badge omitted only when confirmed paid entitlement AND billing_hold=false at delivery. Ignore client removeBadge flag; effective entitlement part of cache key and rechecked on cached/private/public access.
- **BADGE-02:** Public token exposes only branded comparison composite and escaped metadata, never raw upload/result/original file paths or endpoints; private files remain owner-only.

### FR-GROWTH-004

- **PARTNER-01:** Only operator CLI may create unique opaque partner code bound to specified account; public signup cannot mint or alter owner binding. Duplicate code409; self-referral excluded.
- **PARTNER-02:** Aggregate distinct active first-conversion records and their server-verified amount, excluding held/refunded/review payments and self. No payouts, commission or reward balance.

### FR-GROWTH-005

- **PUBLIC-01:** Per-result publication requires unchecked explicit opt-in, owner, accepted real non-fixture bound output, enumerated style, source context1–160chars and useful description40–2000chars. Consent on one job grants none to another.
- **PUBLIC-02:** Random permanent token reveals no owner email/location/EXIF; HTML escaped even on otherwise valid accepted result. Public page/gallery includes useful context, style, comparison and AI label, never private metadata.
- **PUBLIC-03:** Revoke atomically disables page/composite access and gallery inclusion; every public read rechecks publication/quality/hold and uses no-store. Deleted/rejected output is immediately unavailable.

### NFR-security-1

- **SEC-01:** Startup fails before serving on missing/invalid DB/session secret/storage/runtime/provider-mode configuration; production refuses fixture provider/worker, weak/default credentials or public database mapping. No browser secret/env values.
- **SEC-02:** All writes enforce owner/origin/SQL parameterization/UUID boundaries; public/JSON request bodies≤16KiB except image upload10MiB; public API≤120/IP/min then429. Logs redact credentials/raw bodies; provider response≤64KiB and5s except the explicit Replicate SEC-02 specialization: response≤512KiB (bounded data-URI echo), request≤384KiB, sanitized JPEG≤256KiB, each call≤5s and original remaining deadline. Hosted depth/output import is HTTPS allowlisted/DNS-pinned,≤10MiB/20MP/single frame per artifact; no redirects or forwarded provider auth. Node/worker containers≤2CPU and DB connections≤10 per process.
- **SEC-03:** Mandatory negative controls must fail when owner guard, payment idempotency, budget or fixture-quality exclusion is removed; restore source after each controlled mutation.

### NFR-performance-1

- **PERF-01:** Conservative admitted-attempt tickets count against platform200/account20 per UTC day; both counters change atomically. Every started attempt including retry/failure has a unique ticket; tickets never refund. First ticket reserved with job admission; retry requires new ticket. Limits may be lowered, never exceed200/20; missing/invalid config refuses.
- **PERF-02:** At UTC rollover an unstarted old-day ticket is replaced with a current-day ticket before start; old reservation stays counted conservatively. Current-day exhaustion fails job/releases credit. Queued/running deadlines are independent of budgets and heartbeat.
- **PERF-03:** Warm GPU inference p95≤25s on≥30 actual jobs with queue time separate; record hardware/source/model/config and warm status. Fixture, cold, unknown-hardware or incomplete-provenance samples cannot establish acceptance.

## Source look trace
FR-LOOK-001 accepted: large room canvas plus clear hierarchy. FR-LOOK-002 accepted: desktop two-column workspace and mobile single-column CTA. FR-LOOK-003 accepted: gallery/package navigation and text≥16px. Internal source path unmeasured due auth; CJM A is independent workflow, not exact source reproduction.

## Acceptance and evidence
Every requirement has an Algorithm block in Pseudocode and each AC has its own named mapping. Required real Postgres races, negative cases, browser E2E and guard mutations stay mandatory. GPU corpus/performance, deployment and paid effects retain separate status; fixtures cannot satisfy real quality/performance criteria. Hosted admission requires exact private server configuration and an existing authorized spend envelope; none is automatically provisioned. Reserved spend and daily capacity never decrement on ambiguity/failure/cancel. Real provider license/privacy/safety/corpus/billing ceilings remain pilot-pending with authorized spend0. Proposed36 creates/12USD is neither approval nor a provider billing guarantee.
