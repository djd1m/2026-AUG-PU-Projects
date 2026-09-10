# Human CJM browser regression — resumed terminal receipt
Reviewer family: codex
Spec revision: sha256:937b23634f89f589a7cd8e6e5c0afd6f3b1ad0bfc8c3e102363d9ca4e9a9fbc4
RUN_ID: 20260910T071401Z-agent-payments-implementation-7e80
WORK_UNIT: human_cjm
Profile: compact-quality-first-v2; risk: XL
Requested model/effort: gpt-6-astra / high
Actual serving model/effort, usage, cost: null (not exposed; no estimates)
Initial preparation start: 2026-09-10T08:44:42Z
Actual resumed start: 2026-09-10T09:26:07Z
Successful matrix: 2026-09-10T09:26:49Z → 2026-09-10T09:29:52Z (183000 ms wall)

Verdict: PASS for all five specified isolated human purchase journeys. No release, public deployment, real email delivery or real PSP acceptance is asserted.

## Source and build binding

P1 runtime revision `b2343b00208195b3365380146cecdd417f32c6a8`; tested HEAD `30b909c8a54079ad13ac3cd1f94e8fa2ee975bfe` includes subsequent documentation and Docker context exclusions. Actual P1 source mount `/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/projects/01-testimonials-senja`. Next BUILD_ID `T72HtODyBT3GucyLfM4Wh`. N3 reference source `/tmp/n3-proofwall-release/projects/03-affiliate-rewardful` at `acf124efb4db8dd43e304d82c6b4cb3ce8cd8ebc`.

`human-cjm-evidence/candidate.json` SHA256 `410b6de62a16ceb978f51b9390f40d3a17e3e06370ca72d7e38b2b5adcafdf59` records 288 tracked P1 source hashes and 5 compiled build hashes. Orchestrator verified all these remained identical after the fifth run and HEAD did not move. This is scoped P1 equivalence, not a statement that unrelated monorepo work stopped.

Orchestrator SHA256 `c6782706374d99dbace38ed0bfcecad02e05af890260277e5b7cfacaa3262df1`; adapted browser launcher SHA256 `9fafdcb95f22bfce7547f7ccb6acb9d1ee328979eb317af8841faaeaa2d83553`; unchanged original N3 browser test SHA256 `1807e62eb7e1147fb43180fa65153f21467d28340b7f3c3e393ab5a289be2d2e`. Results manifest SHA256 `5b47eb21d0580076dd50dc74e15d171bfa8342df88d8e5bd4197e5e60722ae74`. Absolute evidence directory: `/tmp/agent-payments-implementation-7e80/human-cjm-evidence`.

## Executed matrix

| N3 UI | Agent module | Result | UTC interval | Evidence |
|---|---|---|---|---|
| A | disabled | PASS | 2026-09-10T09:26:54Z → 2026-09-10T09:27:34Z | `a-disabled/summary.json` SHA256 `bcdeb81e510ea9c475bb637fffaabcc5326afe1340fea9f914d2ad113d677d32` |
| A | enabled | PASS | 2026-09-10T09:27:34Z → 2026-09-10T09:28:08Z | `a-enabled/summary.json` SHA256 `137f4679b18f521dbd2584027bc31e76da2658b843675aec060ddcb1cc0ee8c9` |
| B | enabled | PASS | 2026-09-10T09:28:08Z → 2026-09-10T09:28:42Z | `b-enabled/summary.json` SHA256 `98dfb9ac0551544a46e924b8361b379bf58b1c41aaa0b5d550902ca67f5b4dbf` |
| C | enabled | PASS | 2026-09-10T09:28:42Z → 2026-09-10T09:29:16Z | `c-enabled/summary.json` SHA256 `f0c188db0e12e49211ae7e231db5296dbab74be14ac722ede03953220b85037c` |
| D | enabled | PASS | 2026-09-10T09:29:16Z → 2026-09-10T09:29:50Z | `d-enabled/summary.json` SHA256 `dd36e9519ff6aba380a2030a8bb0d1d497e40e3cc9572db5c7d7eb4d5454e83f` |

Each run verified actual application environment, not only runner inputs: AGENT_PAYMENTS_ENABLED matched the table, agent TEST shop/key were blank, and both generic-schema grants and mandates counts were zero. Both P1 public and generic module migrations ran on the isolated PostgreSQL before browser execution. No human flow needed agent linking or mandate.

Each original browser test exercised the displayed N3 referral URL, secure HttpOnly first-touch cookie, P1 signup, proof-required checkout, actual Resend HTTP fixture link, explicit email proof, worker customer binding, hosted native 990.00 RUB checkout, browser return without entitlement, independent P1/N3 provider reads, verified local settlement, one 198.00 RUB TEST commission with zero live payable balance, reload and payment replay, partner UI, 495.00 RUB partial refund, 99.00 RUB net TEST commission, repeated refund without duplication, and manual entitlement-review notice without removing the paid period. Mobile no-overflow assertion passed. These are assertions in `projects/03-affiliate-rewardful/tests/e2e/proofwall-bridge.mjs:47–158`; payment/commission/refund amounts are explicitly checked at lines94–138.

Browser screenshots for all runs are retained; reviewer additionally opened D-enabled dashboard-mobile and partner screenshots. They show intact layouts in their captured viewport; offscreen state is established by the DOM assertions rather than by those screenshots alone.

## Isolation and failed attempts

Actual Next app, worker, P1 PostgreSQL, N3 API/UI and Firefox ran with certificate verification enabled. HTTPS crossed allowlisted Unix sockets; local fixtures supplied Resend and YooKassa responses. Compose networks remained separate and internal, no PostgreSQL port was published. Ports19143/19144/4573 were checked free first; dedicated trusted Firefox profile only. Existing unrelated agent-test containers were untouched. Matrix-owned application and database containers stopped cleanly afterward.

The first sandbox invocation failed at socket creation before startup; approved escalation allowed the already-authorized isolated harness. Attempt1 at09:13:23–09:13:44 failed on missing first referral cookie before signup or payment. Its original evidence is preserved in `human-cjm-evidence-attempt1/`. Following the usage-limit interruption, the launcher restored normal Firefox mode and cleared cookies/local/session storage only on isolated P1/N3 origins before each original test. No product source or original test assertion changed. Subsequent backend diagnostics confirmed302 plus a referral Set-Cookie header and all five normal-browser tests passed. This establishes successful normal-browser behavior; it does not isolate which previous profile/private-mode condition caused attempt1, nor claim private browsing conformance.

## Coverage limits

This matrix does not cover the new agent UI (separate agent-e2e-resumed.md), real mail/YooKassa shop, public DNS/Caddy, browser outage recovery, or a single combined agent-to-N3 purchase journey. It does not browser-exercise testimonial collection/moderation/widget interactions, every N3 UI control, SSO or password reset. Those unchanged routes and automated regressions are separate evidence. No new public deployment was performed; public smoke refers to existing deployments only.

Elapsed wall includes preparation, approvals and interruption; active compute unavailable. Resumed start is measured, usage/model billing details remain null. Initial read-only review receipt is preserved unchanged. Receipt generated 2026-09-10T09:32:11.109169+00:00.

Status: completed
