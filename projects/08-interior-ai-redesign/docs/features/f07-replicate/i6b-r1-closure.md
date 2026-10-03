# I6b R1/R2 closure

Reviewer family: codex
Profile: compact-quality-first-v2; inherited F07 XL, EXACT2P2 bounded REVIEW.
Requested model/effort: gpt-6-astra/high; sole reviewer.
Actual model/effort: null. Usage: null. Cost: null. Active time: null.
Host metadata attachment remains parent-owned; no model switch or savings claimed.
RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-replicate-i6b-r1-review
Source: ea3b2c58f9ff7b2233d4c54354fb87c29ebc5f03
Baseline: 8041f21f515e74d883c7fbba6747ab2d45bcc561
SpecSHA: 2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad (`01_specification.md`).
Verdict: ACCEPT — I6B-R1 and I6B-R2 CLOSED for source correction.

I6B-R1 (P2), CLOSED: `scripts/ui/replicate-cases.js:114-119` registers the exact-job DELETE response predicate before clicking. Promise.all awaits both that response and the existing clickAndWaitForHandler; status 200, hidden result and owner GET 404 are required before gate.release(). The accepted helper waits for the original handler promise; the quoted app handler clears visibility before awaiting DELETE. The correction therefore supplies the missing server/handler barrier. Existing finally release/cancel/join and subsequent fencing assertions are unchanged.

I6B-R2 (P2), CLOSED: `scripts/ui/replicate-cases.js:24-30` selects canonical_evidence and evidence_sha, asserts sha(canonical(e)) equals the stored digest, and reports that stored digest. This matches the quoted canonical helper and jobs.complete serialization/storage contract. Output/depth/config byte checks and null-metric checks remain unchanged.

Inspected the two-file diff and new 101-line focused test. Its fixed oracles cover noncanonical nested key order, corrupt stored hash, exact DELETE matching, delayed handler completion, 200/404 failures, cleanup, and reject broken digest/ordering variants. Supplied final focused log records 5/5 PASS, exit 0; initial 3/5 harness failure remains preserved. Final syntax and scripts/check.js receipts record exit 0. These are inspected author evidence, not reviewer executions.

Read-only hashing confirmed all 10 snapshot entries against source/worktree, original eight unchanged, and all 131 protected files unchanged against baseline/source/worktree. Five correction and nine original check receipt hashes, original check history, correction report, original snapshot, launch and feature SpecSHA match. Product/test delta is only replicate-cases.js plus ui-replicate-corrections.test.js. No broader nine-file semantic rereview occurred.

Limits: I7 full mandatory suites/PG gates and documentation reconciliation remain pending. I8 actual Compose/PG16/browser at both viewports, legacy42+hosted10 and disabled-payment followup remain pending, including ordinary/held stored-digest runtime confirmation. No browser pass or provider/GPU acceptance is claimed. Companion read-only E2E: not_applicable; source/receipt review only. No delegation, other CLI/model, tests, Docker, network, environment/provider inspection, installation, commits, code or run/events changes.

Finished-At: 2026-10-03T15:32:45.483113+00:00
Elapsed since launch: 128.488 seconds.
