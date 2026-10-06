# f04-reply-suppression contract-format validation index

Spec revision: sha256:73a4dc62c00e08718bde936bd6fede36bd1bae07c48cf9c963d3c56a552237a6
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f04-reply-suppression-001 | Legacy `AC-A1`; `docs/tests/security-scenarios.md` SC-US-006-4 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f04-reply-suppression-002 | Legacy `AC-A2`; `docs/test-scenarios.md` SC-US-006-1 Scenario; `docs/test-scenarios.md` SC-US-006-2 Scenario; `docs/tests/security-scenarios.md` SC-US-006-3 Examples; `docs/tests/security-scenarios.md` SC-US-006-4 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f04-reply-suppression-003 | Legacy `AC-A3`; `docs/test-scenarios.md` SC-US-006-2 Scenario; `docs/tests/security-scenarios.md` SC-US-006-3 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f04-reply-suppression-004 | Legacy `AC-A4`; `docs/tests/security-scenarios.md` SC-US-006-3 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f04-reply-suppression-005 | Legacy `AC-A5`; `docs/tests/security-scenarios.md` SC-US-006-3 Examples; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f04-reply-suppression-006 | Legacy `AC-A6`; `docs/tests/security-scenarios.md` SC-US-006-3 Examples; `docs/tests/security-scenarios.md` SC-US-006-4 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G06** below |
| AC-f04-reply-suppression-007 | Legacy `AC-B1`; `docs/tests/security-scenarios.md` SC-US-007-4 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G07** below |
| AC-f04-reply-suppression-008 | Legacy `AC-B2`; `docs/test-scenarios.md` SC-US-007-2 Scenario; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G08** below |
| AC-f04-reply-suppression-009 | Legacy `AC-B3`; `docs/test-scenarios.md` SC-US-007-3 Scenario; `docs/tests/security-scenarios.md` SC-US-007-4 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G09** below |
| AC-f04-reply-suppression-010 | Legacy `AC-B4`; `docs/tests/security-scenarios.md` SC-US-007-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G10** below |
| AC-f04-reply-suppression-011 | Legacy `AC-B5`; `docs/test-scenarios.md` SC-US-006-2 Scenario; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G11** below |
| AC-f04-reply-suppression-012 | Legacy `AC-B6`; `docs/test-scenarios.md` SC-US-006-1 Scenario; `docs/test-scenarios.md` SC-US-007-2 Scenario; `docs/test-scenarios.md` SC-US-007-3 Scenario; `docs/tests/security-scenarios.md` SC-US-007-5 Examples; existing procedure/evidence `acceptance.md # F04 accepted` (historical; no rerun); **VALIDATE GAP G12** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f04-reply-suppression-001` (legacy `AC-A1`): SC-US-006-4 omits bounded header/page-size rejection cases.
- G02 / `AC-f04-reply-suppression-002` (legacy `AC-A2`): SC-US-006-3/4 omit concurrent page reorder and atomic counter ledger as separate BDD.
- G03 / `AC-f04-reply-suppression-003` (legacy `AC-A3`): SC-US-006-2/3/5 omit sparse/expunged coverage and second-reset stale-worker case.
- G04 / `AC-f04-reply-suppression-004` (legacy `AC-A4`): SC-US-006-3/5 omit explicit retry budget-reset preserving run/H/cursor.
- G05 / `AC-f04-reply-suppression-005` (legacy `AC-A5`): SC-US-006-3/003-4/5 omit duplicate concurrent page and reset-during-tail cases.
- G06 / `AC-f04-reply-suppression-006` (legacy `AC-A6`): Named migration/build/mutation/canary/store-interface gates BDD absent; acceptance-a.md retains historical procedure.
- G07 / `AC-f04-reply-suppression-007` (legacy `AC-B1`): SC-US-007-4 omits expired capability and exact30day/job binding cases.
- G08 / `AC-f04-reply-suppression-008` (legacy `AC-B2`): SC-US-007-2 omits pool-recipient global withdrawal and tenant-wide campaign suppression cases.
- G09 / `AC-f04-reply-suppression-009` (legacy `AC-B3`): SC-US-007-3/4 omit operator-event dedup and malformed/foreign complaint cases.
- G10 / `AC-f04-reply-suppression-010` (legacy `AC-B4`): SC-US-007-4 omits31st/concurrent rate limit and no-store/referrer/token-log conditions.
- G11 / `AC-f04-reply-suppression-011` (legacy `AC-B5`): SC-US-006-2/5 omit30s cadence/operation timeout and disabled/local-source authority cases.
- G12 / `AC-f04-reply-suppression-012` (legacy `AC-B6`): Named local source→poll→reply plus full regression/mutation/source receipt gates BDD absent; acceptance.md and review-b-r1.md retain procedure evidence.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:cb87c85fed3776fb47bfb64e7d9e96d6b7b7bf941cebfdd5b1078aa82d239cf7. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:73a4dc62c00e08718bde936bd6fede36bd1bae07c48cf9c963d3c56a552237a6
- `02_pseudocode.md`: sha256:fc9eb9de0bfb35d568b573446aea394cf8d49d99c210025cdd5772a3db5e273d
- `03_architecture.md`: sha256:c377e4a0fcca7a28b60c9e3b2fb2a73de502152f02c77142a9c8a586619009c9
- `04_refinement.md`: sha256:416286c8f6b689d84be90dd33d13e1198a1028c3e58cfe47466e8d6cf27492b2
- `05_completion.md`: sha256:8d1e07eaff504470fb92c20acb0db9b52e6b8a1e0011e078696088c24d9dfddf
