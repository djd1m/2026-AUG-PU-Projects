# F10 A2 terminal receipt — projection correction remains

RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1
WORK_UNIT: f10-implement-a2
Profile: compact-quality-first-v2 / XL
Actual first tool ACK: 2026-10-06T15:33:20Z
Final bound: 2026-10-06T15:44:36.472710Z
Source checkpoint: 2026-10-06T15:43:06.472710Z
Frozen before source checkpoint: source-manifest.json timestamp
Receipt sealed: 2026-10-06T15:44:53.164158+00:00
Timing disclosure: receipt composition overran final bound by16.691448seconds. Source froze before checkpoint; no source/check work was extended. This is a failed bounded attempt, not acceptance.
Baseline: 457f006c76d3b4a908e1a2e9ae9a372e01ba20e3
Result commit: 05059f473ff5618d074c2fc2a63dd7cc0f8019f6
Spec SHA256: 410d329fcc9d433f51e554310318457096a8dfdd82aad9754e47d7122744eeb8
Launch SHA256: 7166cb335aaa7c4b35b9f1abeccf669b8fda6d8140da384c7df221e53826b66e
Requested model/effort: inherited gpt-6.1-sol/high exclusive coding; actual native model/effort/usage/cost null, host_not_exposed.
No push/deploy/external SMTP/IMAP/LLM/charges/new dependencies. No subagents. No UI change; browser N/A.

Assigned three gaps and delivered code

1. Schema015 now persists runtime_reconcile singleton keyset (created_at,id); connected credential-bearing mailbox page≤100, cursor survives new store/restart and wraps only after terminal page. Existing active capacity rows separately bounded30 for timely renewal. Due/tenant/mailbox creation requires existing active activity lease. Per-page invalidation is bounded by page plus active IDs; no lease creation from connected/consent state. 205-mailbox realPG witness pages100→100→5 preserves late explicit deactivation without recreation.
2. Shared dispatchAuthority is reused by dispatch claim and durable projection. Projection reads actual oldest authorized queued/claimed job, preserves original age per job_id across retry/nojob/restart, classifies pacing/budget/physical busy/provider retry/authority. Native submit now preserves typed denial/busy outcome; denial before socket/slot is witnessed. SMTP physical fullness as well as per-mailbox occupancy produces busy. This gap is materially improved but NOT fully finished: expired/fresh claimed-job composition described below remains.
3. Only enumerated HttpError/provider/stale/native outcomes are recoverable. Unknown/DB errors abort internal runtime signal immediately and join siblings with no new admission; pool uses passed internal operation signal. Poll quantum DB failures propagate, including fail-tail DB errors; SMTP preflight no longer swallows DB failure. Joined lane unit proves6 siblings complete on internal fatal signal while external process signal stays unmodified. Actual owned-backend PostgreSQL termination during poll propagates without rescan/backoff writes.

Final executed checks on frozen source

- pg-final-v2: exit 0, raw /tmp/n7-f10-implement-a2/pg-final-v2.log
- unit-final-v2: exit 0, raw /tmp/n7-f10-implement-a2/unit-final-v2.log
- type-final-v2: exit 0, raw /tmp/n7-f10-implement-a2/type-final-v2.log
- lint-final-v2: exit 0, raw /tmp/n7-f10-implement-a2/lint-final-v2.log
- build-final-v2: exit 0, raw /tmp/n7-f10-implement-a2/build-final-v2.log
- npm run test:f10: TAP11/11, script explicitly includes tests/expanded-mvp-04.test.ts and literal persistent fair workers serve every eligible mailbox.
- node node_modules/tsx/dist/cli.mjs --test tests/f10-runtime-unit.test.ts: TAP2/2.
- npm run typecheck; npm run lint; npm run build: each0. Checked readonly dependencies unchanged, heavy mutex used.
- Three mutations: cursor forced null; original job age projection disabled; fatal DB error converted to provider_backoff. Each exit1. mutations-v1.json, mutation-v1-*.log. Guaranteed source restoration before final-v1 and final-v2. Target guards unchanged by final typed-denial addition; final-v2 reruns affected PG/static/unit on final source.
- git diff --check0; all10 changed files<500lines.
- source-manifest.json and build-manifest.json bind exact commit and actual dist SHA256. No F10 image built; existing old image not claimed.
- Actual DB: newly created n7f10_a2 OWNER n7 in owned n7f06a-db-1. Initial CREATE success and ownership proof observed tool output; final readonly proof in database-ownership-final.log. Every test/mutation exports DATABASE_NAME=n7f10_a2; trusted fixture asserts current_database exactly before reset. Prior n7f09_a1 and default n7 untouched. Schema015 changed only in unintegrated local candidate; no claim existing A1 DB auto-upgraded.

Executed failures preserved (unique filenames)

- pg-v1 / pg-v2: actual SQL text=date parameter error in dispatchProjection, corrected explicit cast. pg-v1 2/7 PASS; pg-v2 raw preserved.
- pg-v3:8/10 PASS; test unknown-job INSERT UUID parameter inference and terminated checked-out fixture backend reused by pool. Corrected explicit UUID/date casts and release(true), leaving production DB-fatal propagation intact.
- pg-v4:10/10 PASS, then final-v1 10/10 and unit2/2/static0. Final-v2 adds typed native authority denial and passes11/11, unit2/2/static0. No overwritten raw logs this attempt.

Remaining implementation — exact source finding, no acceptance claim

- AC004/006 dispatchProjection currently includes state claimed, counts its own reserved quota, and can return waiting_budget until next UTC day. If that claim has expired, this prevents RuntimeStore.claim from reaching DispatchStore.claim's existing expired-claim recovery. Fresh claimed work owned by another worker can also be projected immediately runnable instead of waiting until its lease. Next bounded correction must normalize/reclaim expired logical send claims under the SAME FIRST-lock client before projection (never physical slots or submitting/unknown), exclude/reason fresh owned claim correctly, preserve due age, and prove both exact orderings with actual PG. Do not nest a second eligibility transaction.
- AC006 successful/new-job projection currently retains previous job failure_count; verify/reset per-work backoff only on proved completed/new logical work while failed/current-job age and backoff remain durable. Add distinguishing restart test rather than assume scoped11/11 proves this composition.
These findings appeared during final source reasoning after passing focused tests. Source remains frozen; no concealed post-check changes. A2 failed its fully corrected projection scope.

Remaining verification after correction

Whole F10 remains unaccepted. Mandatory A3 includes fullunit/fullrealPG/relevant native protocol/faults; native runtime joined drain≤15s under stated cleanup/DB assumptions; restart submitting/unknown with no blind resend; actual SIGSTOP>120 physical4IMAP/2SMTP/1permailbox invariants; per-mailbox healthy poll≤30/fairround≤60/poolround≤300 measured receipts; actual resource CPU/memory/fd; independent tenant/fault/quota/midnight/authority/pair ordering, full canary inventory, and independent review. A1 affected52/52 remains historical evidence, not a fresh A2 fullsuite PASS. Current205 mailbox test proves keyset and activity preservation, not provider load/SLA.

Next owner: /root/n7_expanded_coordinator must launch a short exclusive bounded projection correction on 05059f473ff5618d074c2fc2a63dd7cc0f8019f6, then actual A3 mandatory verification and fresh review. No new long check is running or claimed. Attempt budget ending does not end parent autonomous task.

Changed files (10):
projects/07-cold-email-warmup/db/015-durable-runtime.sql
projects/07-cold-email-warmup/src/dispatch/store.ts
projects/07-cold-email-warmup/src/dispatch/submission.ts
projects/07-cold-email-warmup/src/replies/worker.ts
projects/07-cold-email-warmup/src/runtime/loop.ts
projects/07-cold-email-warmup/src/runtime/store.ts
projects/07-cold-email-warmup/src/runtime/worker.ts
projects/07-cold-email-warmup/tests/f10-runtime-fixture.ts
projects/07-cold-email-warmup/tests/f10-runtime-integration.test.ts
projects/07-cold-email-warmup/tests/f10-runtime-unit.test.ts

Status: failed
