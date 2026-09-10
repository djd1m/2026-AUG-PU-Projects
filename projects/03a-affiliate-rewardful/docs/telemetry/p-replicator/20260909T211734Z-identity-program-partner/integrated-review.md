# Integrated review terminal receipt

RUN_ID: 20260909T211734Z-identity-program-partner
WORK_UNIT_ID: integrated-review
TRACE_PATH: /tmp/n3a-http-review/projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/integrated-review.md
Profile: compact-quality-first-v2; feature risk XL; independent REVIEW.
Reviewer family: codex
Requested model: gpt-6-astra
Requested effort: high
Actual model: null
Actual effort: null
Usage: null
Cost: null
Missing data: host-attested execution/billing metadata and independent active/wait measurements unavailable. No fallback or savings claim.
Started at: 2026-09-10T08:47:34.860595+00:00 (coordinator prelaunch event)
Ended at: 2026-09-10T08:56:44.907795+00:00
Elapsed wall ms: 550047
Active wall ms: null

Report: /tmp/n3a-http-review/projects/03a-affiliate-rewardful/docs/features/identity-program-partner/review-report.md
Report SHA-256: f261f1f8464e31064f9e842adb772067e17602f98f5a630a4f414640b60cd49c
Input manifest: /tmp/n3a-http-review/projects/03a-affiliate-rewardful/docs/telemetry/p-replicator/20260909T211734Z-identity-program-partner/integrated-inputs.json
Input manifest SHA-256: 04f353a9568556c933ac46f56bd8757cf85cb50e5527f3acac106dec278740dd
Manifest verification: 128 entries, zero mismatches, unchanged through final checks.
Spec SHA-256: f4a311efd12075c120fa3754102f314bcd711c0e79f073b9e5abc85bb6a825da
Frozen contract SHA-256: 9fd30014819ca9133c648061d6b2177ba5f71883b99ff238a9bc64a1ad0b6511
Core receipt SHA-256: 85726d3ca2a4f6e5eabad7ca8b6623b904e1475ad1c3ea70bf839562c6332a92

Result: changes required, 3 medium findings (fabricated evidence SHA; unauthenticated existence oracle/locking; historical precreation mismatch). Earlier3 UI findings fixed in source and actual-component tests. No new high finding, no quota.
11-AC conformance table in report: 7 met, 2 not met, 2 unverifiable. These are direct functional AC assessments, not whole-feature acceptance. Pending mandatory process/browser/SQL mutation/additional concurrency gates prevent acceptance.
Checks executed: npm test -- --reporter=dot exit0 (45 tests/13files,9.39s); npm run typecheck exit0; manifest/routes/forms/source branches check exit0; git diff --check exit0.
Supplied evidence: core final isolated unit30/PG+workspace37 receipt, explicitly attributed; no PG/browser/deployment executed by this reviewer.
Owned edits: report and this receipt only. No runtime source changed, containers started, additional agents spawned or external operations performed.

Status: completed
