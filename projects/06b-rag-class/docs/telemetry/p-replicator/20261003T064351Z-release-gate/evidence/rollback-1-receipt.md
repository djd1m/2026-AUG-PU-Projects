**Mandatory rollback remains blocked by disk space. No runtime rollback pass is claimed.**

- **Run:** `20261003T064351Z-release-gate`
- **Work unit / attempt:** `release-gate-local-rollback` / `rollback-1`
- **Source:** `86d4b0ceedc348f85f3e65de2ebfb272528b1801`
- **Launch SHA256:** `a3db258a4bc5475e28a34147bd0d5d9494ad2240815be3dbd4e2eea81a6330e4`

The corrected `--execute` preflight returned **75** before any build or container startup: **1,126,559,744 bytes available**, versus the runner’s conservative **6 GiB** requirement. That threshold is a safety estimate, not measured build consumption.

Verified cached image/source identities:

| Component | Local image ID | Tested source |
|---|---|---|
| Current web, `n6b-f15-source-management-web:corrected` | `sha256:d518d2e9eacfae4b0646aa161253b9edc5a78375b9935b267cdb6d467d220b1e` | `b3df79f3c748c426d7eac16717008ccd121eb10e` |
| Previous web, `n6b-f14-handover-web:20261003` | `sha256:3ed4f43381dc4acff4d74aba9155c187f89747d626d39f04a9018bd627cbb2d5` | `edf7d770f021831d115d347e1532cea102e1c098` |

Both canonical worker images remain absent. **Actual container bindings and rollback build revision are null.**

Passed: runner syntax/import checks, disk guard controls and mutation, portless/internal compose configuration, configured CPU=2 envelope, nonempty source manifests, and equality of all five F14/F15 SQL migrations. The initial empty-manifest probe was preserved and superseded by the corrected result.

**Not executed:** worker PostgreSQL query loops, web health/auth/bootstrap, actual switching of both image tags, and seed/session/schema preservation. Build and runtime branches remain unvalidated.

Artifacts:

- [Full terminal receipt](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/telemetry/p-replicator/20261003T064351Z-release-gate/evidence/rollback-1-receipt.md)
- [Rollback report](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/docs/features/release-gate/12_rollback.md)
- [Prepared runner](/home/dz-projects-2026/2026-AUG-PU-Projects/2026-AUG-PU-Projects/.claude/worktrees/n6b-release-gate/projects/06b-rag-class/tests/artifacts/release-gate/rollback-runner.py)

Receipt SHA256: `356d3bea77c8bb21fd8b0a8f09676650bab26e57cb3c56263653ed0e08ac4e57`

Cleanup verified: private directories removed; no owned Docker resources created. No shared prune, product edits, commit/push, provider calls, or deployment occurred. Coordinator-owned telemetry was preserved.

Profile: `compact-quality-first-v2`; requested `gpt-6.1-sol/high`, one executor, no children. Actual model/effort and token/cost usage are unavailable. Elapsed through final verification: approximately **738 seconds**, within 900 seconds.

The parent coordinator owns the next bounded attempt after disk headroom becomes available, using fresh launch/receipt identities and `--execute --prefix rollback-2`. **No continuation is running. F16 remains pending rollback, live/public-stand checks, and NFR.**

Status: failed