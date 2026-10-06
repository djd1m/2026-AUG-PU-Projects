# F07 — Planned acceptance and delivery

PLAN ONLY; all runtime acceptance is pending. Source revision: c80504ac.
RUN_ID: 20261006T090602Z-n7-expanded-mvp-a1 · WORK_UNIT_ID: f07-plan-a1.
This document is not an independent validation verdict or a runtime receipt.

## Planned criterion coverage (pending implementation)

Exact future names below are assignments, not existing tests or a passing
`## Criterion coverage` gate. Replace with actual table and executed evidence
only after implementation; reviewer independently binds Spec revision hash.

| Criterion | Planned file | Planned test title | Status |
|---|---|---|---|
| AC-f07-connected-capacity-001 | tests/capacity-integration.test.ts | creates101st connected mailbox for free and expired TEST team without send | pending |
| AC-f07-connected-capacity-002 | tests/capacity-integration.test.ts | global30 admission serializes competing tenants and duplicate requests | pending |
| AC-f07-connected-capacity-003 | tests/capacity-integration.test.ts | lease120 expiry release and stale renewal never resurrect stopped mailbox | pending |
| AC-f07-connected-capacity-004 | tests/capacity-integration.test.ts | sender and pool recipient need active lease at scheduling claim and final fence | pending |
| AC-f07-connected-capacity-005 | tests/submission-integration.test.ts | capacity stop wins before final commit and midnight preserves current quota | pending |
| AC-f07-connected-capacity-006 | tests/capacity-integration.test.ts | tenant pages remain bounded and foreign capacity actions cause no side effects | pending |
| AC-f07-connected-capacity-007 | tests/web-integration.test.ts | capacity controls pagination and unlimited labels expose honest local TEST state | pending + Docker browser |
| AC-f07-connected-capacity-008 | tests/billing-integration.test.ts | unlimited connected preserves TEST billing and campaign3and10 boundaries | pending + migration fixture |

Unit cases: strict page/action parsing, explicit null unlimited rendering, expiry
projection. Real PG mandatory: migration11→12 idempotency/data preservation,
30/31 literals, concurrency across≥3 tenants, rollback, lock-first order, expiry
while blocked, sender and recipient stop races. Positive local TEST send proves
capacity isn't a permanent fail-closed stub. Re-run existing auth/mailboxes/
consent/dispatch/submission/replies/suppression/billing/web integration regressions.
Update only obsolete mailbox3/10 assertions; preserve campaign3/10 and TEST100RUB
minor/30days and provider30 daily independent literal assertions.

Browser evidence: shared Docker Playwright1.63.0, own authenticated context;
create/choose mailbox on later page, activation when global full→waiting, release
and retry→active, errors and keyboard controls, unchecked consent, session switch,
no credential canary in API/DOM. Read-only companion preflight immediately before
E2E; no host browser. Current docs-only preflight not_applicable.

## Mandatory gates and bounded continuation

1. Resolve installed @dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh;
   PLAN --traceability on full project must exit0 before next phase. Selected
   exact-byte staging pass is only F07 linkage, not full-project pass. At baseline
   historical role-map repair is independently assigned; no weakened gate.
2. Fresh coordinator-assigned requirements-validator: validation-report.md with
   actual spec SHA and criterion scenarios; --report-revision --criterion-scenarios0.
3. Substantive XL ROUTE repeated before implementation. Sol6.1 high requested,
   ≤20min attempt, isolated worktree, source digest/ownership/receipt; no nested
   writers. Implement schema/admission/fence then API/UI/meaningful tests in one
   bounded pass; if attempt expires coordinator inspects artifacts and launches
   concrete continuation, never marks feature done on timeout.
4. npm test, npm run lint, npm run build and npm run test:integration in Node22
   N7 runtime with real PG; no new dependencies. Run browser after build/preflight.
5. Actual criterion table plus --completion0; fresh Astra high reviewer≤8min,
   AC-by-AC source-bound review; fix confirmed blocker/high and rerun affected tests.
   --review-contract and canon/source/ownership/receipt gates mandatory.
6. Coordinator integrates accepted commit; authorized push/PR separately owned.
   This PLAN worker commits only these five docs, no push or deployment.

## Delivery and measurement boundaries

Telemetry remains coordinator-owned under the same RUN_ID. Requested planning
role Astra high; actual model/effort/usage/cost null: host metadata unavailable.
Record measured attempt wall timestamps in terminal receipt, no token estimates.
Profile inherited compact-balanced-v1 with project role overrides; savings not
established. Completion of this planning work unit does not complete F07 or
expanded MVP. Remaining owner: N7 coordinator → fresh validator → bounded Sol
implementation → fresh reviewer. F08–F15/live authorization stay outside F07.

Historical F05 A1 connected3/10 assertions are superseded by OWN-N7-005. Preserve
old receipts/specs as history; coordinator explicitly reconciles legacy completion
references when test titles change, never rewrites old evidence as current PASS.

## Planning checks actually executed

Installed package checker selected exact-byte F07 staging: exit0, 8 requirements,
8 claims, missing0/orphan0. Diagnostic: `VERDICT traceability=PASS features=1 gaps=0 inconclusive=0`.
Log: /tmp/n7-f07-plan-selected.log; this is selected-contour evidence only.
Full-project traceability not run here; legacy repair remains an integration gate.
Runtime tests/build not_applicable to this docs-only unit; no product PASS claim.
