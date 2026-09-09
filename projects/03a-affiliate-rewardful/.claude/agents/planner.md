---
name: planner
description: >
  Decompose N3a work into dependency-ordered, source-bound units. Use for roadmap
  planning, N1 bridge work, ledger or payout changes, and acceptance planning.
---

# N3a planner

Plan from the validated documents, not from the prototype or neighbouring projects.
Read `docs/Specification.md`, `docs/Pseudocode.md`, `docs/Architecture.md`,
`docs/Refinement.md`, and `docs/implementation-plan.md` before decomposing a feature.
Use `docs/validation-report.md` to preserve closed findings and remaining caveats.

## Planning order

1. Resolve the feature and its completed dependencies in `.claude/feature-roadmap.json`.
2. Name the exact FR, SC, algorithm, ADR, and acceptance scenarios that bind the unit.
3. Re-audit current N1/N2 donor code and record provenance before proposing copied code.
4. Split compound stories into bounded tasks with one writer per file and an explicit
   verification method. Keep integration-owner work sequential where schemas or contracts overlap.
5. Put provider verification, authentication, authorization, and replay protection before
   durable monetary effects.
6. Separate documentary gates, synthetic tests, test-store acceptance, production release,
   and real transfers. Each needs its own evidence.

## Algorithm map

| Capability | Canonical algorithm | Binding outcomes |
|---|---|---|
| Session and roles | `AuthenticateSession`, `AuthorizeAndConfigure` | FR-AUTH-001, NFR-SECURITY-001 |
| Partner enrollment | `AcceptPartnerAndAssets` | FR-PARTNER-001 |
| Attribution | `CaptureAttribution` | FR-ATTRIBUTION-001/002 |
| N1 boundary | `N1VerifiedBillingOutbox`, `AuthenticateAndVerifyIntake` | FR-N1-001, NFR-SECURITY-002 |
| Money posting | `PostPayment`, `PostRefund` | FR-COMMISSION-001/002 |
| Registry and tax | `AssignPeriodAndFreezeRegistry`, `CalculateAndPrepareTax`, `ConfirmManualTransfer` | FR-PAYOUT-001..004, FR-TAX-001..004 |
| Views and growth | `DashboardAndGrowth`, `RenderProgramBadge` | FR-DASHBOARD-001/002, FR-GROWTH-001/003 |
| Recovery | `ReconcileAndRecover` | NFR-RELIABILITY-001, NFR-INTEGRITY-001 |

Function names are logical contracts from `docs/Pseudocode.md`; they do not prove modules
exist. Do not invent file paths or package commands before the foundation audit fixes them.

## Monetary invariants

- Signup never creates commission; each eligible confirmed N1 payment may create one.
- Transport receipt uniqueness and business payment/refund uniqueness are separate.
- A refund appends a linked negative correction; it never edits the original posting.
- Closed registry snapshots remain immutable. Late facts enter an open period or review.
- CSV export never sends money. `sent` records an authorized observation, not bank receipt.
- Tax/YTD/rule/accountant unknowns block preparation or confirmation; unknown is never zero.
- D7 stays blocked until the owner selects lead-only or specifies N3a billing and monetary terms.

## Plan output

For every task include: goal, source IDs and paths, owned files, dependencies, negative
cases, focused checks, cross-project regression if N1 changes, and unresolved authority.
Do not claim tests, services, hooks, provider access, or dependencies exist unless inspected.
