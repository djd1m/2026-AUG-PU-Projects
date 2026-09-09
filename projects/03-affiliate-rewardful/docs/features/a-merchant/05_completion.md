# Completion — A merchant F1

A standalone F1 candidate passed its eight acceptance criteria. Implementation12ee9c0, shared38/38tests + actual Firefox13/13tests (12 scenarios), independent reviewA1/A2 resolved, five current HTTP/registry mutants killed plus three earlier core invariants killed. Build checked39available modules. API and A Docker images built and healthy; DB internal/no host bindings; API processuid1000; A frontend only in n3-frontend. Exact evidence and limitations in review-report.md and telemetry.

Global packaged completion scans all five predeclared features and project; it remains pending until B/C/D are implemented. This is acceptance of A within F1, not completion of the batch or production-money release.

## Criterion coverage

| Criterion | Test file | Test title |
|---|---|---|
| AC-a-merchant-1011 | tests/e2e/a-merchant.mjs | SC-US-101-1 saved policy is visible and survives reload |
| AC-a-merchant-1012 | tests/e2e/a-merchant.mjs | SC-US-101-2 missing rate cannot publish and field remains repairable |
| AC-a-merchant-1021 | tests/e2e/a-merchant.mjs | SC-US-102-1 confirmed fixture payment displays its rule and reward once |
| AC-a-merchant-1022 | tests/e2e/a-merchant.mjs | SC-US-102-2 refund and replay of same payment preserve correction and stale registry guard |
| AC-a-merchant-1031 | tests/e2e/a-merchant.mjs | SC-US-103-1 registry approval exports exact version with exclusions |
| AC-a-merchant-1032 | tests/e2e/a-merchant.mjs | SC-US-103-2 manual send is separate and persists actor, date and evidence |
| AC-a-merchant-1041 | tests/e2e/a-merchant.mjs | SC-US-104-1 invitation opens enrollment terms and never a referral link |
| AC-a-merchant-1042 | tests/e2e/a-merchant.mjs | SC-US-104-2 owner opens revised deterministic agent artifact in A |
