# F03 — seed pool, sequences and bounded dispatch

Canonical unchanged contracts: FR-n7-003/004/005; Specification safety-v1;
Pseudocode Consent/cohort steps3–6 and Preview/reserve/dispatch steps1–7.
F03 is accepted only when both bounded implementation slices below pass. This
split limits attempt size, does not lower risk, remove scenarios or create an
approval checkpoint. OWN-N7-002 covers the existing product/architecture scope.

## F03a — plan, preview, pool and reservation (25-minute author)

### AC-f03-dispatch-pool-campaign-001

AC-A1: owned campaigns expose list/read/preview/edit/start/pause with tenant404,
session401 and Origin403. <=5 steps, <=100 recipients/import, delay>=24h, known
personalization fields; reject missing field, subject/address CRLF and unsafe
source markup before jobs. Preview escapes values, delivery payload plain text.
Existing F02 campaign snapshots remain meaningful: content/recipient changes
increment version and invalidate consent atomically under lock(7,1).
### AC-f03-dispatch-pool-campaign-002

AC-A2: explicit start requires current campaign-version/recipient consent for
selected owned mailboxes and inserts durable unique(campaign,enrollment,step)
jobs once. Store encrypted recipient address and keyed recipient hash, no
plaintext contacts/credential dumps in logs. Pausing cancels queued/claimed.
### AC-f03-dispatch-pool-campaign-003

AC-A3: pool aggregate counts only current opted-in, eligible, freshly polled,
non-quarantined mailboxes; reports waiting with fewer than two distinct tenants.
No cross-tenant directory/API disclosure. Deterministic templates and stable
unordered pair/day key; one initial plus at most one reply, unique parent reply,
reply cannot enqueue reply. All pool jobs use the shared dispatcher queue.
### AC-f03-dispatch-pool-campaign-004

AC-A4: atomic claim under shared lock first + SKIP LOCKED reserves common
warmup/campaign quota, min(user,provider,30), default10. Twenty contenders with
remaining3 obtain<=3 reservations. Lease45s; expired claimed can be recovered
without duplicate quota, submitting/unknown never recovered for resend. Claim
alone has zero transport calls. Mailbox selection rotates among eligible senders.
### AC-f03-dispatch-pool-campaign-005

AC-A5: add durable poll/suppression/enrollment seams needed by final guards; absent
poll or incomplete scan stays blocked. Tests may inject explicit local complete
poll fixtures; production must not manufacture freshness or reputation. This
slice exposes no public endpoint to fabricate real polling evidence.
### AC-f03-dispatch-pool-campaign-006

AC-A6: unit + realPG prove validation, idempotence, isolation, shared pool privacy,
quota concurrency and leases; meaningful guard mutation, full affected F01/F02
regression, typecheck/lint/build/securityscan. No transport implementation claimed.

## F03b — final transition, sink and outcomes (separate 25-minute author)

### AC-f03-dispatch-pool-campaign-007

AC-B1: fresh transaction takes same lock(7,1) FIRST and conditionally updates
claimed→submitting after job/lease owner, current sender consent/version,
enrollment/suppression, campaign state/version, mailbox/quarantine, pool recipient
eligibility, complete poll age0<=age<60s and operator test/live gate checks.
Move prior UTC-day reservation atomically to current day or defer when full.
### AC-f03-dispatch-pool-campaign-008

AC-B2: commit is irreversible boundary; no lock held across adapter I/O. Every
stop case SC-US-003-4/5 has explicit before/after-barrier realPG race: revocation,
version, pause, both pool withdrawals, reply, suppression, complaint/quarantine,
mailbox eligibility and lowered limit. Before=>0calls; after=>at most one current
attempt, later0. F04 consumes these real shared stop writers, not separate locks.
### AC-f03-dispatch-pool-campaign-009

AC-B3: local isolated durable sink records actual rendered test messages with
sender/headers/test body and body unsubscribe plus List-Unsubscribe one-click
headers. Message-ID stored for later reference matching. Peer fixture sees only
disclosed test content; private campaign/contact/credential APIs remain protected.
Live transport/sending stays disabled; SMTP accepted means submitted, never inbox.
### AC-f03-dispatch-pool-campaign-010

AC-B4: typed proved pre-DATA transient failure only: max3 total attempts within
120s, delays5/30, all current guards and quota rechecked. Ambiguous timeout/crash
after submitting=>unknown_delivery, quota retained, zero automatic resend.
### AC-f03-dispatch-pool-campaign-011

AC-B5: deterministic clock boundaries include midnight with provider lower limit,
59.999/60/future poll time, lease expiry,120s retry ceiling. State inspection and
operator test tick are scoped to local test mode; server authority remains intact.
### AC-f03-dispatch-pool-campaign-012

AC-B6: full realPG races/outcome tests, mutation for final guard, regressions,
typecheck/lint/build/security and fresh independent review; F04 unsubscribe and
IMAP runtime, F06 full cabinet UI remain tracked, never claimed complete here.
