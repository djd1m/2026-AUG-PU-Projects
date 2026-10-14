# Geometry repair closure

WORK_UNIT_ID: semantic_geometry_repair_closure
Actual model: null (host metadata unavailable)
Usage/cost/elapsed: null (no measured counters or exact launch timestamp)
Profile: compact-quality-first-v2
Finished: 2026-10-14T21:46:44.439010+00:00

## Exact files
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/semantic-segmentation.ts` SHA256 `59dbd6d332d5f62496bb0ceafb18745fe7be82185dcaf386f1372c32de9ef365`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/tests/design/semantic-segmentation.test.ts` SHA256 `1f2a09aa7b2e4807fe156d77e2d29e77e3e1956a3d812dec51608997e9b3679b`

## Concrete correction
Parent actualscan check found near-total wall assignment in prior repair. Small triangles could seed all16orientationbins and unrelated wall strips could fit false diagonal planes through interior furniture.
Wall inference now requires horizontal seed-normal alignment>=0.94 with its orientation bin. Fitted-plane support additionally requires absolute centroid RMS residual<=0.03m (covariance minor eigenvalue<=0.0009m²), besides prior anisotropy guard. Assignment still uses distance to supported planes, preserving noisy facets whose individual normals would fail seed inference.
Conflicting wall matches with absolute normal dot<0.9 yield unknown; when ambiguous area>10%totalarea, eligibilityfalse reason ambiguous_wall_planes. Highcoverage is not semanticaccuracy. Renderer must honor ineligible status.
New intersecting noisy-wall fixture reproduces false-bed-wall classification: corner has4800walltriangles and800bedtriangles. Alignment alone failed this fixture; strict support residual guard corrected it without changing assertions.

## Checks
- `node node_modules/vitest/vitest.mjs run tests/design/semantic-segmentation.test.ts`: exit0,8/8pass. New corner fixture asserts all800bedtriangles furniture,4800walltriangles walls,4unknown and eligibilitytrue. Existing noisy continuity, unknownspecks, topology/input preservation and Before tests pass.
- Mutation loosening residualguard minor>0.0009 to minor>1: targeted corner test exit1, detects lost bed classification; restored exacthash above.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler packages/viewer/src/semantic-segmentation.ts tests/design/semantic-segmentation.test.ts`: exit0 after mutation restoration.
- No private scan, DB, network, paidcall or browser accessed. Parent owns calibratedactualscan and browser acceptance.

## Limits
Conservative3cm inference residual can reject noisy/curved realwalls; that should reduce eligibility rather than imply successful recognition. Tall furniture may still resemble wall. Fixedplane heuristics are not semantic object detection. Actualscan accuracy remains unverified by this unit; successful syntheticfixtures do not establish it. Only2ownedfiles changed; renderer unchanged.

Status: completed
