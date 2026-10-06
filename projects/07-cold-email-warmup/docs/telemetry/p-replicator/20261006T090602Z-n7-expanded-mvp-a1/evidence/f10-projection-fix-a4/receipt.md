# F10 projection fix A4 — scoped correction delivered
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT: f10-projection-fix-a4
Requested model/effort: inherited gpt-6.1-sol/high. Actual native model/effort/usage/cost null, host_not_exposed.
Actual first tool ACK: 2026-10-06T15:56:46Z
Launch: 2026-10-06T15:56:28.211652Z
Freeze-by: 2026-10-06T16:02:58.211652Z; source-manifest frozen_at precedes it.
Final bound: 2026-10-06T16:04:28.211652Z
Receipt sealed: 2026-10-06T16:03:35.681068+00:00
Baseline: e0c93e196aac89610ba1b5d69ccb64ce571d86bc
Result commit: 8dc405d237afa78950e57a3da54e02c9af76e39c
Spec SHA256: 410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Launch SHA256: 05e2c13c6be978b4b3f6ed77b806adc0ebaf7707e5b5782fa25a08eb3da88e47
Profile: XL scoped correction. No push/deploy/external provider/LLM/charges/dependencies/subagents/UI changes.

Changed exactly3 authorized paths:
- projects/07-cold-email-warmup/src/dispatch/store.ts
- projects/07-cold-email-warmup/src/runtime/store.ts
- projects/07-cold-email-warmup/tests/f10-runtime-integration.test.ts

Minimal correction

recoverLogicalClaims is shared by DispatchStore.claim and dispatchProjection. It receives the SAME already FIRST-global-lock checked-out client; no pool.connect, nested transaction or I/O. Expired logical claimed jobs release movable reservation/owner before quota projection, then retain existing retry120s/3attempt and old-day initial fences. Submitting/unknown/physical slots are excluded by state and never reclaimed. Fresh claimed owner holds sender until earliest fresh lease, including when another queued job is older. Projection failure_count/reason/next-check backoff resets only for a newly selected logical job or prior job proved submitted/cancelled. Same failed job original age/backoff persists; unknown remains charged/unmodified.

Actual distinguishing evidence

Before production edit, A4 red-v1 command used node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='expired claimed reservation|a new oldest logical' tests/f10-runtime-integration.test.ts. Exit1 TAP0/2 with actual expired claim self-quota waiting_budget vs ready and new-job retained failure1 vs0. Independent branches were reached. A3 raw fresh-held/completed-job red failures remain separately preserved, no historical edit. Final green reaches all four boundaries and sender-wide hold while queued older.

- pg-final-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/pg-final-v1.log
- affected-pg-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/affected-pg-v1.log
- unit-final-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/unit-final-v1.log
- type-final-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/type-final-v1.log
- lint-final-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/lint-final-v1.log
- build-final-v1: exit 0, raw /tmp/n7-f10-projection-fix-a4/build-final-v1.log
- npm run test:f10: TAP16/16, explicitly includes parent04 literal witness. That parent remains a production-store fairness witness; no whole-feature runtime/CLI acceptance inferred from title.
- node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/submission-integration.test.ts tests/dispatch-integration.test.ts: TAP37/37 including current UTCday quota, every stop fence, pacing/retry120s and unknown outcomes.
- node node_modules/tsx/dist/cli.mjs --test tests/f10-runtime-unit.test.ts: TAP2/2.
- npm run typecheck; npm run lint; npm run build: each0, checked readonly dependencies/Node22 runtime under heavy mutex.
- Earlier green-v1 TAP15/15 and static/unit0 preserved with unique paths. Final sender-wide hold addition reran affected PG/static/unit; no overwritten logs.
- Tests only owned n7f10_a2: every command exports DATABASE_NAME=n7f10_a2 and trusted focused fixture asserts current_database before reset. Default n7 and old n7f09_a1 untouched.
- git diff --check0, eachchangedfile<500lines. Exact source-manifest.json and fresh build-manifest.json bind frozen commit/dist hashes. No new Docker image or browser/native/load PASS claimed. No additional source mutations executed this A4; actual red→green is the scoped discrimination proof.

Remaining and next owner

Assigned A4 projection scope is complete; WHOLE F10 remains unaccepted. Coordinator /root/n7_expanded_coordinator launches separate≤20minute actual verification: actual built worker CLI/native production operations via authorized trusted internal DI seam; fullunit/fullrealPG/native faults; F09 preDataRetry witness must honor60s pacing without weakening original120s ceiling; real SIGSTOP>120; full300s pool/per-mailbox cadence and conditional30/60/300 gap receipts; physical4IMAP/2SMTP/1permailbox/resource/fd/CPU/memory proof; unknown restart, cancellation cleanup≤15s under stated assumptions; broader canaries/mutations and independent fresh review. Browser N/A unchanged UI. New substantive findings require bounded correction, not weakened checks. No long/background job remains running at handoff.

A3 late-delivery checkpoint and A2 receipt overrun are preserved history; this fresh A4 source and terminal receipt sealed within allocation. Completed denotes only this authorized bounded correction, never full feature acceptance.

Status: completed
