# I4a F1 review receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i4a-f1-review
Attempt-ID: replicate-i4a-f1-review-1
Source-Revision: b765277c4f349d43a5b3347e50864b4fed3dea48
Build-Revision: d7c0970c6f2f59a742ff83c8e61269a338b3c291 (supplied runtime overlays)
Launch-Path: docs/telemetry/n8-20261002-1740/replicate-i4a-f1-review-launch.json
Launch-SHA256: 5dacd86e5c4cd5536f873d1bd86962ecd1fa92b5a4f9ca5f34952867a377419d
Started-At: 2026-10-03T10:24:49.330454+00:00
Finished-At: 2026-10-03T10:32:32.949813+00:00
Elapsed-Seconds-Including-Timeout-And-Delivery-Gap: 463.619359
Verdict: ACCEPT
Finding F1: CLOSED
Report: docs/features/f07-replicate/i4a-f1-closure.md
Report-SHA256: c0d0af1d07c113930448b1b5d19796146fc285cd27ee739ea51cc066075e4fd6
Profile: compact-quality-first-v2; substantive XL; bounded F1-only independent review.

## Initial timeout and authorized delivery continuation

The initial parent violated the explicit no-delegation instruction by spawning f1_closure. Host evidence replicate-i4a-f1-review-initial-runtime.json records CLI exit124, started 10:24:49.391037 UTC, finished 10:28:49.392528 UTC, elapsed240.00149382499512s. This was a timeout, not successful delivery. The report+receipt by210s target was missed; both were absent at the parent check at10:28:25 UTC. Recovered child artifacts self-report completion at10:28:48.912755 UTC (239.582301s from launch); this does not establish timely parent delivery.

The owner explicitly authorized delivery continuation with no new delegation. Continuation launch: replicate-i4a-f1-review-delivery-launch.json; continuation attempt: replicate-i4a-f1-review-delivery; created 2026-10-03T10:30:24.556660+00:00; budget180s. Original run/work-unit/attempt/source/launch identity above is preserved. Continuation elapsed at save: 128.393153s. Immediate interrupt/retrieval of f1_closure returned not_found; saved child report/receipt and its prior conclusion were recovered. No new worker was spawned. Sole continuation executor finalized these two artifacts.

## Model and usage provenance

Author: Sol6.1/high. Initial parent: actual gpt-6-astra/high confirmed by initial-runtime host actual_contexts. Child: requested gpt-6-astra/high via spawn; actual child model:null; actual child effort:null because child host metadata was not inspected. Continuation: requested gpt-6-astra/high; actual continuation model:null; actual continuation effort:null pending host attestation. Do not substitute initial-parent proof for child proof. No fallback claimed.

Aggregate usage:null; aggregate cost:null; cost_basis:unavailable pending host reconciliation. Initial-runtime JSON contains host process-scoped raw_usage (input249798, cached228608, output1723, reasoning176, total251521) and cost:null; these are not asserted to include child or continuation. Current paid provider spend0.

## Checks and conclusion

Recovered child evidence records exact launch digest, three source/snapshot hashes, seven protected I1–I3 hashes/baseline bytes and preserved I1 authority PASS. Child source analysis covers all needed/claimed/done/unresolved markers, expired and freshly recovered live leases, ordered locks/fresh clock, unique release, preserved cleanup and immutable identity/ticket/deadline/counter/spend. It accepts the corrected PG conjunction and known-before-loss/none positive recovery.

Supplied source-bound Node22/PG16 runs: lifecycle18/18, I1 16/16, oldjobs21/21 PASS; overall_exit0; cleanup0. Writer syntax and jobs5/provider2 unit checks passed. Baseline RED stops at cleanup-denial error-code assertion before reclaim; it is not full-reclaim reproduction or mandatory later send-CAS mutation. No green suite was rerun.

Continuation independently checked HEAD, original launch digest, and all three frozen hashes and source bytes (PASS), and inspected the exact jobs/provider correction. The detailed runtime/test/protected-byte findings are recovered child evidence, not new continuation executions. Source F1 ACCEPT/CLOSED does not accept full feature, provider, browser or later worker/send-CAS/release gates.

Only the requested report and original receipt were changed by the delivery continuation. No product edits/network/provider/Docker/install/tests/commit/push/run-events. E2E preflight not_applicable to source/evidence-only handoff. Initial unauthorized delegation and deadline breach remain process deviations despite delivered source acceptance.

Status: completed
