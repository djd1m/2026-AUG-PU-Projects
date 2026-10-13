# F03a R1 independent correction acceptance receipt

RUN_ID: 20261002T211800Z-f03
WORK_UNIT_ID: n7-f03a-astra-r1
Attempt-ID: review-a2
Source-Revision: 5a7748b36ad6efb70e2bb9fa3b94b7ae9e6769ec
Spec-SHA256: e215f1e53e89b42dccc35e8835209cba31b055f075212b82599fa61368af42be
Build-Revision: sha256:dedad04a44e1dd3fe7f33f6724a966464df9bbf5beff44d4b612d591bee460e5
Launch-SHA256: 39a7575e4565fc09583c40525c4ab7b4f275290380f9ea2acb9855678fb371ee
Started-At: 2026-10-02T22:04:39.946919+00:00
Finished-At: 2026-10-02T22:08:06.241906+00:00
Verdict: ACCEPT
Report: docs/features/f03-dispatch-pool-campaign/review-a-r1.md

R1 CLOSED: successful claims assign monotonically increasing sequence order inside the existing first-operation advisory lock transaction. Selection uses sender max(claim_order), independent of equal caller timestamps; claimed_at, lease and freshness retain the clock seam. Migration004 is additive, migrations001–003 are unchanged, readiness requires4, and recorded PG migration state includes4. F03b migration005/history-retention seam is documented.

The final realPG regression preserves the initial different-sender assertion and adds four strict same-as-two-claims-earlier assertions, yielding six distinct A/B/A/B/A/B claims at one timestamp. Both fresh senders have three jobs with unequal due times and spare quotas. Every timestamp/45s lease is asserted. The initial failed run remains failure evidence; balanced backlog removes the prior fixture's history-dependent exhaustion, without deleting rotation assertions. Exact intermediate fixture bytes are unavailable; final source and meaningful mutant supply the acceptance basis.

Evidence assessed: sol-a-r1-receipt.md and r1-a/checks-correction.json, full-pg-correction.txt (20/20, exit0), old-order-mutation-correction.txt (exact continued-rotation assertion red, exit1), restored-dispatch-pg-correction.txt (6/6, exit0), source-snapshot.json, image-check.json; narrow corroboration from migration-state.txt, mutation-restore.json, first failed full-pg.txt, unit/build/type/lint logs and source-diff.patch. Unit12/12 and host build exit0 are retained successes; final type/lint/image build exit0. These are recorded author executions, not reviewer reruns.

Independent read-only checks (exit0): HEAD equals expected revision; SHA256 recomputation matches42/42 snapshot entries; feature01-specification.md matches Spec-SHA256; snapshot matches caller Build-Revision; caller launch matches Launch-SHA256; migrations001–003, shared transaction and freshness expression are unchanged from62a4acd1; scoped git diff --check passes. Local store SHA256 matches mutation-restore.json. Recorded image check covers40 application files with0 mismatches after restoration. No live container/image inspection was performed. Image digest sha256:7fd30f7b180b368689e4c988b3aaa6adb9f0f48a872836341a897c38860d6d74 differs intentionally from the source-snapshot Build-Revision.

Caller launch/manifest preserved. Manifest SHA256: 47f1d5f0a46d06e5250c5ffa1abe1b82bbf038e8ab4d0007cbaa73ce710379db. Outputs were absent at first inspection. Only the two requested review/receipt files were written, by atomic rename. Product remained read-only; no agents, commit/push, DB mutation, suites/builds, network, browser, secrets/env values or auth headers.

Profile: compact-quality-first-v2; inherited XL risk, bounded R1 REVIEW only. Existing author route recorded L mechanical lower bound; no new PLAN/IMPLEMENT stage or broad review. Parent launch supplies the pre-stage record; parent owns run/manifest aggregation. Project-work-companion delivery skill applied, E2E preflight not_applicable (read-only correction review). All other ACs carried forward as instructed; whole F03 remains pendingB. No acceptance of F03b/F04/UI or re-review of F02/auth/crypto.

Requested-Model: gpt-6-astra
Requested-Effort: high
Actual-Model: null
Actual-Effort: null
Usage: null
Cost: null
Model-Evidence: null pending host proof; requested model is not proof of actual execution.
Fallback: none initiated; actual host routing unavailable.
Elapsed-Seconds: 206.295 (caller launch to terminal artifact preparation, including reading and review)
Active-Seconds: null (not separately measured)
Measurement-Gaps: host model/effort/usage/cost unavailable; runtime/image results are author records, not independent re-execution; no exact intermediate fixture snapshot.

Status: completed
