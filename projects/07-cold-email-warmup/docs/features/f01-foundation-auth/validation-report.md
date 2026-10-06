# f01-foundation-auth contract-format validation index

Spec revision: sha256:0a62915da4cad8837bdd4c6e3387fe11453b33386537d124bb543fe3cf4bbfca
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f01-foundation-auth-001 | Legacy `AC-F01-1`; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-1` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f01-foundation-auth-002 | Legacy `AC-F01-2`; `docs/tests/security-scenarios.md` SC-US-001-3 Scenario; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-2` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f01-foundation-auth-003 | Legacy `AC-F01-3`; `docs/test-scenarios.md` SC-US-001-1 Scenario; `docs/test-scenarios.md` SC-US-001-2 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; `docs/tests/security-scenarios.md` SC-US-001-6 Examples; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-3` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f01-foundation-auth-004 | Legacy `AC-F01-4`; `docs/tests/security-scenarios.md` SC-US-001-5 Examples; `docs/tests/security-scenarios.md` SC-US-001-6 Examples; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-4` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f01-foundation-auth-005 | Legacy `AC-F01-5`; `docs/tests/security-scenarios.md` SC-US-001-5 Examples; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-5` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f01-foundation-auth-006 | Legacy `AC-F01-6`; `docs/test-scenarios.md` SC-US-001-1 Scenario; `docs/test-scenarios.md` SC-US-001-2 Scenario; `docs/tests/security-scenarios.md` SC-US-001-3 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; `docs/tests/security-scenarios.md` SC-US-001-5 Examples; `docs/tests/security-scenarios.md` SC-US-001-6 Examples; existing procedure/evidence `review-report.md # Obligations and verdicts AC-F01-6` (historical; no rerun); **VALIDATE GAP G06** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f01-foundation-auth-001` (legacy `AC-F01-1`): Runnable Compose/migration and DB-fault readiness are not named BDD; use review-report.md AC-F01-1 evidence.
- G02 / `AC-f01-foundation-auth-002` (legacy `AC-F01-2`): SC-US-001-3 omits 7day TTL/HMAC-only storage and inactive identity rejection.
- G03 / `AC-f01-foundation-auth-003` (legacy `AC-F01-3`): SC-US-001-6 has SQL syntax but not all malformed UUID classes.
- G04 / `AC-f01-foundation-auth-004` (legacy `AC-F01-4`): SC-US-001-5/6 omit exact PHC parameters, Unicode bounds and finally-release on KDF exception.
- G05 / `AC-f01-foundation-auth-005` (legacy `AC-F01-5`): SC-US-001-5 omits rejected-attempt persistence and spoofed forwarded-IP checks.
- G06 / `AC-f01-foundation-auth-006` (legacy `AC-F01-6`): Named build/license/donor/canary gate BDD absent; review-report.md AC-F01-6 supplies historical procedure evidence.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:1dd2c761ad7ede94842d0798389f1b7e66b7703da4aa97993dbcb3994c628613. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/telemetry/features/20261002T192500Z-f01/sol-receipt.md`, `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:0a62915da4cad8837bdd4c6e3387fe11453b33386537d124bb543fe3cf4bbfca
- `02_pseudocode.md`: sha256:31b005eb9b1bc15480a2a912f0bf47d1f63c650c842922a6d12dbec8c21bcdf1
- `03_architecture.md`: sha256:5fa3337a6ace31083c5b7aee436a82dc184146dfd4555fda2dd45af5615c19c8
- `04_refinement.md`: sha256:bb1f6cf2f53d8472e1b424c6ac692d793446559fde6ab40227c17366bffc4a73
- `05_completion.md`: sha256:a626345250e1774b6e62c705c433af4d53a19d6df94dd3044c5dd65ce28de8a9
