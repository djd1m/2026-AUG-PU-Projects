# F07 I1 independent code review
Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Verdict: REQUEST_CHANGES
Source: 26033186f951dd38e2f413d9db499dd9c0b09610
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i1-review
Attempt-ID: replicate-i1-review-1
Requested model/effort: gpt-6-astra/high; actual model/effort: null pending host proof.
Profile: compact-quality-first-v2; consequential XL, bounded independent I1 review.

One MEDIUM proof defect; zero confirmed production-code defects. This verdict concerns I1 database authority only. It neither rejects deliberately deferred slices nor accepts the whole feature. Author requested Sol6.1/high; actual different-model execution requires the coordinator's host evidence and is not established by these model labels.

## Finding F07-I1-R01 — MEDIUM: no lock-wait UTC rollover test

Path: `tests/replicate.integration.test.js:176` (also the setup at lines 162–163 and 187–190). Relevant production guards: `web/provider-submissions.js:141` and `:170`.

All midnight cases advance `now` before calling `authorize`. The actual blocked-envelope clock-change case at test lines 155–160 advances 30 seconds from noon and tests lease expiry. Consequently none exercises the transaction beginning on one UTC day, blocking, then obtaining its locks on the next day. The existing midnight success and rollback checks can pass even if both `utc_rollover_retry` date comparisons in `authorize` are removed: their initial day sample already sees the next day. This is a source-established test-oracle gap, not an executed mutant or a claim that the current guards are broken.

Reproducer: start a job at `2026-10-03T23:59:50Z`; lock its spend envelope in a separate transaction; begin two authorization calls and establish the existing real PG lock barrier; advance the trusted clock to `2026-10-04T00:00:10Z` while they are blocked; release the envelope. The lease is still live. If the post-envelope date guard is missing, the first call can commit authorization against the previous day's consumed ticket because ticket replacement was evaluated before the wait. None of the present cases detects that regression. This is the I1/AC9 current-day admission boundary explicitly included in the requested review, not I4 worker recovery.

Minimal fix: add this one focused real-PG barrier case using the existing helper. Assert one committed authorization, one no-replay result, one submission, reservation `300000`, exactly two tickets with exactly one superseded, the current consumed ticket dated `2026-10-04` and referenced by the job/submission, unchanged attempt/deadline, and literal old/new platform/account counts of one each. Those outcomes prove rollback/retry rather than merely a successful return. Run the affected PG suite and submit the new evidence for narrow review; do not change production guards or expand into transport/browser testing for this correction.

## I1 subset conformance

PASS below means the stated database portion was checked, not that the entire FR/AC is complete. GAP identifies the finding above.

| Contract | I1 database portion | Assessment and evidence |
|---|---|---|
| FR-f07-replicate-2 | Durable one-shot CAS, immutable identity and monotonic observations | PASS: `authorize` commits through `web/db.js` before returning true; a matching durable non-preflight row returns false. SQL exceptions/uncertain commit cannot return send authority. PG CAS, ambiguity, identity and direct-mutation cases check persisted effects. HTTP at-most-once remains I2. |
| FR-f07-replicate-3 | Live fence/lease/fixed deadline checks; identity-only late writes | PASS for I1: post-lock clock reads and live checks precede authorization; binding/observation helpers do not change job state. Late-ID cases compare the entire job before/after. Reclaim, heartbeat and terminal-release integration remain I4. |
| FR-f07-replicate-6 | Immutable authorized envelope, conservative reservations and existing ticket limits | PASS by source and supplied PG cases except rollover-race proof in R01. No initial envelope, no customer-ledger rewrite, no automatic spend decrement. Token/startup checks remain I2/I4. |
| AC-f07-replicate-2 | Missing/zero/revoked/out-of-window/mismatched/exhausted envelope denies atomically | PASS: PG negative cases assert zero submission rows and zero reservation; input/fence/ticket/hold denials are separate cases. No outbound-call count claimed in I1. |
| AC-f07-replicate-3 | Exactly one committed authorization; failed CAS rolls back identity/spend/ticket changes; ambiguity cannot reauthorize | PASS: real two-contender test counts one true result, one false result, one row and one reservation; injected SQL failure tests rollback. HTTP crash/response loss and local release remain later gates. |
| AC-f07-replicate-4 | Immutable attempt/ticket/deadline and cleanup-only late identity | PASS: SQL protects bindings; expired/deleted/failed job cases retain the job byte-for-byte as returned by PG. Two-reclaimer GET-only recovery remains I4. |
| AC-f07-replicate-6 | Hold before authorization; deleted job/upload denial and no late-ID revival | PASS: account-lock hold race denies both contenders with zero reservations; deletion and late identity cases check denial/no job change. Send/import/deletion integration remains later. |
| AC-f07-replicate-9 | Atomic current-day tickets and envelope reservation, no decrement/replay | GAP R01: static midnight replacement, exhaustion and rollback are proven, but crossing midnight while blocked is not exercised. Recovery/release portions remain I4. |

## Source and evidence assessment

Reviewed all five assigned files and targeted `web/db.js`, `web/jobs.js` bucket/ticket/account/job/delete paths, and existing schema constraints needed to establish their locking and compatibility. Read the accepted five role documents, validation report/closure and I1 interface handoff. Applied root brutal-honesty-review technical/security/test rubrics and project-work-companion delivery guidance; local policy permits zero invented findings. No broad repository audit.

Authorization serializes platform bucket → account bucket → account → job → submission → envelope. Account/job locks protect canonical hold/deletion/ticket writers; envelope time is sampled after its lock. Immutable model/version/window/cost/acceptance bindings and irreversible revocation prevent an envelope being repurposed. Previous-day consumed ticket replacement keeps old counters and is rolled back with denied admission. The code has both UTC retry guards; R01 is about proving that path.

The transaction wrapper returns only after successful COMMIT and throws on uncertainty. Existing durable submission state never supplies a second true result. Locked helpers share the caller's client without opening nested transactions or acquiring account/budget locks; their documented prerequisite is freshly locked rows and a fresh DB timestamp. Factory methods own their transactions and must not be nested inside a caller's transaction. No HTTP/file work occurs under these locks.

Prediction identity is write-once and unique; savepoint recovery persists a conflict quarantine marker instead of overwriting the ID. The marker is irreversible. Late ID binding grants no completion authority. Provider statuses and submission states cannot regress; observation does not publish or revive jobs. The migration is append-only and leaves fixture/controlnet validators and evidence immutability intact. Representative legacy records survive migration and its second invocation unchanged in the supplied PG run.

SHA256 verification against `replicate-i1-snapshot.json`: all five scoped files match exactly. All nine recorded accepted-plan digests also match, including the seven requested contract/validation inputs. The snapshot's author baseline and runtime closure's shorter source label differ from the review HEAD; exact matching scoped bytes, rather than those labels alone, establish applicability.

| Scoped file | Verified SHA256 |
|---|---|
| db/007-replicate.sql | 3bce94bab8d6fd8ef9b45e810e1e26ccda8648a213665f64403501ab80b5a05f |
| web/provider-submissions.js | 7afadfe4f9cab76d655bcd9de7718d734beeef0d63cc290144d6e19546b87709 |
| scripts/migrate.js | 57ded58e0ac6baf60f5a2b797d1566faafb566946ff72e4cf780a2dc6d8beb86 |
| tests/replicate.integration.test.js | 035870649ef016ce7be410c675741b7b69264043340fc8e2f7574de4427b18ff |
| tests/provider-submissions.test.js | a2f44276eb51ef08dbf06a1b48ae933d701ff45d0465b2993377d8faf2e5d954 |

Evidence read under `docs/telemetry/n8-20261002-1740/`: `replicate-i1-runtime-closure.json`, `replicate-i1-runtime-binding.log`, `replicate-i1-runtime-pg16.log`, `replicate-i1-runtime-node22-focused.log`, `replicate-i1-generation-node22.json` and its log. PG16.10 TAP reports 15/15: fourteen child cases plus their parent, not fifteen independent race scenarios. Tests use actual SQL/locks and persisted literal row/reservation counts. The barrier counts two blocked connections; canonical platform serialization means this is not a claim that both wait directly on the envelope.

Supplied Node22.20.0 evidence: new units 2/2, existing jobs units 5/5, lint/build exit0. The focused log retains generation failure in the web image without Python; the separate closure records the unchanged generation suite passing 13/13 with the exact image Node22 binary and host Python. That rerun is not evidence that the original Python-less image passed. No green tests, build, Docker, network or mutation execution was repeated by this reviewer. Reviewer-executed checks were identity/hash verification, source/evidence inspection and `git diff --check` (exit0).

## Limits and next gates

Coordinator owns the narrow R01 test correction, affected PG execution and independent closure. No code changes, run/events writes, delegation, commit or push were made by this reviewer. I2 HTTP transport, I3 secure media, I4 worker recovery/deadlines/cleanup/wiring, I5 hosted provenance/mode constraints and quality, I6 browser preparation/send-guard mutation, I7 full contract table/regression/final review, and actual browser E2E remain deliberate later gates. Full backup/restore compatibility, hosted quality/performance/safety and paid activation are not claimed. Authorized external spend remains 0 USD; envelope provisioning is an operator action, not a browser route.

E2E preflight: not_applicable (read-only slice review, no E2E). Actual model, effort, usage and cost remain null until host evidence; no savings claim. Measured review elapsed time, launch binding and this report's digest are in `docs/telemetry/n8-20261002-1740/replicate-i1-review-receipt.md`. Completion of this review is distinct from acceptance of I1.

Status: completed
