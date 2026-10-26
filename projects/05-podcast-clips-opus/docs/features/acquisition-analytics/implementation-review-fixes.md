# Independent targeted re-review — R1/R2
Reviewer family: codex
Spec revision: sha256:8ef3b9cf796a21492aee67ec622bfbcbbcff9627a7fdba42fb0e06ab658b975d

Frozen candidate: `90d21d09a1a76640d81066d0388423859058eee4`, confirmed by `git rev-parse HEAD`; previous reviewed candidate `d489a80ccd725363116184b6a18b97f89958b85b`. Caller identifies integration equivalent `209b6177`; equivalence was not independently established by this reviewer. Source: `/tmp/n5-acquisition-analytics-code-20261026/projects/05-podcast-clips-opus`.

Verdict: PASS for the bounded R1/R2 correction review. Both original findings are closed. No new material finding was observed in the three-file correction diff. This verdict does not certify full test/build/browser/provider acceptance or complete exercise 3.4.

Inputs: the original independent review and approved plan/addendum, plus only the adapter/host/regression diff for R1/R2. Coder receipts, logs and chats were not read. Coordinator's explicit reconciliation applies: excluded routes stop SDK and queue while preserving bounded consented 30-day dedupe; withdrawal deletes it. No code edited, no further delegation and no optional polish pass.

## Correction evidence

| Finding | Verdict | Evidence |
|---|---|---|
| R1 excluded-route deletion breaks dedupe/attribution | closed | `configure` now uses `stop(!allowed)`, preserving records on route exclusion; route remains null so calls/activity are suppressed. `stop` still clears pending calls and destructs SDK; `withdraw` still invokes full clear. New regression checks same signup/ready/payment after excluded roundtrip, attribution preservation and subsequent withdrawal removal. |
| R2 landing-only timestamp incorrectly splits active visits | closed | Bounded `activity` refreshes an existing unexpired visit timestamp; nonlanding allowed route configure calls it. Host registers pointerdown/keydown/visible-tab listeners only for valid counter + consent + allowed route, and removes all on cleanup. Event keys/targets/coordinates/content are never inspected or stored; no polling was introduced. New regression checks allowed-route activity, tab activity and a genuinely expired visit. |

## Checks actually performed

Read the exact frozen correction with:

```text
git diff d489a80ccd725363116184b6a18b97f89958b85b 90d21d09a1a76640d81066d0388423859058eee4 -- apps/web/src/lib/acquisition-analytics.ts apps/web/src/app/AcquisitionAnalytics.tsx tests/acquisition-analytics.test.ts
```

Ran deterministic adapter probes using installed TypeScript to transpile the frozen source in memory, a bounded Map storage fixture, controlled clock and synthetic SDK. No script/test/source files or business state were written. Observed results:

```text
R1: landing with approved UTM; signup/ready/payment A; excluded route; return;
    repeated signup/ready/payment A
=> [n5_visit, n5_signup_success, n5_first_clip_ready, n5_payment_confirmed]
=> campaign true
=> withdrawal storage entries 0

R2: landing t0; dashboard +20m; landing +11m; activity +20m; landing +20m
=> [n5_visit]
    dashboard after +31m inactivity; landing +1m
=> [n5_visit, n5_visit]
```

These reproduce the earlier defect triggers against the corrected adapter and verify their local state outcomes. They are not actual React/browser/provider-delivery tests. Host listener attachment/cleanup and timestamp-only handling were inspected in source, not executed in a browser by this reviewer.

## Remaining acceptance limits

The original review's caller-owned full checks and runtime evidence remain outstanding from this reviewer's perspective. No full npm suite, typecheck, lint/build, mutation, actual Docker browser, responsive/CJM or actual SDK privacy check is asserted passed here. Counter wiring in the integrated compose is outside this bounded correction diff. No new auth/provider/billing/DB changes occur in the inspected correction diff.

Real counter creation, enablement and authenticated transport/dashboard evidence remain planned for future Cloud.ru in РФ, with analytics default off here. Wrapper calls and intercepted requests do not establish provider receipt. Actual model/effort, usage and cost: null; verifiable launch measurements are not exposed to this reviewer. Only this authorized terminal report artifact was written.

Status: completed
