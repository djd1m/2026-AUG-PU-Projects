# F07 I4a independent review

Reviewer family: codex
Spec revision: sha256:2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad
Source: 00e19123117e729f05c1f591abef6998f6fe3bd6
Product delta: 64d640622444fe944ac61468ba9820a31f3907ac → 21aef02682aa916037fc4cb1701c5fc4d583de80
Verdict: REQUEST_CHANGES
Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-i4a-review
Attempt-ID: replicate-i4a-review-1
Launch SHA256: 83e233984e704c667f7fe9b023ea98007c8fe4f54e1221162028364d6fc06f56
Profile: compact-quality-first-v2; substantive XL, bounded independent REVIEW.
Requested reviewer: gpt-6-astra / high; actual reviewer model, effort, usage and cost: null pending host attestation. Author: actual gpt-6.1-sol / high, attested in replicate-i4a-actual-runtime.json. No delegation or model fallback initiated.

Scope is the four specified product/test files and their concrete accepted-contract/I1/I2 conjunctions. One confirmed finding; no broad I1–I3 re-audit or optional polish.

## Finding F1 — High: cleanup-only late identity becomes a live recovery claim

Primary location: `web/jobs.js:135–141`, especially the eligibility check at line 137. Related new authority: `web/provider-submissions.js:140–151`.

Accepted `04_refinement.md:13` requires an ID arriving after lease loss to remain cancel/cleanup-only. I1 already encodes this: `bindPredictionLocked` at `web/provider-submissions.js:66–79` records `cleanup_state='needed'` and returns `cleanup_required:true` when the original lease is no longer live, without reviving the job. I4a's `hostedInvalid` and `reclaim` ignore that cleanup designation. Once a late ID has been stored, the no-ID rejection no longer applies; `reclaim` advances the job fence and grants a new lease. `workerContext` also ignores the cleanup designation and returns a live recovery context.

Deterministic reproducer using the existing lifecycle suite's real-PG helpers (source-derived; not executed in this review):

1. `const {c,id,a}=await submitted({known:false});` at T=0. Capture immutable counters/ticket/deadlines.
2. `advance(30000)` so the first lease is expired but the original attempt still has 150 seconds. Do not run maintenance or fail first.
3. `await a.bindPrediction(c.job_id,identity())` returns `cleanup_required:true`; the durable row becomes known/needed while the job stays running with the expired lease. This is the existing I1 expiry fixture, not a fabricated row or SQL mutation.
4. `const fresh=await jobs().claim()` currently returns `provider_recovery:true`, fence `c.fence+1`, and a new 30-second lease. `await a.workerContext(fresh)` succeeds with 150000 ms remaining and the same cleanup-needed submission. Maintenance between steps 3 and 4 also leaves it recoverable.

Thus an identity explicitly admitted only for cleanup is promoted back into active private recovery. Current local `complete` correctly denies attachment, so this is **not** a claim that I4a currently publishes hosted output. It is an existing I4a claim/context authorization error and an inconsistent handoff to the accepted later worker, independent of implementing remote cleanup or I5 evidence.

Minimal fix: make cleanup-only designation disqualify active hosted recovery under the existing account/job/submission locks; terminalize/fence/release once while retaining identity, cleanup marker, ticket and spend. Apply the same denial to worker context so a designated cleanup row cannot supply active-work authority. Preserve ordinary recovery for identities durably known before lease loss with no cleanup designation. Add the above real-PG conjunction test, with no claim/context, one release, unchanged accounting and a positive ordinary-known recovery control. Keep DB007 and the accepted I1 authorization logic unchanged unless a separately justified correction is required.

Coverage gap: I1's `tests/replicate.integration.test.js:301–311` checks the job immediately after late binding but never calls the new claim/context afterward. I4a's deletion/late-ID test at `tests/replicate-lifecycle.integration.test.js:215–228` starts with an already terminal/tombstoned job. Neither covers late binding after lease loss while the job remains running.

## Bounded contract results

| Contract | Review result and evidence |
|---|---|
| Submission controls lifecycle independently of caller mode/config | PASS by source inspection: owned operations lock submission; claim rechecks before local allocation; local completion rejects every submission. |
| Account → job → submission → envelope; post-wait time; bucket order/UTC retry | PASS by source inspection and supplied PG barriers. Worker envelope clock is sampled after the lock; local allocation retries rollover. No network or nested transaction in new helpers. |
| Ordinary known-ID reclaim: one winner, original attempt/ticket/deadlines/submission fence | PASS in supplied two-contender PG test and source; job fence advances, lease is capped. Cleanup-only exception fails as F1. |
| Unknown ID, ambiguity, terminal provider status, quarantine: no replay/attempt2 | PASS for the exercised states before late identity binding; F1 identifies the missing transition conjunction. |
| Hold before/after CAS; current fence; expired lease/deadline; unique release | PASS by source and PG cases. Stale fence is rejected before terminal effects; heartbeat cannot renew an expired lease. |
| Deletion, tombstones, late ID, cleanup markers | PASS for deleted/failed jobs and marker preservation; FAIL for lease-loss late ID followed by recovery (F1). |
| Worker context/final send check: input, ticket, original binding, envelope/revocation/deadline | PASS for inspected bindings and final-check denials; FAIL for cleanup-only context eligibility (F1). I2 callback fields and decreasing-budget inputs are compatible. |
| Capacity/spend reservations never decrease; local retries unchanged | PASS by source, literal PG snapshots and old jobs regression. |
| Local fixture/controlnet evidence cannot attach to submitted jobs | PASS: unconditional submission rejection in complete, zero-evidence PG oracle. Hosted completion intentionally absent. |
| Legacy seed before007; protected I1 logic/cases and DB007 | PASS: genuine old-schema SQL precedes migrate; exact before/after evidence checks remain; byte comparisons verified unchanged protected logic/cases/migration. |

## Source and runtime proof

Read-only verification in this attempt exited 0: launch digest matches; all four snapshot hashes match both candidate21aef026 and source00e19123/current files; 14 contract digests and 13 protected-file digests match. Protected files equal baseline64d64062. Removing only the new worker helpers yields byte-identical I1 authority; I1 test bytes from the legacy before/after assertions through EOF are unchanged. The source commit adds only the supplied runtime artifacts over the candidate.

Inspected the supplied PG runner, read-only overlays, Node22 binding log, TAP logs, counts, summary and cleanup log. Binding reports Node v22.20.0 and four matching files. PG16 is asserted by the suites. Lifecycle: 16/16 (15 children + parent); I1: 16/16; old jobs: 21/21; all have zero failures, skips and cancellations. Summary overall exit0 and cleanup exit0; elapsed runtime72.33456140209455 seconds. The runner uses cached Node22 image and PostgreSQL16, internal network, no published ports. Barriers wait for actual `pg_stat_activity` lock waiters; production SQL is not mocked. Assertions compare literal attempt/ticket/deadline/counter/spend snapshots and unique release/evidence counts.

Writer evidence records jobs5 + provider2 + generation13 = 20 passing unit tests, plus syntax/build/diff checks. These are supplied execution evidence, not fresh runs by this reviewer. No old green suite was rerun. No runtime test of F1 was executed: the finding is established by the reachable production control flow above; its affected real-PG regression belongs to the correction attempt.

## Delivery limits

Review delivery is complete; I4a acceptance is blocked by F1. Coordinator owns the next bounded correction and affected PG proof/review. This report does not accept full F07, I4 or MVP. Hosted completion/evidence/schema, worker HTTP wiring, remote cleanup execution/claims, quality/public gates, I6 mutation, I7 full regression, I8 browser and any real provider/pilot/deployment remain later gates. Current provider spend authorization is0; no provider was invoked.

Project-work-companion applied only to source-bound handoff verification. This review's E2E preflight is not_applicable (read-only source/evidence review; no E2E run). No product edit, install, network, Docker, commit, push, run-events or global configuration action was performed. Elapsed review timing and the report digest are in `docs/telemetry/n8-20261002-1740/replicate-i4a-review-receipt.md`; reviewer usage/cost remain null until host collection.

Status: completed
