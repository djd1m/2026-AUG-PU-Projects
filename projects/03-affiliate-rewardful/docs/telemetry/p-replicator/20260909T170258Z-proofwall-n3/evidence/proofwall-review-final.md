# Independent P1 bridge review — final

Verdict: PASS for the reviewed P1 source candidate. Both P2 findings in /tmp/proofwall-n3-review.md are closed by d9f5d6a140ca168a339242018ea03201f79bdcb2. No remaining substantiated P1 source blocker was found. Browser/provider/configuration acceptance and the release decision remain integration-owner gates; this report does not claim a deployment or actual external payment verification.

## Exact source and scope

Worktree: /tmp/proofwall-n3-bridge. Initial independent full pass covered b8f8f83 + 0796989 from base a16c0be. This bounded re-review inspected the complete 0796989..d9f5d6a delta, its interactions with the previously reviewed invoice/proof paths, and all three changed/added regression files. HEAD independently confirmed d9f5d6a140ca168a339242018ea03201f79bdcb2.

At 2026-09-09T19:37:05.495554+00:00, all 36 paths matched /tmp/proofwall-n3-source-shas.json, SHA256 425e90ac939a1d694b5c62c1a50c59c9f57afdd34460ff55ef32d1b7193015a2. Updated implementation receipt SHA256 independently confirmed 7740071885367f9157efddab088d7b3eaa28e363c501eda29339d3fb4b788697. The sole dirty file remains the explicitly root-owned next.config.mjs build fix, outside the source manifest. Canonical contract remains the SHA pinned in the initial review.

## Finding closure

1. Canceled first purchase: CLOSED. apps/web/src/lib/n3-checkout.ts:51 now rejects a persisted canceled intent with N3_PAYMENT_CANCELED / HTTP 409 before returning its old provider URL. The existing route maps that typed failure to the browser. BillingBlock accepts only that exact status/code as cancellation and exposes an explicit restart even when paidUntil is null. Clicking restart creates/stores a fresh request key; it does not immediately perform checkout. Ordinary transport/binding failures retain the old key. The server still reuses any unresolved project invoice if a client supplies a fresh key, so the correction does not weaken ambiguous-payment idempotency. A cancellation concurrent with a request may require one more retry to observe the terminal state, but the former persistent trap is removed.

   Regression inspected: n3-checkout.test.ts checks pending reuse despite a different request key, terminal canceled rejection for the original key, successful fresh invoice creation and unchanged free entitlement. n3-billing.test.ts exercises the actual component's click handlers with stateful mocked React hooks: repeated pending attempts preserve the key, canceled response reveals the free-account restart action, and a fresh key appears only after its explicit click. This is a handler-level test, not a real DOM/browser test; the parent owns browser evidence.

2. Stale proof-version acknowledgement: CLOSED. services/worker/src/n3-outbox.ts:42–49 obtains account_id, kind, business_key and payload from the successful fenced UPDATE RETURNING. It binds only the row whose account/email and exact accountId:proofId match that authoritative returned job. Caller-supplied account/kind/payload no longer select the proof. Existing job-id/lease-token/lease-expiry fencing remains. An old acknowledged job can be marked delivered without binding a replacement proof, which is the correct separation between delivery completion and current proof authority.

   Regression inspected: n3-outbox.test.ts replaces a proof with a different id at the same email, confirms the old job is acknowledged while bound_at stays null, then confirms the current job binds from persisted fields even with forged caller fields. The normal signup fixture now uses the production canonical accountId:proofId key.

No new schema, provider transport, entitlement mutation, tenant authority or queue-capacity behavior is introduced by this delta. The previously reviewed invariants remain applicable.

## Checks and evidence limits

Reviewer-performed checks: 36/36 manifest hashes match, receipt hash match, HEAD match, git diff --check 0796989..d9f5d6a passes, complete static inspection of the fix and regression coverage. No source edits, DB/runtime/network/secrets/container/deployment activity, or subdelegation.

Author receipt reports full web 812 tests passing; the newly discoverable .test.ts UI handler case passed separately 1/1 after the full suite's collection. It is not misrepresented as part of that full 812 run. Worker 39/39, workspace typecheck and build also reported passing. Existing DB grant regression remains 18/18 on unchanged schema. These execution results were read from the author receipt, not independently rerun by this readonly reviewer. Parent browser E2E is independently in progress on this candidate.

Telemetry: RUN_ID 20260909T170258Z-proofwall-n3, work unit bridge-p1-review follow-up, profile compact-quality-first-v2 / XL. Requested model gpt-6-astra high; actual model/effort must be supplied from parent execution metadata, not inferred here. Usage/cost null because counters are unavailable. Parent-owned trace directory: projects/03-affiliate-rewardful/docs/telemetry/p-replicator/20260909T170258Z-proofwall-n3/.

Measured reinspection window: 2026-09-09T19:36:44+00:00 to 2026-09-09T19:37:53.705750+00:00 (69.706 seconds); excludes original full review and time between assignments.
