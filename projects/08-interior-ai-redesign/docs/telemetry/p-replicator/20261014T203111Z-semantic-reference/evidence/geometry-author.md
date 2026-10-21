# Geometry author receipt

WORK_UNIT_ID: semantic_geometry
RUN_ID: 20261014T203111Z-semantic-reference
Baseline: fb07c8c9
Profile: compact-quality-first-v2
Actual model: null (host metadata unavailable)
Usage/cost/elapsed: null (no measured counters or start timestamp available)
Finished: 2026-10-14T20:39:06.225583+00:00

## Exact artifacts
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/semantic-segmentation.ts` SHA256 `e165ee43e195fa8dcd85c43ddc8e19d65f45e461ca3fb4076659a47356386c7f`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/tests/design/semantic-segmentation.test.ts` SHA256 `90bf3c317e0af2237e9085cdc8871d6e46e19104197e018e527dc156588e6389`

## Checks
- `node node_modules/vitest/vitest.mjs run tests/design/semantic-segmentation.test.ts`: exit 0, 4 tests passed.
- Wall-span mutation `> 1.4` to `> 140`: targeted suite exit 1, expected wall assertion fails. Mutation restored; source hash matches tested original.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler packages/viewer/src/semantic-segmentation.ts tests/design/semantic-segmentation.test.ts`: exit 0.
- Full `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: exit 2; four pre-existing worktree/original symlink private PgProcurement.phasePreview type incompatibilities in tests/procurement/http.test.ts. Integration owner must rerun in original project.
- E2E preflight: not_applicable; pure array classifier unit, no browser runtime owned.

## Behavior and limitations
O(triangle count) passes and maps; rejects more than 1,000,000 triangles, malformed lengths/indices and nonfinite referenced coordinates. Degenerate triangles remain unknown. Inputs are world metre positions; returns original index triplets exactly once, preserving within-role source order; counts are triangle counts. Source arrays never change.
Floor uses 0.05m horizontal area bins, minimum support max(0.5m², 3% of largest plane), lowest supported plane, constrained to bottom region where supported walls exist. Walls use canonical normal/offset bins, area>=0.5m² and vertical span>1.4m. Wall classification precedes furniture. Ceiling needs supported horizontal plane above1.8m near highest geometry; furniture needs horizontal/vertical evidence wholly within0.12..1.4m of floor.
Approximation only: no bed or object recognition. Plane quantization can split noisy/sloped surfaces and misses thin/unsupported floor fragments. Tall furniture can resemble walls. Without supported walls a lowest supported shelf can resemble floor. Unsupported floor returns floorY0 sentinel and disables ceiling/furniture classification; floor count0 distinguishes missing floor. Isolated high scan outliers may prevent ceiling recognition. Disconnected coplanar fragments aggregate. Unknown triangles retain their original material in caller integration.

Status: completed
