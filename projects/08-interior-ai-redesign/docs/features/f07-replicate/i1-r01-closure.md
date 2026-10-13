# F07 I1 R01 narrow independent closure

Verdict: ACCEPT
Finding: F07-I1-R01 — CLOSED
Source: a182e00e9045d38f01d6eaa992dbc6a90926ae3d
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i1-r01-review
Review attempt: replicate-i1-r01-review-1
Delivery attempt: replicate-i1-r01-review-delivery-2
Profile: compact-quality-first-v2; bounded consequential I1 proof-gap closure.

The one original MEDIUM test-proof finding is closed. The original review reported zero confirmed product defects. This accepts the correction against that finding and its original I1/AC-f07-replicate-9 contract; it is not whole-feature acceptance.

## Exact checked proof

- `tests/replicate.integration.test.js:81–95`: `blockedRace` opens the blocker transaction, acquires the requested lock, starts both authorizations, and observes at least two matching application connections in `pg_stat_activity` with `wait_event_type='Lock'`. Its assertion at line 92 precedes `beforeRelease()` at line 93, which precedes blocker COMMIT at line 94. These are two real PostgreSQL lock waits; canonical platform serialization means they are not both necessarily direct envelope waiters.
- Added case at `tests/replicate.integration.test.js:162–196`: start/claim at `2026-10-03T23:59:50Z`, hold the envelope using `SELECT ... FOR UPDATE`, and launch two authorizations. Only the post-barrier callback at lines 166–169 changes the trusted clock to `2026-10-04T00:00:10Z`. `web/jobs.js:159–164` establishes a 30-second lease and fixed bounded 180-second attempt. This advances 20 seconds, leaving the lease live until `00:00:20Z` with 10 seconds remaining; it exercises rollover rather than lease expiry.
- Lines 170–174 require two fulfilled results, exactly one `authorized===true`, exactly one `authorized===false` with `submission_no_replay`, exactly one persisted submission and literal reserved spend `'300000'`.
- Lines 175–184 require exactly two tickets and exactly one superseded ticket. The old ticket equals the original job ticket, is dated `2026-10-03`, and is superseded. The new ticket is different, dated `2026-10-04`, not superseded, and consumed exactly at the advanced clock. Job, persisted submission and both returned submission records reference the current ticket.
- Lines 185–189 preserve literal job attempt count 1, its previous attempt count, ticket/submission attempt numbers, job fence, submission fence, and job/submission fixed attempt deadline.
- Lines 190–195 compare the complete ordered budget result to four literal rows: account and platform each have count 1 on `2026-10-03`, and account and platform each have count 1 on `2026-10-04`. This checks unchanged old-day capacity and exactly one new-day admission, rather than an aggregate that could hide errors.
- Source reasoning: `web/provider-submissions.js:136–141` samples the day before bucket/account/job locks and retries if that day changes after those locks; lines 168–171 resample after the envelope lock and retry before admission on rollover. Line 188 handles that retry. `web/db.js:9–16` rolls the failed transaction back and only returns the successful transaction result after COMMIT. Removing the post-envelope date guard would let the first contender retain the old-day ticket; the new current-ticket and literal budget assertions expose precisely the original gap. This is source proof, not an executed mutation claim.

## Source and PostgreSQL evidence

Prior review independently verified the launch SHA256 `f0157d3423fac0716846b9acb36d34aa0ddfa10754572893c34bbbf53318179a` and specification digest above. Current HEAD was exactly the assigned source. The changed test SHA256 is `46a81a01707373d248b784bacf8edabdc978bcb5e41aed5f023f3c07adacb004`, matching `replicate-i1-r01-snapshot.json`.

All four protected files matched the snapshot: `db/007-replicate.sql` (`3bce94bab8d6fd8ef9b45e810e1e26ccda8648a213665f64403501ab80b5a05f`), `web/provider-submissions.js` (`7afadfe4f9cab76d655bcd9de7718d734beeef0d63cc290144d6e19546b87709`), `scripts/migrate.js` (`57ded58e0ac6baf60f5a2b797d1566faafb566946ff72e4cf780a2dc6d8beb86`), and `tests/provider-submissions.test.js` (`a2f44276eb51ef08dbf06a1b48ae933d701ff45d0465b2993377d8faf2e5d954`). Removing only the inserted case restored the integration test byte-for-byte to original-review source `26033186f951dd38e2f413d9db499dd9c0b09610`; all earlier cases and helpers are unchanged.

Evidence under `docs/telemetry/n8-20261002-1740/`:

- `replicate-i1-r01-pg-summary.json`: runtime source `9dbe1adbb6cbc06ae319c5e44a2993f08fb1b5c8`, total elapsed 34.1648703860119 seconds; binding, PG16 and cleanup each exit 0; overall exit 0.
- `replicate-i1-r01-pg-binding.log`: Node `v22.20.0`, five files, `matched:true`. Independent `git show`/SHA256 comparison also confirmed all five scoped runtime-source files match the reviewed bytes, reconciling the different runtime and review revision labels.
- `replicate-i1-r01-pg-pg16.log`: the new rollover case is child `ok 7`, duration 486.275333 ms. TAP reports 16 tests, 16 pass, 0 fail/cancelled/skipped/todo: 15 children plus the parent, not 16 independent scenarios. The test requires PostgreSQL major 16 at line 23. This is supplied execution evidence; the reviewer did not rerun it.
- `replicate-i1-r01-pg-cleanup.log`: database container and private network removed; cleanup exit 0 is recorded in the summary.

Reviewer-executed checks were read-only source/evidence inspection, hash/source comparisons, the prior-case byte comparison, and `git diff --check` (exit 0). No tests, Docker, network, broad audit, delegation, product edits, commits, pushes or run/events edits occurred in this review/delivery.

## Delivery and limits

The prior attempt reached the substantive ACCEPT/CLOSED conclusion but timed out before saving these artifacts: host-reported elapsed 180.003 seconds, exit 124. This delivery-only attempt records that already completed analysis without re-reading or re-analysis. Prior actual model/effort is `gpt-6-astra/high`, confirmed by the host through the owner's delivery instruction. Delivery actual model/effort, usage and cost remain null pending host reconciliation; no savings claim.

E2E preflight is not_applicable: this is narrow source/evidence review with no E2E execution. No executed mutant, independent runtime rerun, future I2–I8 acceptance, or whole-feature acceptance is claimed. No original R01 requirement remains open. Receipt: `docs/telemetry/n8-20261002-1740/replicate-i1-r01-review-receipt.md`.

Status: completed
