# Phase2 — validation state

Initial independent review is **NEEDS_WORK** at source07d47977. Immutable [report and terminal receipt](telemetry/n8-20261002-1740/n8-validate-1-receipt.md) is preserved byte-for-byte; completed receipt is delivery, not approval. All13 requirement scores≥72, no missing-artifact floor; six semantic/coverage findings keep implementation gate closed until fresh revalidation. Current corrections are in [finding resolution](validation-fixes-1.md).

## Current deterministic evidence

| Gate | Exit | Meaning / receipt |
|---|---|---|
| docs-complete / external-deps / growth-trace / handoff-manifest | 0 | docs-fix-1-gates.json, declaration/identity only |
| look-origin | historical1, corrected0 | phase1-gates.json and look-origin-correction.json; current0 retained, no fabricated third-party snapshot |
| look-trace | 2 | authenticated source path unmeasured; appearance-only evidence |
| embed-contract | 2 | explicit standalone/no-widget declaration now exists; applicability, not runtime pass |
| job-contract | 2 | no-worker; deadlines and ticket contract documented, not executed |
| webhook-contract | 2 | not-implemented; authenticated provider GET and replay/order tests pending |
| model-cost | 2 | no external model API; self-hosted attempt caps still require tests |
| AC identity consistency | 0 |41 unique AC IDs,57 named scenarios; every AC references an existing name, semantic sufficiency still independently reviewed |

Receipts are under `telemetry/n8-20261002-1740/`. Historical failures are not overwritten. No shared hook changed. Fixed spec digest is recorded in docs-fix-1-gates.json; code/runtime/GPU acceptance remains pending. Generic signature-only expectations cannot be satisfied with an invented YooKassa signature.

## Clock and measurement reconciliation
CLI wrapper interval18:27:24–18:35:35Z is491s. Reviewer's18:31:41 sample preceded completion of the final response; its240s observation interval is retained as a different partial measurement. Host banner confirms gpt-6-astra/OpenAI, high was requested and banner-reported; provider billing/token usage remains unavailable. Corrections do not edit either historical clock value.
