# f06-cabinet-e2e-delivery contract-format validation index

Spec revision: sha256:044d738715cc33c29c453805648b209176ecdcf12c8c8c7320b2e7cd3265e1ce
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f06-cabinet-e2e-delivery-001 | Legacy `AC-A1`; `docs/test-scenarios.md` SC-US-001-2 Scenario; `docs/tests/security-scenarios.md` SC-US-001-3 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; existing procedure/evidence `review-a-r1.md # F06a R1 independent review` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f06-cabinet-e2e-delivery-002 | Legacy `AC-A2`; `docs/test-scenarios.md` SC-US-002-1 Scenario; `docs/test-scenarios.md` SC-US-003-1 Scenario; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; `docs/test-scenarios.md` SC-US-004-2 Scenario; `docs/tests/security-scenarios.md` SC-US-004-3 Scenario; `docs/tests/security-scenarios.md` SC-US-006-5 Examples; existing procedure/evidence `review-b.md B2` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f06-cabinet-e2e-delivery-003 | Legacy `AC-A3`; `docs/test-scenarios.md` SC-US-005-2 Examples; `docs/tests/security-scenarios.md` SC-US-005-4 Examples; `docs/test-scenarios.md` SC-US-003-1 Scenario; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; existing procedure/evidence `review-b.md B2` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f06-cabinet-e2e-delivery-004 | Legacy `AC-A4`; `docs/test-scenarios.md` SC-US-008-1 Scenario; `docs/test-scenarios.md` SC-US-008-2 Scenario; `docs/tests/security-scenarios.md` SC-US-008-3 Examples; `docs/test-scenarios.md` SC-US-010-1 Scenario; `docs/test-scenarios.md` SC-US-010-2 Scenario; `docs/test-scenarios.md` SC-US-010-3 Scenario; existing procedure/evidence `review-b.md B2` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f06-cabinet-e2e-delivery-005 | Legacy `AC-A5`; `docs/test-scenarios.md` SC-US-009-2 Scenario; `docs/tests/security-scenarios.md` SC-US-009-3 Scenario; `docs/test-scenarios.md` SC-US-011-2 Scenario; `docs/test-scenarios.md` SC-US-013-1 Scenario; `docs/test-scenarios.md` SC-US-013-2 Scenario; existing procedure/evidence `review-b.md B2` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f06-cabinet-e2e-delivery-006 | Legacy `AC-A6`; existing procedure/evidence `review-a-r1.md # F06a R1 independent review` (historical; no rerun); **VALIDATE GAP G06** below |
| AC-f06-cabinet-e2e-delivery-007 | Legacy `AC-B1`; existing procedure/evidence `review-b.md B1; review-b-r3.md # F06B003 final independent closure` (historical; no rerun); **VALIDATE GAP G07** below |
| AC-f06-cabinet-e2e-delivery-008 | Legacy `AC-B2`; `docs/test-scenarios.md` SC-US-006-1 Scenario; `docs/test-scenarios.md` SC-US-007-1 Scenario; `docs/test-scenarios.md` SC-US-007-2 Scenario; `docs/test-scenarios.md` SC-US-007-3 Scenario; `docs/tests/security-scenarios.md` SC-US-007-4 Examples; `docs/tests/security-scenarios.md` SC-US-007-5 Examples; `docs/tests/security-scenarios.md` SC-US-009-3 Scenario; existing procedure/evidence `review-b.md B2; review-b-r3.md # F06B003 final independent closure` (historical; no rerun); **VALIDATE GAP G08** below |
| AC-f06-cabinet-e2e-delivery-009 | Legacy `AC-B3`; `docs/test-scenarios.md` SC-US-001-1 Scenario; `docs/test-scenarios.md` SC-US-001-2 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; existing procedure/evidence `review-b.md B3; review-b-r3.md # F06B003 final independent closure` (historical; no rerun); **VALIDATE GAP G09** below |
| AC-f06-cabinet-e2e-delivery-010 | Legacy `AC-B4`; existing procedure/evidence `review-b.md B4; review-b-r3.md # F06B003 final independent closure` (historical; no rerun); **VALIDATE GAP G10** below |
| AC-f06-cabinet-e2e-delivery-011 | Legacy `AC-B5`; existing procedure/evidence `../../Completion.md # Документы, воспроизведение и поставка` (historical; no rerun); **VALIDATE GAP G11** below |
| AC-f06-cabinet-e2e-delivery-012 | Legacy `AC-B6`; existing procedure/evidence `../../Completion.md # Внешний blocker и готовая передача` (historical; no rerun); **VALIDATE GAP G12** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f06-cabinet-e2e-delivery-001` (legacy `AC-A1`): Auth SC-US-001 lacks cabinet navigation, request epoch/abort, passive-tab and DOM clearing BDD; review-a-r1.md exact trigger supplies historical verification.
- G02 / `AC-f06-cabinet-e2e-delivery-002` (legacy `AC-A2`): Mailbox/consent scenarios lack browser forms/secret clearing/reload and explicit labels; review-b.md B2 supplies historical journey.
- G03 / `AC-f06-cabinet-e2e-delivery-003` (legacy `AC-A3`): Dispatch BDD lacks browser import/form, actionable blocked state and reconsent journey; review-b.md B2 supplies historical journey.
- G04 / `AC-f06-cabinet-e2e-delivery-004` (legacy `AC-A4`): Evidence BDD lacks browser input/compare/copy/revoke and textContent assertions; review-b.md B2 supplies historical journey.
- G05 / `AC-f06-cabinet-e2e-delivery-005` (legacy `AC-A5`): Billing BDD lacks browser stable-key retry/clipboard fallback/status refresh; review-b.md B2 supplies historical journey.
- G06 / `AC-f06-cabinet-e2e-delivery-006` (legacy `AC-A6`): Named UI CSP/session-mutation/build/canary procedure BDD absent; review-a-r1.md and review-a.md A6 retain historical checks.
- G07 / `AC-f06-cabinet-e2e-delivery-007` (legacy `AC-B1`): Named three-engine viewport/keyboard/reduced-motion/preflight/cleanup BDD absent; review-b.md B1 and review-b-r3.md final closure retain exact procedures.
- G08 / `AC-f06-cabinet-e2e-delivery-008` (legacy `AC-B2`): Domain BDD lacks the whole real-click/reload/operator fixture journey; review-b.md B2 and copied harness procedures retain historical evidence.
- G09 / `AC-f06-cabinet-e2e-delivery-009` (legacy `AC-B3`): Tenant BDD lacks delayed-response epoch/mobile loading/offline and trace-secret assertions; review-b.md B3 supplies historical verification.
- G10 / `AC-f06-cabinet-e2e-delivery-010` (legacy `AC-B4`): Named100samples/concurrency10/CPU2 p95 and source-bound operations BDD absent; review-b.md B4 and review-b-r3.md supply historical measurements.
- G11 / `AC-f06-cabinet-e2e-delivery-011` (legacy `AC-B5`): Named documentation/toolkit/12AC telemetry procedure BDD absent; ../../Completion.md Документы, воспроизведение и поставка retains delivery evidence.
- G12 / `AC-f06-cabinet-e2e-delivery-012` (legacy `AC-B6`): Named commit/push/PR target/deployment checkpoint procedure BDD absent; ../../Completion.md Внешний blocker и готовая передача records PR403 blocked.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:970f0b6fa6f7355bd92282e7fafa2610f2862fa57a363ec5cafffad823f77a4c. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/features/f06-cabinet-e2e-delivery/review-b.md`, `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:044d738715cc33c29c453805648b209176ecdcf12c8c8c7320b2e7cd3265e1ce
- `02_pseudocode.md`: sha256:ae51c0ba21e1594e371dc3e6e6e9ebb047cd673161be0e4a967c1ce09bb8719b
- `03_architecture.md`: sha256:dda20e26a470e82f5172fd4f8a8d8a1b4531c18349fa79ed9c60a95ad383c962
- `04_refinement.md`: sha256:5850acd92c0b7717258966ff53455ed11a8a2c6c4b57f0f81f59334bef205792
- `05_completion.md`: sha256:860dee6adc7a82ea9330918b652dd3807eae3dc896dd7f6daa08e717203aaebc

F06 legacy AC-B6 delivery remains blocked by GitHub403 as recorded in `05_completion.md` and canonical Completion. No fresh runtime PASS or PR creation follows from this repair.
