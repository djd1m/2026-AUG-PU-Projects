# I5a F1 independent closure

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: 161849353b23a1727953f15750144f5d22e8ca32
Verdict: ACCEPT
F1: CLOSED
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i5a-f1-review
Attempt-ID: replicate-i5a-f1-review-1
Launch-SHA256: 2ea2a2edba922834d89737a2a414fbdb40896e540f958fce9fcd0e5142b17665
Profile: compact-quality-first-v2; accepted XL lifecycle contract; bounded F1 review.
Reviewer: gpt-6-astra/high, host capture confirmed by parent in continuation.
Author: gpt-6.1-sol/high, confirmed by inspected actual-runtime record.

Reviewed only F1 from `i5a-review.md`, correction 49585701 → 3315ed70, and its source-bound evidence at Source. No remaining finding in this correction. Original other I5a contracts retain their previous acceptance; this conclusion does not accept the full feature.

## F1 closure

`web/jobs.js:239–244` preserves the stale-fence early return, invokes shared `expire(c,j,now,s)` before `live()` and mode denial, and retains the existing completion/evidence checks. Under account → job → submission locks, the post-lock clock therefore terminalizes a current-owner submitted job at its original attempt or hard deadline even with an expired lease. Existing lifecycle code sets failed with the corresponding reason, advances the fence once, clears the lease, marks known-ID cleanup and uniquely releases the reserved customer credit. Original tickets, attempts, counters, provider spend and prediction identity remain unchanged; no result/evidence attaches. Customer credit release is not evidence of a provider refund.

Healthy lease-only expiry remains a pure denial. A stale old owner returns before lifecycle effects, including at a newer owner's deadline. Valid local fixture/controlnet output on an expired submitted job reaches expiration before mode rejection. Existing hostedInvalid reasons remain correct: submission_input_revoked, submission_binding_mismatch, prediction_identity_conflict and provider_failed. Healthy pre-hold private completion is unchanged.

`tests/replicate-evidence.integration.test.js:82–110` first asserts literal failed state, then fence+1, null lease, reason and one unique release. It compares full stored state against the original with only required terminal fields, cleanup marker and that release changed. Repeated completion with old/current terminal fences, heartbeat and fail must leave the resulting state identical. The affected lock-wait matrix covers account/job/submission × lease/attempt/hard; added cases cover stale owners at both deadlines and valid local output before mode denial. Existing terminal-cause expectations and cleanup races use this oracle. The corrected contract in `i5a-implementation.md` agrees with these effects.

## Source and recorded verification

Read-only hash verification completed successfully before the timeout; it was not repeated in continuation. Launch and accepted spec digests match. Both changed product/test files, all 95 product/test snapshot entries, all 102 protected source/spec entries, five accepted-plan files and three recorded artifacts match. All 95 git blobs at both 3315ed70 and Source match the frozen snapshot. Product snapshot SHA256: `8eca093d4f5615cec72fae0567edc904b2cad620fb2e9af1287a3c1ebc1e4200`. Source adds only 12 PG proof artifacts to 3315ed70, with no product delta.

The inspected PG runner, compose, binding, TAP logs and summary bind execution to read-only source overlays, Node22.20.0 and PostgreSQL16. The in-container check reports 95 files matched. The baseline replaces only `web/jobs.js`; its preserved runtime bytes and the git baseline both match SHA256 `1d849d356b7c31ed4d5c9c16b634da6ccfd7c0751d04d4e6ae50ae6b6705183f`. The corrected integration test runs unchanged as a full file. RED exits 1 at “current-fence completion must terminalize”, actual running, expected failed, rather than an import or reason-only failure.

| Recorded check | Result |
|---|---|
| Corrected PG evidence | exit 0; 16 pass, 0 fail/skip |
| Corrected PG lifecycle | exit 0; 18 pass, 0 fail/skip |
| Corrected PG jobs | exit 0; 21 pass, 0 fail/skip |
| PG cleanup / summary | exit 0 / overall_exit 0 |
| Author local jobs/provider | exit 0; 7 pass, 0 fail/skip |
| Author syntax / whitespace | exit 0 |

Evidence: `docs/telemetry/n8-20261002-1740/replicate-i5a-f1-pg-summary.json`, binding and baseline-map records, baseline-red and three corrected PG logs, snapshot, local log and actual-runtime record. PG elapsed: 110.77824494498782 seconds. Original I1 16-pass and quality 7-pass PG results are unchanged previous-phase evidence, not new correction runs. No tests were rerun by this reviewer.

## Limits and delivery

Full-feature regression/canonical reconciliation, I4b worker wiring, I5b hosted quality/public integration, I6 mutation and I8 actual browser gates remain later work. Actual quality/corpus/performance/billing and a paid pilot/provider activation remain separate gates; this closure authorizes no spend or deployment. E2E preflight: not_applicable, read-only source/evidence review.

Sole independent reviewer; no delegation, product edits, network/provider calls, Docker, tests, installs, commits/pushes, run-events or global configuration changes. Local project-work-companion was applied only for source/evidence handoff.

Timing limitation: the original 240-second attempt expired before report delivery. Its in-progress receipt was preserved separately by the parent. This same-scope continuation delivers the conclusion from already inspected evidence, without a new audit. First recorded reviewer clock: 2026-10-03T11:27:42Z; launch created_at: 2026-10-03T11:27:31.577779+00:00. Host total elapsed/active time, usage and cost remain null pending host reconciliation; no estimate is presented as measurement.

Finished-At: 2026-10-03T11:34:19.215162+00:00

Status: completed
