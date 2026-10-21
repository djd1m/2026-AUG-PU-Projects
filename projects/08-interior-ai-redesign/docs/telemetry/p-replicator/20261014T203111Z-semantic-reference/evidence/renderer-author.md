# Renderer author receipt

WORK_UNIT_ID: semantic_geometry_renderer
RUN_ID: 20261014T203111Z-semantic-reference
Baseline: fb07c8c9
Profile: compact-quality-first-v2
Actual model: null (host metadata unavailable)
Usage/cost/elapsed: null (no measured counters or launch timestamp available)
Finished: 2026-10-14T20:42:05.356061+00:00

## Exact artifacts
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/renderer.ts` SHA256 `d27d3217feee7c9c30a837c4a883361653e0fc45338a7fb2f669f9bc83e71ab8`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/types.ts` SHA256 `17301eecf908e8c1ca41a41ac92639664d5d33cbed3b515b6e76a6d715a486f8`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/semantic-segmentation.ts` SHA256 `e165ee43e195fa8dcd85c43ddc8e19d65f45e461ca3fb4076659a47356386c7f`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/tests/design/semantic-segmentation.test.ts` SHA256 `042f7e88c6f1fff517c94c6d55b61476942224b8d4d439b51ec0d0f0e022313d`

## Checks
- `node node_modules/vitest/vitest.mjs run tests/design/semantic-segmentation.test.ts`: exit 0, 5 tests passed, including Babylon NullEngine material partition, Before restoration, clearing overlay, imported-material survival, position/UV preservation and unsupported MultiMaterial exclusion.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler packages/viewer/src/semantic-segmentation.ts packages/viewer/src/renderer.ts packages/viewer/src/types.ts tests/design/semantic-segmentation.test.ts`: exit 0. Initial test-only dynamic-import type assertion failed TS2749; corrected with type-only import, then strict check passed. Last test change was type-only, with no runtime alteration.
- `git diff --check`: exit 0.
- No broad suite rerun, build or browser E2E within this bounded unit; root integrates and owns those checks. Companion E2E preflight not_applicable for pure array and NullEngine test unit.

## Behavior and limitations
ViewerScene gains optional structural role appearance without a new domain dependency. BabylonRoom caches one SemanticMeshAppearance per supported imported Mesh after measured normalization. Only world-coordinate copies are classified; imported position/UV/normal buffers remain unchanged.
Each active overlay builds a MultiMaterial and SubMeshes for original triangle groups. Null roles and unknown triangles point to the original imported material. Before restores original index values in original order, original submesh descriptors and original material; After reuses cached grouping. Clearing design restores originals and disposes only overlay-created materials. Manual surface material path and primitive object path stay in existing setDesign flow.
Conservative exclusions: existing MultiMaterial, shared geometry, skeletons, morph targets, unindexed/empty/invalid or oversized meshes. Skipped imported meshes retain their imported appearance. Submesh structure is recreated from exact descriptor values; object identity is not preserved. Index element values and order are preserved, not original typed-array object identity. Cache assumes static normalized imported geometry. Geometry classifier limitations remain in geometry-author.md; no semantic object recognition. Actual browser/GLB fixture verification remains integration work.

Status: completed
