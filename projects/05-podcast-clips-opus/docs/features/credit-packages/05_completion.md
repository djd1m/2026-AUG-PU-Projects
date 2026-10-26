# Credit packages — Completion Plan

Status: implementation candidate behind default-legacy mode. Actual criterion coverage is indexed below; final local checks, independent review closure and root-owned browser acceptance determine delivery. Historical planning and Phase 1 evidence below remain preserved; deployment is not performed.
Source revision: c559673649460fa5d8ef1e5e3c86bf7053ebbb69.

## Deployment Plan
Pre-deployment requirements:
- Freeze direct owner answers D00/D01/D02 plus delegated implementation choices v2; D03 immediate upgrade stays disabled. Owner authorized selected-scope gate exception and seven-hour autonomous code work; no live activation.
- Independent Phase2 validation uses specification plus requirement/scenario contracts; no author self-approval.
- Implementation route remains XL; separate author and reviewer; reviewer receives clean planner context and frozen source, no coder conversation.
- All mandatory tests/build/security checks and targeted mutation receipts pass; migration rehearsal and compatibility rollback tested.
- Document real infrastructure/provider limits; do not claim local fake receipts prove paid/cloud service behavior.

Deployment sequence:
1. Read-only cohort/schema/pending-intent inventory, scrubbed receipt, rehearsed additive migration; no secrets. Inventory and production execution require authorized environment.
2. Prepare source-bound compatibility build and migration rehearsal. Actual stop/drain/deploy/activation is outside code-only authorization; default N5_BILLING_MODE=legacy preserves live behavior. Never expose credit_v1 rows to old workers.
3. Perform readiness preflight and authorized E2E; confirm new signup, three offers, addon30d paidrights, reservation/settlement/recovery, legacy promises and required rollback behavior. New Cloud.ru VM/FM/S3 and real Metrika4goal receipts are subsequent separately tracked stages.

Rollback: before sales, disable activation and restore compatible legacy route while preserving additive schema. After new intents/grants exist, forward-fix or compatibility build; never drop ledger, infer old rights from price, refund/charge automatically or run old writer blindly. Preserve source/build/decision/receipt IDs.

## CI/CD and Required Checks
Planned pipeline: `test → build → deploy`; commands `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, existing authorized deployment procedure. No new deploy.sh or runtime hook is created by this plan. Full suite uses mandatory skip reporter; infrastructure skips are not acceptance. Detailed tests in [04_refinement.md](04_refinement.md).

## Planned AC Evidence
| Criterion | Planned evidence | Current result |
|---|---|---|
| AC-credit-packages-1 | Real registration/migration SQL race and no replenishment | pending |
| AC-credit-packages-2 | Exact SKU fulfillment, independent addon rights+retention boundaries | pending |
| AC-credit-packages-3 | Seconds precision, lastbalance race, zero refused-provider calls | pending |
| AC-credit-packages-4 | Retry/provider split and output/failure race | pending |
| AC-credit-packages-5 | Reject immediate20RUBupgrade without provider/intent; full-price next-period Pro/manual renewal | pending tests |
| AC-credit-packages-6 | Cohort migration and old invoice preservation | pending |
| AC-credit-packages-7 | Payment identity/security and mobile balance/return | pending |
| AC-credit-packages-8 |24hrecovery and erasure/finalization races | pending tests |
The exact machine `## Criterion coverage` table is intentionally absent until real implementation test files/titles exist. Phase3 must add one row per declared AC with project-relative real test file and verbatim test title; no invented future coverage may pass the completion gate. Phase2 validation-report must bind spec SHA256 and map every AC to named BDD scenario.

## Monitoring and Logging
| Signal | Source | Action |
|---|---|---|
| Negative/duplicate financial state | наша БД constraints/unique errors | Stop affected fulfillment, operator review |
| Orphaned reservation / stuck payment intent | наша БД + existing watchdog | Investigate/reconcile using provider truth, no speculative refund |
| Provider cost attempts vs customer seconds | наш журнал + charge rows | Preserve internal spend and correct customer net charge |
| Error/latency/resources | Existing operational logs, manual before automated alert integration | Measure baseline; no invented PagerDuty/Slack/email integration |
No new alert-service dependency or fixed performance threshold is asserted. Logs redact secrets, tokens, personal inputs and signed URLs; financial references follow existing retention/erasure policy, additional retention period remains unapproved.

## Handoff
Development: source/branch, approved decision/spec digest, file ownership, exact tests and frozen review inputs. QA: isolated fixture DB with all legacy cohorts, race barriers, approved monetary expectations, red/green receipts. Operations: migration source, compatible rollback, environment availability, provider verification and operator-review runbook. Coordinator owns continued work and named pending AC; terminal agent receipt is not feature acceptance.

## Phase 1 Receipt Scope
Only seven feature-plan Markdown files are authorized in this unit; existing canon/migrations/config/app code unchanged. Root will run frozen official checker on selected feature snapshots before cold validation under the owner-approved selected-scope exception; historical aggregate exit1 is preserved. Root explicitly permits this seven-doc WIP commit. Terminal receipt records actual command/exit/source/commit and unknown model usage as null. Structural linkage does not prove financial correctness or owner approval. No model/payment/storage runtime call or paid deployment is launched here.

## Actual Phase 1 gate result
Installed checker with explicit authoritative root role-map flags returned1: `VERDICT traceability=FAIL features=32 gaps=11 inconclusive=30`. Own contour: `PASS contour=credit-packages bidirectional traceability complete`, requirements21/claims21, no missing/orphan keys. Aggregate blockers are pre-existing project/legacy contours; no historical docs repaired and no commit made at that earlier attempt. Revisionv2 is a separately authorized seven-doc WIP commit under selected-scope exception. This aggregate result is not a pass. Owner later approved selected-scope exception; root owns frozen official selected-snapshot gate before cold validation. Initial default-role-map attempt returned2 because project-local toolkit files are absent.

## Code delivery boundary
Deliver tested code/diffs with default legacy and activation disabled. No production terms, real charge, model request, S3 mutation or VM launch is authorized by this credit-plan revision itself. Integration owner controls shared config/compose/env seams; credits coder must not overlap those files. First code release includes no upgrade quote table, proration engine or current-period money-crediting path.


## Criterion coverage
| Criterion | Test file | Test title |
|-----------|-----------|------------|
| AC-credit-packages-1 | tests/credit-packages.integration.test.ts | 20 same-email signups create one no-expiry trial and one session, legacy creates none |
| AC-credit-packages-2 | tests/credit-packages.integration.test.ts | base renewals serialize future periods; exhausted add-on still grants independent paid rights |
| AC-credit-packages-3 | tests/credit-packages.integration.test.ts | 20 last-balance reservations remain nonnegative and preserve video identity across retries |
| AC-credit-packages-4 | tests/credit-packages.integration.test.ts | first usable partial output settles once; watchdog failure and stale output cannot refund success |
| AC-credit-packages-5 | tests/credit-packages.integration.test.ts | credit checkout rejects immediate upgrade before intent/provider and returns actual named package periods |
| AC-credit-packages-6 | tests/credit-packages.integration.test.ts | additive migration rehearsal preserves scrubbed legacy paid, operator, pending invoice and in-flight cohorts without gifts |
| AC-credit-packages-7 | tests/credit-packages.integration.test.ts | multiple committed future base periods show server-derived prospective dates before payment and exclude addon windows |
| AC-credit-packages-8 | tests/credit-packages.integration.test.ts | payment and probe wait behind erasure barrier and issue no late grant or hold |

This table references actual test files/titles and maps coverage; it does not by itself establish full-suite, browser or live-provider acceptance. Additional committed tests cover exact three-SKU fulfillment/alternate events, precise trusted input and provider retry budgets, original-job24hour recovery, failed signup rollback, cross-intent provider-payment identity, and account→video recovery FK barriers. `tests/credit-packages-ui.test.ts` covers balance/catalog/return semantics and actual compose/web/worker mode projections with absent controls.

### Before-payment date disclosure correction
Independent P2-1 review on13680516 identified missing checkout dates. The server now reads the same next-base scheduling rule used by serialized fulfillment: latest committed base end/protected legacy payment end, excluding addon windows. The checkout displays prospective base and addon dates before redirect, distinguishes later base start and concurrent-purchase/payment-time uncertainty, and retains authoritative final dates on return. A fixed-clock real PostgreSQL fixture fulfills Start+Pro+Pro, asserts the fourth period is1April–1May2030 in SSR, and separately checks addon exclusion and protected legacy end. No quote/proration engine or immediate-upgrade branch was added.

Source-bound local check commands/outcomes are recorded in `/tmp/n5-credit-packages-impl-1-20261026.md` (failed/partial historical attempt) and `/tmp/n5-credit-packages-fix-2-20261026.md` (continuation). Root owns selected-snapshot native coverage validation, browser/preflight/responsive acceptance and final independent review. No production activation, real bank/model request, new service or push is authorized here.
