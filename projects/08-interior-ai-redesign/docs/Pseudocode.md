# RoomKind — Pseudocode

## Data Structures
Canonical logical entities; physical mapping lives in Architecture. All timestamps UTC, hashes SHA256. Provider IDs are validated opaque values, never URLs. Local completed provenance remains complete/nonnullable. Hosted completed evidence is a separate closed v1 contract: provider hardware/warm/inference/billing and their sources are explicitly null, never guessed.

2026-10-03 I7 documentation reconciliation, source `be450153910208e2c043de24f7efab540b052c82`. Accepted I1–I6 includes R1/R2/R3 closures; I7 full runtime is pending at author time on parent-owned source `8890e0b7`. Fresh whole-feature review and I8 actual52 main+2 disabled browser/hosted-row restore remain pending. Historical proof retains its tested revision; this update does not declare F07/full MVP ready.

| Entity | Fields and values |
|---|---|
| account | id UUID, email canonical unique, password_hash, trial_granted boolean, billing_hold boolean default false, badge_free_entitlement boolean, first_paid_payment_id nullable immutable, created_at |
| session | token_hash unique, account_id, expires_at, revoked_at nullable |
| upload | id UUID, account_id, private_key, sha256, width, height, mime, created_at, deleted_at nullable |
| job | id UUID, account_id, upload_id, style enum warm/minimal/afrohemian/playful, idempotency_key unique per account, request_hash, status queued/running/succeeded/failed, fence integer, attempts integer≤2, first_ticket_id, lease_until/heartbeat_at nullable, queue_deadline, hard_deadline, attempt_deadline nullable, output_key nullable, mode fixture/controlnet/replicate, quality unverified/accepted/rejected, reserved boolean, failure_reason nullable, created_at, finished_at/deleted_at nullable |
| generation_evidence | job_id unique, input_sha/output_sha/depth_sha/config_sha, model_revisions JSON (SD/ControlNet/depth), seed, mode, worker_source_revision, hardware, queue_ms, inference_ms, warm boolean, created_at; immutable after successful attach; hosted canonical fields/nullability per [I5a](features/f07-replicate/i5a-implementation.md) |
| provider_submission | unique job/prediction, immutable model/version/contract/request/source/transmitted/transform, original attempt/ticket/submission_fence/deadline, spend reservation/acceptance digests; state preflight/submitting/known/ambiguous/terminal; monotonic status, identity_conflict_at; cleanup_state none/needed/claimed/done/unresolved, cleanup_fence/lease, cancel_requested_at/cancel_confirmed_at |
| provider_spend_budget | immutable scoped pins/window/ceiling/per-create ceiling/authorization/privacy/license/safety/billing digests; reserved_microusd never decreases, revoked_at irreversible; no default envelope |
| quality_review | id UUID, job_id, actor_id, reviewed_at, decision accepted/rejected, output_sha, generation_evidence_sha, corpus_report_sha, rationale; append-only, never ordinary user writable |
| credit_ledger | id UUID, account_id, delta integer, kind trial/purchase/reserve/release, reference unique(kind,reference), created_at; no automatic financial refund entry |
| payment_intent | id UUID, account_id, idempotency_key unique per account, request_hash, package ROOM20, amount_minor90000, currency RUB, status created/pending/succeeded/canceled/review, provider_id unique nullable, partner_id nullable immutable snapshot, created_at |
| provider_event | object_kind payment/refund, provider_object_id, event_type, unique(object_kind,provider_object_id,event_type), verified_state_sha, processed_at |
| verified_refund | provider_refund_id unique, payment_intent_id, provider_payment_id, amount_minor, currency RUB, verified_at |
| partner | id UUID, account_id nullable, code unique opaque, active boolean |
| attribution | account_id unique, partner_id, source cookie/code, cookie_consent_at nullable, expires_at nullable; preference editable before each new intent, cannot change an existing intent snapshot |
| first_conversion | account_id unique, payment_intent_id unique, partner_id, amount_minor, currency, valid boolean; absent if first paid payment has no eligible partner; never reassigned |
| share | token random unique, job_id unique, published boolean, description, source_context, composite_key, output_sha, created_at, revoked_at nullable |
| event | id UUID, account_id nullable, type share_attempt/share_completed/export_delivered/share_visit/paid_conversion, reference, dedupe_key unique, created_at |
| attempt_budget | bucket platform/account, owner, day UTC, count; unique(bucket,owner,day) |
| attempt_ticket | id UUID, job_id, attempt_number1/2, day UTC, consumed_at nullable, superseded boolean; at most one current ticket per(job,attempt), historical tickets retained |

## Transaction and linearization rules
All operations that need budget locks use stable platform/day → account/day → account → intent (if any) → job order. Other operations start at account and never later acquire budget locks. Resolve owner IDs with nonlocking reads then revalidate under locks. A worker may choose a candidate outside its claim transaction, but must lock/recheck account then job (`FOR UPDATE SKIP LOCKED`) in this order. No job-first then account path. Network/hash/image work stays outside transactions.

Account lock linearizes refund hold, reservation, start/retry, settlement and final export authorization. Export composition happens before a final short authorization transaction; delivery authorization records effective entitlement/version immediately before bounded≤15s streaming. A stream already authorized before a concurrent hold may finish; no delivery authorization after hold permits a badge-free image. Public routes may simply return404 on hold. Every cached read repeats this authorization. No public cache/CDN or static private-volume mount exists.

## Core Algorithms

### Algorithm: Account sessions
REQUIREMENT: `FR-auth-1`
Normalize email; validate12–128char password and16KiB JSON; enforce registration5/IP/hour, login10/IP+email/15min and50/IP/15min. Hash outside transaction. Insert account+unique trial ledger+session atomically; duplicate email never grants another credit. Login dummy-hashes unknown account, returns generic failure. HMAC32-byte token stored, HttpOnly/SameSiteLax/Secure nonlocal cookie, expiry7d. Logout revokes. All user writes require configured exact Origin; missing/null/foreign denied. Owner-scoped resource SQL returns404 for other owner and absent alike.

### Algorithm: Receive and read image
REQUIREMENT: `FR-upload-1`
Authenticate; stream≤10485760bytes; match JPEG/PNG/WebP magic and decode≤20000000pixels. Apply EXIF orientation, re-encode without metadata; atomic UUID rename outside public root. Insert owner upload; on DB failure remove own temporary/final file. Read/delete uses UUID plus owner row, never client filename/remote URL. Sweep only unreferenced UUID files older than1h; never remove referenced live files.

### Algorithm: Reserve and execute durable job
REQUIREMENT: `FR-redesign-1`
Validate input and hash request. BEGIN budget locks then account; lookup existing owner/key first for idempotent return or409 without extra effects; verify upload owner/not-deleted, balance≥1 and billing_hold=false. Atomically claim platform/account admission ticket, insert job queued with queue_deadline=now+60s/hard_deadline=now+360s and reserve ledger−1. Any exhausted bucket rolls back everything and429; COMMIT returns202 before inference. Tickets count conservatively even if cancelled and never refund.

Worker selects candidate; under ordered locks rechecks nondeleted, no hold, status/deadlines and ticket. Expired queue/hard deadline => fail/fence/release once. New UTC day requires replacement current-day ticket before first start; original stays counted. If replacement unavailable => fail/release. First start consumes admission ticket (no extra same-day increment), increments attempts/fence, sets attempt_deadline=min(now+180s,hard_deadline), lease=min(now+30s,attempt_deadline). Heartbeat every10s updates lease only before fixed attempt_deadline, never extends deadline. Local mode generates in a cancellable child outside transactions; kill at deadline and discard stale output. Hosted mode follows the one-shot boundary below.

Local crash/retry (no hosted submission): expired lease invalidates fence. If attempts<2 and hard deadline remains, allocate next ticket under both buckets/account/job locks; exhaustion => fail budget_exhausted/release once. Retry gets fixed deadline≤hard deadline. Healthy heartbeat cannot avoid180s/360s timeouts. Finish only matching live fence and nondeleted/nonexpired job; persist complete evidence+output and succeeded atomically. Terminal failures/queue expiry/deletion/quality rejection insert unique release(job_id)+1 once, only if reserve existed; no financial refund. Sweeper/API expiry check use same transitions; stale worker updates0 rows and removes only its orphan output. Network poll failure maps unknown; stable GET resumes state without new reserve.

### Algorithm: Geometry evidence and release quality
REQUIREMENT: `FR-geometry-1`
Local controlnet loads pinned SD/ControlNet/depth models, derives depth from normalized input and runs depth-conditioned img2img. Missing CUDA/model/config fails explicitly. Record exact immutable generation_evidence fields. Fixture labelled and cannot be accepted. Independent corpus report covers≥12×3 actual outputs/openings/anchors≤2% diagonal and retains source/hardware/config evidence; absent report is unknown.

Operator-only server CLI, no public acceptance endpoint: read actual output bytes/evidence, hash and compare, validate real mode/complete provenance/corpus report digest. Under account→job lock recheck unchanged output/deletion/status; append actor/time/decision/output/evidence/corpus hashes. Only matching real successful result can transition unverified→accepted. Missing/changed evidence or ordinary user fails. A rejected decision revokes all share access and unique-releases reserve; accepted→rejected permitted and audited; rejected cannot return to accepted, request a new job instead. Public reads bind current output/evidence and active accepted review. Never infer geometry pass from mode or enum alone.

### Algorithm: Private gallery and comparison
REQUIREMENT: `FR-gallery-1`
List owner jobs max50 excluding tombstones; noindex/private no-store. Serve comparison with distinct alt/keyboard slider/aria-live/status and16px+body/no390pxoverflow/reduced-motion. Delete under account→job lock tombstones owned record, increments fence, revokes share and releases pending reservation once; no further reads. Maintenance retries file removal within1h when healthy. Failed cleanup does not restore visibility.

### Algorithm: Provider-verified package purchase
REQUIREMENT: `FR-payment-1`
Create immutable server-priced intent/account/key/request hash/partner snapshot; return202 and perform network creation asynchronously with stable provider idempotency key. Same key/body reuses; changed409. Missing live keys503, no fake fallback. Bounded webhook accepts event type and object ID only; payload never grants effects. GET payment authenticated to configured merchant,≤64KiB/5s; verify exact ID,merchant,order/account,90000RUB,paid=true,succeeded before success transaction. Failures yield503 or deterministic rejection with no event claim so retry may succeed.

Success BEGIN account→intent; recheck immutable binding. Review intent remains review with no new purchase ledger. Other valid success inserts unique event/purchase ledger and20credits once; canceled may become provider-verified succeeded, succeeded never downgraded by canceled. If account held, retain hold, suppress effective entitlement/conversion; an unrelated paid purchase may be recorded once but is unspendable. If unheld, set entitlement and atomically claim first-paid marker as specified below. Never clear hold from notification, new purchase or return URL.

Refund event is `refund.succeeded`: authenticated GET refund by ID then its bound payment GET. Check exact refundID, refund.status=succeeded, refund.payment_id, positive refund amount≤original90000/RUB; verify bound payment merchant/ID/amount/order/account against immutable intent. BEGIN account→intent; revalidate and insert unique verified_refund/event. Set billing_hold=true and intent review regardless prior pending/succeeded; mark first_conversion invalid if this is its winning payment; revoke affected public serving. Do not subtract guessed credits or execute money movement. Queued jobs are failed/released under account→job locks, further starts/retries/reservations denied, active pre-hold attempt may finish private. Hold is monotonic; no clear operation in MVP. Operator resolution/money refund execution is outside scope. No event dedupe is claimed before verification.

### Algorithm: Explicit share moment
REQUIREMENT: `FR-GROWTH-001`
CTA next to result; user action requests owner-authorized composite, deduped share_attempt. Native share resolution records share_completed; abort/error none. Unsupported native path offers download; successful artifact delivery records export_delivered only, never external publication. Distinct event keys dedupe retries; no automatic messaging. Artifact available within≤2 actions.

### Algorithm: Attribution before purchase
REQUIREMENT: `FR-GROWTH-002`
Separate default-unchecked consent controls partner tracking cookie (30d). Deny/expire clears preference/cookie; essential session unaffected. Explicit manual code works without that cookie. Validate active partner and nonself/immutable owner binding. First valid cookie preference can be overridden by explicit valid code before intent; freeze snapshot on that intent, not globally on account.

Settlement under account lock atomically sets account.first_paid_payment_id if null, even when no partner. First successful transaction to commit wins; with eligible intent snapshot create one first_conversion and deduped paid_conversion event. Later success grants legitimate package but cannot create/backfill/reassign first conversion. Refunded winner invalidates conversion permanently, never selects second payment. Held account does not create a conversion; if first-paid marker was null a verified first success still claims marker to prevent later backfill.

### Algorithm: Server composite entitlement
REQUIREMENT: `FR-GROWTH-003`
Compose using private owner files and immutable image hashes; AI redesign label always. Effective badge-free = stored paid entitlement AND NOT billing_hold. Cache key includes effective entitlement and hashes. Recheck account/quality/share state at final delivery authorization under account lock even when cached; mismatch rebuilds badged version or refuses, never stale badge-free bytes. Public token accesses composite only; original/result paths remain404. Public access held account may refuse404. Ignore removeBadge query flag.

### Algorithm: Partner registry
REQUIREMENT: `FR-GROWTH-004`
Operator CLI creates unique opaque code with fixed owner; duplicate409, no public mint/edit route. Aggregate first_conversion records unique per account, valid only when bound verified winning payment is succeeded and account unheld; exclude self/refunded/review. Sum verified amount, no duplicate event count or repeat-purchase inflation. No commission/payout/reward writes.

### Algorithm: Publish and revoke useful example
REQUIREMENT: `FR-GROWTH-005`
Require owner, explicit per-job unchecked opt-in, real mode, accepted output with matching privileged review/evidence hashes, style, source context1–160chars and description40–2000chars. Store random token and composite; escape HTML in otherwise valid accepted result; no raw email/location/EXIF. Recheck job/hold/quality/published on every request, no-store. Revoke transaction disables page/composite/list immediately; deleted/rejected/held result refuses. Fixture is local labelled preview and cannot produce indexed public entry.

### Algorithm: Fail closed boundaries
REQUIREMENT: `NFR-security-1`
Validate DB/session secret/storage/runtime/modes before listening; production refuses fixtures, weak/default credentials or public DB mapping. Auth limits above; other JSON/public bodies16KiB, public requests120/IP/min. Provider body64KiB/5s; Replicate alone response512KiB/request384KiB/JPEG256KiB, call≤5s and original remaining budget, import10MiB/20MP/single frame, DB pool≤10 and per-containerCPU≤2. Config values server-only; structured logs opaque IDs, redact raw bodies/credentials. All SQL parameterized and file IDs UUID. Negative guard mutations must fail targeted assertions in disposable copies, then restore source; successful unchanged sets are not rerun without cause.

### Algorithm: Attempt budget and measurement
REQUIREMENT: `NFR-performance-1`
Counters measure admitted attempt tickets, a conservative bound on starts (not a claim every ticket ran). Initial ticket is part of admission transaction; every retry gets a new one. Both UTC buckets atomic; limits positive integers≤200/20, configurable lower only. No counter decrement on failure/refund/unused ticket. Before start across UTC rollover replace old-day ticket under current buckets; old stays counted. Exhaustion after admission is terminal fail plus unique credit release. Deadline/hold checks precede any start, stale fence cannot start or finish. Separate queue/inference timings. Nearest-rank p95 uses≥30 complete real warm GPU samples, with hardware/model/source/config provenance; exclude fixture/cold/unknown samples and report missing evidence honestly.

## Hosted execution specialization — accepted 2026-10-03

Before HTTP, prepare actual owner-scoped private bytes with `prepareReplicateInput`; verify source hash, deterministic512 letterbox/transform, sanitized JPEG and request SHA from fixed styles/settings. `workerConfig` explicitly selects replicate, using `readReplicateWorkerConfig`; token stays in a private WeakMap. Ordinary web configuration keeps worker disabled.

`createProviderSubmissions(...).authorize(claim, prepared)` takes current-day platform→account budget→account→job→submission→envelope locks, samples DB time after locks, replaces a midnight ticket conservatively if needed, reserves the existing envelope ceiling and commits preflight→submitting CAS. Only its literal committed authorization winner may send. `finalAuthorize` rechecks live identity/fence/deadline/deletion/revocation immediately before transport. Uncertain commit cannot authorize. SQL locks are released before HTTP/decoding/file work.

`createReplicateTransport(...).create` sends one fixed-origin POST; response loss, invalid response or crash after submitting never replays. Bind valid prediction ID monotonically; late IDs are cleanup-only. Reclaim known ID uses the original consumed ticket/attempt/deadline and new job fence, reconstructs request/seed/settings/transform/bytes before GET, and shares one decreasing budget across poll/import/commit. Queued60s/job360s/attempt180s/lease30s/heartbeat10s remain. Hold before CAS denies create; hold after authorization permits existing private work only. Delete immediately tombstones/fences/revokes and uniquely releases customer credit; it does not prove remote erasure or billing refund.

`createReplicateMedia(...).importArtifacts` admits only genuine succeeded observations, exact delivery hosts and connection-bound public IPs, bounded decoded512 canvases. Crop to original dimensions; exclusively write UUID output/depth/config0600. Verify actual four private hashes and closed provenance config before existing `jobs.complete(jobId,currentFence,output)`. Account→job→submission completion rechecks original ticket/deadlines/identity, current fence and succeeded status, then atomically binds immutable hosted evidence and private/unverified output. After uncertain completion, query job/output/evidence references before disposal: preserve a referenced winner or unknown DB outcome; clean only definitely unreferenced own artifacts.

`createReplicateCleanup(...).pass()` runs inside existing maintenance. Separate opt-in defaults absent/false; exact true requires pins/token/common config, never enables create. Claim under account→job→submission locks with cleanup fence and30s lease. Persist cancel request before its sole cancel invocation; later passes do one GET. Crash between flag commit/send can mean cancel was never sent. Whole remote-action window≤5s/pass; stop by submitting_at+1h (equality elapsed), retain original deadline identity even after local expiry. Unknown/quarantined/retention-expired identities become unresolved; terminal observations become done, only actual canceled confirms cancel. No revival/output/refund/spend release/erasure guarantee.

Quality/public mode classification is controlnet OR replicate, with accepted quality, actual matching bytes/review/corpus, owner/hold/consent/final delivery checks still mandatory. Hosted report `measured-hosted-corpus-v1` requires distinct12×3 inputs/styles, license/annotation/measurement references and independent attestation; declarations alone are not measurements. Mocks remain unverified and cannot publish. Warm30/p95≤25s remains unmeasured.
