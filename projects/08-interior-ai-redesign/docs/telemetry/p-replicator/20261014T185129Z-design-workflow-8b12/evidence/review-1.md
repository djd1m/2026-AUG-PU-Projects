# Independent bounded review
Run: 20261014T185129Z-design-workflow-8b12
Work unit: review-1
Launch: review-launch.json
Launch SHA256: 7653fe917feed005ebda9d84c16f88f0385566c403ecca5aedd0c2e68b2d9149
Source: current dirty worktree, individual hashes below.
Requested model: Astra; actual model: unknown (not exposed by execution metadata).
Finished: 2026-10-14T18:56:39.420909+00:00
Verdict: changes_requested
FinalStatus: completed

P2 finding — DesignPanel.tsx deletion handler resets selected but leaves scene/style/referenceIds. When a historical preview is deleted, currentDesignId/current scene stay unchanged, so activeKey does not rerun hydration. The deleted scene remains rendered while shown resolves current and may label it approved. Explicitly reset displayed data to surviving current design or blank shell after deletion. Sent to integration owner immediately.

No security blocker identified: DELETE passes existing mutation guard and expectedVersion; owning project row lock serializes approve/remove; lifecycle-only update retains immutable content/FKs; current pointers clear only for active design; shares revoke in same transaction; get/list/restore/approve exclude deleted state. Parent references may still point to retained deleted revisions, preserving lineage. Manual proposal goes through validated create endpoint with explicit no-LLM/image-analysis disclosure. GLB pointer mapping uses internal metadata with legacy fallback. Required JobsCard props are wired in current source.

Checks: static code review only. No test/build/E2E pass claimed; owner is running suite/build. E2E preflight not_applicable: reviewer did not execute E2E. No external provider calls or guard changes performed. Usage/cost null: counters unavailable. Source files changed concurrently if hash mismatch below; final owner must bind checks to final source.

- `packages/db/src/design/revisions.ts`: 9dc07b5cac692be6d17de81d6e5a0409b67f7eee810ad5ed052a0b47e149edc1; launch match: True
- `packages/db/src/migrations/006-design-removal.sql`: 91c30b01442d7eeecf3e231b4a2fbbaa6c3c3c6e2710fe642b2356e0439c85a6; launch match: True
- `packages/viewer/src/renderer.ts`: 79f0577f20f0a86522f509ea3ffd6e67860cf323459a0bd716a1d5a28e633780; launch match: True
- `apps/web/src/components/DesignPanel.tsx`: 47de0d4d7f8f497cf53328a5e9de751dcfdf465d75a1c6976ef8d8f0f6990705; launch match: True
- `apps/web/src/components/JobsCard.tsx`: 1c10f123ca4982219f233304df9a21f8bf14a22597ee908c33ce968aaa164684; launch match: True
- `apps/web/src/server/design.ts`: cb1b84ed50402c737eb75d15199aa008fcf59c8b329fe3a57a7057f2f9598d43; launch match: True

Status: completed
