# Architecture correction v2 terminal receipt

RUN_ID: 20260909T174821Z-prd-a-1934
WORK_UNIT_ID: architecture-v2
Stage: PLAN correction iteration2; XL; compact-quality-first-v2.
Requested model: gpt-6-astra; requested effort: high. Actual model/effort: null/null; host execution attestation unavailable. Fallback: no switch observed, no global configuration changes.
Usage/cost/input/output/reasoning: null; counters unavailable, no saving claimed.
Observed receipt interval: 2026-09-09T18:26:09.264085+00:00 → 2026-09-09T18:36:47.211777+00:00, elapsed_seconds=637. Initial input reading preceded receipt clock; full assignment interval belongs to coordinator telemetry, not estimated here.

## Owned outputs

| File | Lines | SHA-256 |
|---|---|---|
| Pseudocode.md | 352 | fa84d43fdcc85f8fedcbb17d474f2385829b9f1c6cf55acc86d185a421808e6d |
| Architecture.md | 140 | 8ce3c2d0941d5b5e8d3fecd806a8a49e98ae74790c4aa3fb902a49eab1298648 |
| ADR.md | 58 | 93c7a1e69ed33ddeb9855746745bded2e38dc981520ae75d6a3c2c4bde090f70 |
| C4_Diagrams.md | 161 | c26db5800db7ec38b683681dd6a2a38330c8f7732391dd688b34064b18b33113 |
| webhook-contract.md | 66 | 7cf37b647fa73126a2ae238840c18f2793976e266c0986ca260c81ca2054d842 |

Read-only canonical inputs copied from current coordinator /tmp/n3a-prd-plan; do not integrate copies from this worker:
- PRD.md: 378844193321cec2ab11e7f0e5f071fa7c1711009240962a6128feb50726307b
- Specification.md: b4adeb8f0a98ab966bcadf1a30fc2d75764be65a5a87e16aaa0947bb0826ba76

## Finding disposition — proposed corrections for independent reread

- PSEUDO-01 / CH-04: PayerYearGuard is persistent unique(payer,person,year) independent of base/program and used for ALL tax models. Both concurrent and sequential second preparations see its live reservation. NPD baseline stores declared external aggregate and covered internal NPD income; confirmed/remaining income is added once. Per-base TaxYTD no longer owns reservation.
- PSEUDO-02 / CH-05: explicit observation endpoint accepts absent preparation and records immutable fact under closed RecoveryGate; blockers retain uncertain obligations. Reconciliation locks old/actual guard keys sorted, then bases/row/preparations, atomically supersedes old reservation and records corrected tax/confirmation. No release-then-reacquire gap. Readiness checked at actual transfer date, not reporting time. All payment/refund/rounding/close/ordinary prepare/confirm transactions hold gate shared lock through commit. Restore transition exclusive. Source replay is staged under recovery gate then normal guarded intake resolves source exceptions before freeze.
- PSEUDO-03 / CH-01: all durable parent refunds sorted by occurrence/provider business ID each arrival and prefreeze; cumulative marginal allocations grouped by basis month. Immutable RefundAllocationRevision and signed differences converge per month, not just total. Frozen period differences route next open period. snapshot_hash/row_hash use canonical economic inputs; audit_artifact_hash separately binds delivery-dependent history.
- PSEUDO-04: signup creates identity-only session with bound grant, no partner Membership; own acceptance remains session-only and inserts read-only membership/assets atomically. Existing users use same trusted grant; owner bootstrap evidence and owner-scoped operator grant issuance defined without a new admin console.
- PSEUDO-05 / CH-02: immutable server-dated EligibilityFact lifecycle, initial invited/active facts, temporal registration/capture lookup; Attribution stores fact IDs/eligibility. Later current status never substitutes historical validity. pending→eligible and first_paid_at=min eligible occurred_at explicit, including zero-rounded commission.
- PSEUDO-06: calendar_locked_at makes timezone immutable after activation or first attribution/ledger, including paused state; periods copy that timezone and derive due5th once. Mutations reject409.
- CH-03: unrequested first-only/finite limits removed from pilot as coordinator directed; every eligible payment/lifetime and immutable registration rate remain. Late earlier payment changes only min first_paid_at projection, not prior entitlement.

## Validation performed and limits

- Exact naming check: 36 unique REQUIREMENT claims=36 canonical FR/NFR, no missing/extra/duplicates. Fourteen Algorithm blocks have all required fields.
- Current Specification contains51SC; 48 unique algorithm claims plus SC-US-012-1/2/3 ui-only exclusions. No dangling claim. New auth/history/month/guard/restore/year/confirmed-transfer/forgery/platform-lead scenarios mapped.
- Direct all5file line/whitespace check passes (each<500); git diff --check exit0. External capability table remains unchanged5columns; no new vendor/provider API claim.
- Independent exact-integer DOCUMENT arithmetic probe: payment100/C1 with Sep30+Oct30 refunds in both orders converges Sep0/Oct−1. Additional full50/50 permutations converge Sep−1/Oct0 and demonstrate signed correction history (Oct−1, Sep−1, Oct+1 for reverse arrival). With September frozen, its stored amount remains unchanged and differences route to October; lifetime reversal remains−1. Probe is not application/runtime/concurrency test.
- Webhook declaration gate rerun exit2 not-implemented; no false claim of replay/concurrency closure.
- Focused reread of updated data structures AND all14 algorithms against physical mapping, ADR and sequences completed by author. Independent validators/challenger must assess corrections; this receipt does not self-approve XL acceptance.
- Runtime/tests/build/PG/concurrency/mutation/restore/browser/provider acceptance not performed; no app exists. No code, container, deployment, commit, push, subagent or real financial action.

## Coordinator alignment notes

Current PRD/Specification already contain51SC and every-payment/lifetime pilot policy. Preserve proposed owner-review gate on lead-only dogfooding; not full paid platform dogfooding. SC-US-009-4 qualified lead is now an explicit authorized platform-owner evidence input with unique(program,subject,kind) and own asset, not automatically a signup/click/payment; please keep this definition/source clear in metrics/Refinement. Add50/50 permutation oracle to planned tests to exercise positive reallocation differences (30/30 case alone does not exercise that branch). Scenario checks should compare economic hash separately from history artifact hash.

Integrate only five owned documents and this receipt. Copied PRD/Specification are inputs. Required review receipts were read from coordinator telemetry pseudocode-v1.md and challenge-v1.md; no edits to either reviewer output. No further scope expansion proposed.

Status: completed
