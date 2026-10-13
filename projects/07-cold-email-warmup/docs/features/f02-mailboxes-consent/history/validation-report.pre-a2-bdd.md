# f02-mailboxes-consent contract-format validation index

Spec revision: sha256:65603ddd620ddeda59392fb673994aaf41b3199f46af6d0f03bf99eabd3a9bc4
Date: 2026-10-06
Inspected source revision: c80504ac43876345084f57eb47287d5f9712f184
Verdict: format/inheritance index; substantive VALIDATE gaps remain.

This is documentation traceability, not rerun runtime acceptance or independent product review. The complete legacy requirement paragraphs and stage gates remain unchanged. Each scenario below was read; composite conditions absent from existing BDD are identified explicitly. Historical accepted runtime/source receipts retain their original revisions. A populated checker cell does not close a semantic gap. New IMPLEMENT awaits the existing planning/VALIDATE process and fresh independent review.

## Criterion scenarios
| Criterion | Scenario |
| --- | --- |
| AC-f02-mailboxes-consent-001 | Legacy `AC-F02-1`; `docs/test-scenarios.md` SC-US-002-1 Scenario; `docs/test-scenarios.md` SC-US-001-1 Scenario; `docs/tests/security-scenarios.md` SC-US-001-4 Examples; existing procedure/evidence `review-report.md AC-F02-1` (historical; no rerun); **VALIDATE GAP G01** below |
| AC-f02-mailboxes-consent-002 | Legacy `AC-F02-2`; `docs/tests/security-scenarios.md` SC-US-002-3 Examples; `docs/tests/security-scenarios.md` SC-US-002-4 Scenario; existing procedure/evidence `review-report.md AC-F02-2` (historical; no rerun); **VALIDATE GAP G02** below |
| AC-f02-mailboxes-consent-003 | Legacy `AC-F02-3`; `docs/test-scenarios.md` SC-US-002-2 Scenario; existing procedure/evidence `review-report.md AC-F02-3` (historical; no rerun); **VALIDATE GAP G03** below |
| AC-f02-mailboxes-consent-004 | Legacy `AC-F02-4`; `docs/test-scenarios.md` SC-US-003-1 Scenario; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; `docs/tests/security-scenarios.md` SC-US-004-3 Scenario; existing procedure/evidence `review-report.md AC-F02-4` (historical; no rerun); **VALIDATE GAP G04** below |
| AC-f02-mailboxes-consent-005 | Legacy `AC-F02-5`; `docs/test-scenarios.md` SC-US-003-2 Scenario; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; `docs/test-scenarios.md` SC-US-005-1 Scenario; existing procedure/evidence `review-report.md AC-F02-5` (historical; no rerun); **VALIDATE GAP G05** below |
| AC-f02-mailboxes-consent-006 | Legacy `AC-F02-6`; `docs/test-scenarios.md` SC-US-002-1 Scenario; `docs/test-scenarios.md` SC-US-002-2 Scenario; `docs/tests/security-scenarios.md` SC-US-002-3 Examples; `docs/tests/security-scenarios.md` SC-US-002-4 Scenario; `docs/test-scenarios.md` SC-US-003-1 Scenario; `docs/tests/security-scenarios.md` SC-US-003-3 Scenario; `docs/tests/security-scenarios.md` SC-US-003-4 Examples; `docs/tests/security-scenarios.md` SC-US-003-5 Examples; existing procedure/evidence `review-report.md AC-F02-6` (historical; no rerun); **VALIDATE GAP G06** below |

## Concrete remaining VALIDATE gaps

- G01 / `AC-f02-mailboxes-consent-001` (legacy `AC-F02-1`): SC-US-002-1 omits update/list settings and save0messages/unverified labels.
- G02 / `AC-f02-mailboxes-consent-002` (legacy `AC-F02-2`): SC-US-002-3/4 omit fresh nonce and distinct session/credential keys.
- G03 / `AC-f02-mailboxes-consent-003` (legacy `AC-F02-3`): SC-US-002-2 omits all reserved/mixed DNS cases, pinned IP/TLS peername and connection timeout boundaries; review-r1-report.md R1 is historical test evidence.
- G04 / `AC-f02-mailboxes-consent-004` (legacy `AC-F02-4`): SC-US-003-3 omits actor/time/disclosure version and recipient fingerprint expansion.
- G05 / `AC-f02-mailboxes-consent-005` (legacy `AC-F02-5`): SC-US-003-4/5 omit FIRST-lock ordering as a distinct BDD assertion and exact default/provider/pilot limit.
- G06 / `AC-f02-mailboxes-consent-006` (legacy `AC-F02-6`): Named full regression/type/lint/build/security procedure BDD absent; review-report.md and review-r1-report.md retain checks.

These are documentary coverage gaps, distinct from the external F06 GitHub403 delivery blocker. Do not infer PASS from historical procedure evidence or invent a scenario. Coordinator resolves them through existing planning before new code.

## Role-path migration and preserved history

Archive: `history/validation-report.pre-contract-format.md`, sha256:3e4782569cd32a9a408ec9fab1af858d8a011865443e9b1623e163a4df6cd3f2. Historical report bytes are unchanged; this archive is not an additional active role contour.

| Former role | Unique active role |
| --- | --- |
| `01-specification.md` | `01_specification.md` |
| `02-pseudocode.md` | `02_pseudocode.md` |
| `03-architecture.md` | `03_architecture.md` |
| `04-refinement.md` | `04_refinement.md` |
| `05-completion.md` | `05_completion.md` |

Historical basenames retaining former paths: `docs/telemetry/features/20261002T201500Z-f02/astra-review-receipt.md`, `docs/telemetry/features/20261002T201500Z-f02/sol-receipt.md`, `docs/telemetry/p-replicator/20261006T090602Z-n7-expanded-mvp-a1/evidence/contract-route/plan.md`. Resolve their old role basename through the unique active path in this feature above; never rewrite historical evidence.

## Dirty input digests

- `01_specification.md`: sha256:65603ddd620ddeda59392fb673994aaf41b3199f46af6d0f03bf99eabd3a9bc4
- `02_pseudocode.md`: sha256:f686614535f57c7a938524b25fa130939fe33c27280cee8063edb7e3e3aaee31
- `03_architecture.md`: sha256:1b85a0b86475e9564bb6c97591f462bd2024a79975ba9c02605038102924f52b
- `04_refinement.md`: sha256:92c4515c8a3d385316a431c4ebc42fe2e0dd71be7f9911c246b06336df736e93
- `05_completion.md`: sha256:53f532942f38356d556cde24f457b17af79e289455188ecd2ff17b42009be035
