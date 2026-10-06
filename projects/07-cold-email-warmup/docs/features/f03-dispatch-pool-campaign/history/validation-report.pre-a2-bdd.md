# f03-dispatch-pool-campaign contract-format validation index

Spec revision: sha256:6f88ae14deba475af0edfb89c37ec452d34c85df44b9e5c8aefeed802b36566f
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f03-dispatch-pool-campaign-001 | Legacy `AC-A1`; `docs/test-scenarios.md` SC-US-005-2 Examples; `docs/tests/security-scenarios.md` SC-US-005-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; `docs/test-scenarios.md` SC-US-001-1 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f03-dispatch-pool-campaign-002 | Legacy `AC-A2`; `docs/test-scenarios.md` SC-US-003-1 Scenario; `docs/test-scenarios.md` SC-US-003-2 Scenario; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f03-dispatch-pool-campaign-003 | Legacy `AC-A3`; `docs/test-scenarios.md` SC-US-004-1 Scenario; `docs/test-scenarios.md` SC-US-004-2 Scenario; `docs/tests/security-scenarios.md` SC-US-004-3 Scenario; `docs/tests/security-scenarios.md` SC-US-004-4 Scenario; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f03-dispatch-pool-campaign-004 | Legacy `AC-A4`; `docs/test-scenarios.md` SC-US-005-1 Scenario; `docs/test-scenarios.md` SC-US-005-3 Scenario; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f03-dispatch-pool-campaign-005 | Legacy `AC-A5`; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f03-dispatch-pool-campaign-006 | Legacy `AC-A6`; `docs/test-scenarios.md` SC-US-005-1 Scenario; `docs/test-scenarios.md` SC-US-005-2 Examples; `docs/test-scenarios.md` SC-US-004-2 Scenario; `docs/tests/security-scenarios.md` SC-US-004-4 Scenario; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G06** below |
| AC-f03-dispatch-pool-campaign-007 | Legacy `AC-B1`; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; `docs/tests/security-scenarios.md` SC-US-005-5 Scenario; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G07** below |
| AC-f03-dispatch-pool-campaign-008 | Legacy `AC-B2`; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun) |
| AC-f03-dispatch-pool-campaign-009 | Legacy `AC-B3`; `docs/tests/security-scenarios.md` SC-US-004-3 Scenario; `docs/test-scenarios.md` SC-US-007-1 Scenario; `docs/tests/security-scenarios.md` SC-US-007-5 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G09** below |
| AC-f03-dispatch-pool-campaign-010 | Legacy `AC-B4`; `docs/test-scenarios.md` SC-US-005-3 Scenario; `docs/tests/security-scenarios.md` SC-US-005-6 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun) |
| AC-f03-dispatch-pool-campaign-011 | Legacy `AC-B5`; `docs/tests/security-scenarios.md` SC-US-005-5 Scenario; `docs/tests/security-scenarios.md` SC-US-005-6 Examples; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G11** below |
| AC-f03-dispatch-pool-campaign-012 | Legacy `AC-B6`; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; `docs/tests/security-scenarios.md` SC-US-005-5 Scenario; `docs/tests/security-scenarios.md` SC-US-005-6 Examples; existing procedure/evidence `acceptance.md # F03 acceptance` (historical; no rerun); **VALIDATE GAP G12** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f03-dispatch-pool-campaign-001` (legacy `AC-A1`): SC-US-005-2/4 omit max5 steps/max100 recipients/delay24h and durable edit/start/pause API state.
- G02 / `AC-f03-dispatch-pool-campaign-002` (legacy `AC-A2`): SC-US-003-1/2 omit durable job uniqueness and encrypted recipient/keyed hash storage.
- G03 / `AC-f03-dispatch-pool-campaign-003` (legacy `AC-A3`): SC-US-004-1..4 omit freshly polled eligibility as a pool selection assertion.
- G04 / `AC-f03-dispatch-pool-campaign-004` (legacy `AC-A4`): SC-US-005-1/3 omit45s lease recovery, default10/provider limit and equal-clock sender rotation.
- G05 / `AC-f03-dispatch-pool-campaign-005` (legacy `AC-A5`): SC-US-006-5 omits prohibition of public fabricated-poll endpoints.
- G06 / `AC-f03-dispatch-pool-campaign-006` (legacy `AC-A6`): Named mutation/build/full F01/F02 regression BDD absent; acceptance.md F03 acceptance retains historical gates.
- G07 / `AC-f03-dispatch-pool-campaign-007` (legacy `AC-B1`): SC-US-003-4/006-5/005-5 omit lease-owner/operator-gate checks as individually named cases.
- G09 / `AC-f03-dispatch-pool-campaign-009` (legacy `AC-B3`): SC-US-004-3/007-5 omit durable Message-ID matching and SMTP submitted-versus-inbox wording.
- G11 / `AC-f03-dispatch-pool-campaign-011` (legacy `AC-B5`): SC-US-005-5/6/006-5 omit exact lease expiry and operator-only tick authority.
- G12 / `AC-f03-dispatch-pool-campaign-012` (legacy `AC-B6`): Named final-guard mutation/build/fresh-review BDD absent; acceptance.md and review-b-r1.md retain procedure evidence.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:d299eb53621853edcae48b5df00b23ad1a0d0ea8669c458815d6c8d35e1b6680. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/features/f03-dispatch-pool-campaign/review-b-r1.md`, `docs/telemetry/features/20261002T211800Z-f03/astra-a-r1-receipt.md`, `docs/telemetry/features/20261002T211800Z-f03/sol-a-receipt.md`, `docs/telemetry/features/20261002T211800Z-f03/sol-b-receipt.md`, `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:6f88ae14deba475af0edfb89c37ec452d34c85df44b9e5c8aefeed802b36566f
- `02_pseudocode.md`: sha256:9d6ee16da9efa48b6e1727a9eb5f9d3be77ee784e9a94a22b264b754b5682244
- `03_architecture.md`: sha256:3c03d54097421a208cd4676187a65a6ad61ea077c94518fa1e5e25fe956abd77
- `04_refinement.md`: sha256:7a7719f5df35dea3e0106e9a0d398c78a32e3e3623f460bf8fbe838e5414dc1a
- `05_completion.md`: sha256:2448c0d7a2e6eb41202c3234b00ab6d206e7e28b670ddeec4ebbdc55b5445b52
