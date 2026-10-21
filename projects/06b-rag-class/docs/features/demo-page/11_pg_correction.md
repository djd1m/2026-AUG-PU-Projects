# PG fixture correction — correction-2

Run-ID: 20261003T021046Z-demo-page
Work-Unit-ID: demo-page-pg-correction
Attempt-ID: correction-2
Source-Revision: 24d7e6fb85c425347ae31205f43888575e84594c
Build-Revision: none
Launch-SHA256: 44b7ea0532847045e408170054805224a9a866d9bcb31634cbce4ac4cd7684c5

## Concrete failure and correction

The saved actual PostgreSQL regression attempt 2 (`tests/artifacts/demo-page/full-regression-attempt2/final-full-regression.txt`, lines 444–461) reports `ConfigError: LIMIT_ANSWER_VISITOR_DAY больше LIMIT_ANSWER_BOT_DAY` in the bot-cap case at gateway construction. That prior run passed 610 unit tests and 246 of 247 PostgreSQL tests; it is failed evidence, not a pass for this corrected snapshot.

Only the shared-cap test in `apps/web/tests/int/demo.int.test.ts` changed. Visitor quota is now 3 in both cases; bot quota remains 3 for the bot case and 50 for the visitor case. An explicit assertion checks visitor quota ≤ bot quota. The bot case retains 50 distinct /24 visitors (`198.51.0.1` through `198.51.49.1`), each making one request, so visitor quota 3 cannot cause a refusal. The visitor case retains one IP and bot quota 50. An assertion over the real `visitorKey` helper verifies 50 distinct keys versus one before requests are started.

All existing expectations remain: 3 successes, 47 refusals, 6 provider calls and model-call rows, counter used=3, 25 demo logs and 25 widget logs, 47 limited logs, and no widget installs. No production source changed.

## Source evidence and validation boundary

The previous map `tests/artifacts/demo-page/correction-1-source-hashes.json` is preserved. `tests/artifacts/demo-page/final-source-hashes.json` contains exactly its 25 paths with fresh exact-byte digests. Only `apps/web/tests/int/demo.int.test.ts` differs; the other 24 digests match. Canonical digest: `a7ce1d5c28fa33d7d2de07a17a47cca86f68c9ff48de3f12fa8bd59c1de4de83`. Canonicalization is UTF-8 JSON of the files map, sorted keys, comma/colon separators. `correction-2-source-hashes.json` preserves this correction's map; `correction-2-fixture.diff` records the precise delta against the prior-map-verified test bytes.

Mechanical route: S; substantive route: bounded test-fixture correction preserving production invariants and concurrency expectations. Source scope, previous-map preservation, canonical digest and whitespace checks are local checks only. No full green unit suite was rerun; no database-less integration run or unnecessary typecheck was performed. No E2E was executed, so readiness preflight is not applicable to this attempt.

Runtime remains pending: coordinator must run all 7 real-PG demo tests against this frozen source and complete the pending build. This is a bounded handoff, not a runtime acceptance claim.

Profile: `compact-quality-first-v2`; one executor, no children or fallback. Requested model/effort: `gpt-6.1-sol` / `high`. Native actual model, effort, usage and cost are unavailable and recorded as null, not inferred from the launch request. Launch-to-handoff measured duration is recorded in `tests/artifacts/demo-page/correction-2-handoff.json`. Coordinator-owned telemetry remains under `docs/telemetry/p-replicator/20261003T021046Z-demo-page/`; its run, events and work record were not edited by this correction. CLI captures the final receipt; this executor does not manually write it.
