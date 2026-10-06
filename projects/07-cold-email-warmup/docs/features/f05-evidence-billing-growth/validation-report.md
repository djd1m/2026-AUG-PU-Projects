# f05-evidence-billing-growth contract-format validation index

Spec revision: sha256:ac249fab21a4dbf9c35ffd81daa5bd5874df3aa431b4cdedbfa28ea2adf66d0c
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f05-evidence-billing-growth-001 | Legacy `AC-A1`; `docs/test-scenarios.md` SC-US-009-2 Scenario; existing procedure/evidence `review-a.md AC-A1` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f05-evidence-billing-growth-002 | Legacy `AC-A2`; `docs/test-scenarios.md` SC-US-011-1 Scenario; `docs/test-scenarios.md` SC-US-011-2 Scenario; `docs/test-scenarios.md` SC-US-011-3 Examples; `docs/test-scenarios.md` SC-US-013-2 Scenario; existing procedure/evidence `review-a.md AC-A2` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f05-evidence-billing-growth-003 | Legacy `AC-A3`; `docs/test-scenarios.md` SC-US-009-1 Scenario; `docs/test-scenarios.md` SC-US-009-2 Scenario; existing procedure/evidence `review-a.md AC-A3` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f05-evidence-billing-growth-004 | Legacy `AC-A4`; `docs/tests/security-scenarios.md` SC-US-009-3 Scenario; `docs/tests/security-scenarios.md` SC-US-009-4 Examples; existing procedure/evidence `review-a.md AC-A4` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f05-evidence-billing-growth-005 | Legacy `AC-A5`; `docs/test-scenarios.md` SC-US-009-1 Scenario; `docs/tests/security-scenarios.md` SC-US-009-3 Scenario; `docs/tests/security-scenarios.md` SC-US-009-4 Examples; `docs/test-scenarios.md` SC-US-011-1 Scenario; `docs/test-scenarios.md` SC-US-011-3 Examples; `docs/test-scenarios.md` SC-US-013-1 Scenario; `docs/test-scenarios.md` SC-US-013-3 Examples; existing procedure/evidence `review-a.md AC-A5` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f05-evidence-billing-growth-006 | Legacy `AC-A6`; `docs/tests/security-scenarios.md` SC-US-009-3 Scenario; `docs/tests/security-scenarios.md` SC-US-009-4 Examples; `docs/test-scenarios.md` SC-US-011-3 Examples; `docs/test-scenarios.md` SC-US-013-3 Examples; existing procedure/evidence `review-a.md AC-A6` (historical; no rerun); **VALIDATE GAP G06** below |
| AC-f05-evidence-billing-growth-007 | Legacy `AC-B1`; `docs/test-scenarios.md` SC-US-008-1 Scenario; `docs/test-scenarios.md` SC-US-008-2 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B1` (historical; no rerun); **VALIDATE GAP G07** below |
| AC-f05-evidence-billing-growth-008 | Legacy `AC-B2`; `docs/tests/security-scenarios.md` SC-US-008-3 Examples; `docs/test-scenarios.md` SC-US-010-2 Scenario; `docs/test-scenarios.md` SC-US-010-3 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B2` (historical; no rerun); **VALIDATE GAP G08** below |
| AC-f05-evidence-billing-growth-009 | Legacy `AC-B3`; `docs/test-scenarios.md` SC-US-010-1 Scenario; `docs/test-scenarios.md` SC-US-010-3 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B3` (historical; no rerun); **VALIDATE GAP G09** below |
| AC-f05-evidence-billing-growth-010 | Legacy `AC-B4`; `docs/test-scenarios.md` SC-US-012-1 Scenario; `docs/test-scenarios.md` SC-US-012-2 Scenario; `docs/test-scenarios.md` SC-US-012-3 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B4` (historical; no rerun); **VALIDATE GAP G10** below |
| AC-f05-evidence-billing-growth-011 | Legacy `AC-B5`; `docs/test-scenarios.md` SC-US-013-1 Scenario; `docs/test-scenarios.md` SC-US-013-2 Scenario; `docs/test-scenarios.md` SC-US-013-3 Examples; `docs/test-scenarios.md` SC-US-010-1 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B5` (historical; no rerun); **VALIDATE GAP G11** below |
| AC-f05-evidence-billing-growth-012 | Legacy `AC-B6`; `docs/tests/security-scenarios.md` SC-US-008-3 Examples; `docs/test-scenarios.md` SC-US-010-1 Scenario; `docs/test-scenarios.md` SC-US-010-3 Scenario; `docs/test-scenarios.md` SC-US-012-1 Scenario; `docs/test-scenarios.md` SC-US-012-2 Scenario; `docs/test-scenarios.md` SC-US-012-3 Scenario; existing procedure/evidence `05_completion.md # Criterion coverage AC-B6` (historical; no rerun); **VALIDATE GAP G12** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f05-evidence-billing-growth-001` (legacy `AC-A1`): SC-US-009-2 omits free3/team10 resource concurrency, expiry retention and immutable TEST100RUB/30days config.
- G02 / `AC-f05-evidence-billing-growth-002` (legacy `AC-A2`): SC-US-011/013 omit30day cookie boundary and post-intent deactivation frozen-snapshot case.
- G03 / `AC-f05-evidence-billing-growth-003` (legacy `AC-A3`): SC-US-009-1/2 omit changed-payload409, parallel checkout and crash-before-binding recovery.
- G04 / `AC-f05-evidence-billing-growth-004` (legacy `AC-A4`): SC-US-009-3/4 omit operator/body bounds and fetch-outside-lock/version race cases.
- G05 / `AC-f05-evidence-billing-growth-005` (legacy `AC-A5`): SC-US-009/011/013 omit paidAt fixed30day expiry and delayed success/cancel barrier.
- G06 / `AC-f05-evidence-billing-growth-006` (legacy `AC-A6`): Named build/donor/source/mutation/full-regression BDD absent; review-a.md A6 retains historical procedure evidence.
- G07 / `AC-f05-evidence-billing-growth-007` (legacy `AC-B1`): SC-US-008-1/2 omit finite/direction/window input and no URL-fetch assertions.
- G08 / `AC-f05-evidence-billing-growth-008` (legacy `AC-B2`): SC-US-008-3 omits declared direction and both-denominator requirement as named cases.
- G09 / `AC-f05-evidence-billing-growth-009` (legacy `AC-B3`): SC-US-010-1/3 omit concurrent share/idempotency-payload and complete public whitelist assertions.
- G10 / `AC-f05-evidence-billing-growth-010` (legacy `AC-B4`): SC-US-012 omits revoked token, historical stale label and no-active-content cases.
- G11 / `AC-f05-evidence-billing-growth-011` (legacy `AC-B5`): SC-US-013/010 omit bounded pagination and explicit copy/link event idempotence.
- G12 / `AC-f05-evidence-billing-growth-012` (legacy `AC-B6`): Named concurrent share/badge mutation/full regression gates BDD absent; review-b-r1.md retains historical procedure evidence.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:43b6219c7a61413c1c3c2e320399b1f6e5cd98fddc6bec4b3c7e91dab5e4b6ac. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:ac249fab21a4dbf9c35ffd81daa5bd5874df3aa431b4cdedbfa28ea2adf66d0c
- `02_pseudocode.md`: sha256:2b99ad3df28594485f33c3fd73cfe01cc4d5df9c78f07f210c1eeeb08ea5c1a5
- `03_architecture.md`: sha256:86a4f3b60e821ce30f303886a7f67f2cafe2c43da5678a25243b4fd8d047fece
- `04_refinement.md`: sha256:135d97debff4e516f5e1b9514108ffbfd53016cecc7ce16613dd890f72e59b0c
- `05_completion.md`: sha256:cad4dca2db1ed7b37fe63e59242090143e49a2497bd5cd0402fc8c7a5b1fa967
