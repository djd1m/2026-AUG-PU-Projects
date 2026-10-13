Implemented both bounded corrections. The candidate is ready for coordinator integration; runtime acceptance remains pending.

- Cleanup now preserves progress across CLI processes with separate disk cursors and budgets for the main directory and `.tmp`. UUID, symlink, live-reference and age protections remain. File/DB inspections are bounded; directory-name enumeration remains proportional to directory size.
- Owner mutation now requires a successful baseline, a confirmed guard change, and the exact tagged cross-owner assertion failure. Unrelated 404s, timeouts, spawn errors and no-op guards are rejected.

Changed: `web/media.js`, `scripts/mutation.js`, `tests/integration.test.js`; added `tests/mutation.test.js` and `tests/sweep-pass.js`; updated correction notes, added a fresh source snapshot and unique telemetry/receipt files. Original snapshot and review receipt were preserved. No commit attempted.

| Executed check | Exit | Result |
|---|---:|---|
| Static/ESM build | 0 | Passed |
| Existing unit tests | 0 | 12 passed |
| Mutation harness controls | 0 | 2 passed |
| Actual Origin mutation | 0 | Baseline 0; targeted mutant failure 1 |
| Owner harness without PostgreSQL | 1 | Expected baseline rejection |
| Diff, scope and snapshot verification | 0 | Passed; all 26 hashes verified |

Pending: real PostgreSQL16 integration regression, actual owner mutation against PostgreSQL, and independent review. Synthetic harness controls do **not** establish actual owner-mutant detection.

```text
RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-f01-fix
ATTEMPT_ID: n8-f01-fix-attempt-1
Source-Revision: 2be5edf066b44cdfe1f424608fd1c4cb5f8c394e
Launch-SHA256: d1678e14bfdd42e23f16248ff882aad866a299e0f2750931a3a1874615946180
Build-Revision: 1ce74fa5197e2dfb2ee4e0d74500bdc4d480ad2113ce9749c40acf1db49c2118
```

Profile: `compact-quality-first-v2`; requested model/effort: `gpt-6.1-sol/high`. Provider-resolved model, effort, tokens, cost and active time are unavailable (`null`). No delegation or model switch. Observed launch-to-receipt duration: **583.441 seconds**, within the 20-minute budget.

[Full substantive receipt and telemetry references](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n8-replicate/.claude/worktrees/n8-f01-fix/projects/08-interior-ai-redesign/docs/telemetry/n8-20261002-1740/n8-f01-fix-receipt.md)

Status: completed