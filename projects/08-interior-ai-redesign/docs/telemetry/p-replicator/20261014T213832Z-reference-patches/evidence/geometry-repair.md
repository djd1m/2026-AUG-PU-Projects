# Geometry repair receipt

WORK_UNIT_ID: semantic_geometry_repair
Profile: compact-quality-first-v2
Coordinator source revision: ea12532b
Isolated source: semantic-viewer worktree, with prior geometry/renderer artifacts
Actual model: null (host execution metadata unavailable)
Usage/cost: null (no measured counters available)
Elapsed: null (launch timestamp unavailable); first observed clock 2026-10-14T21:39:22Z
Finished: 2026-10-14T21:44:07.453972+00:00

## Exact files
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/packages/viewer/src/semantic-segmentation.ts` SHA256 `d3b3005837ba2725442338a37659e62878957f9289a09753d6bcc2e29da1ab5f`
- `/home/2026-AUG-PU-Projects/projects/08-interior-ai-redesign/.runtime/worktrees/semantic-viewer/projects/08-interior-ai-redesign/tests/design/semantic-segmentation.test.ts` SHA256 `2e2d04a08266a0ff8f86c4ff9bfc2deab6acea5516692a7989934ace7462ed52`

## Cause and repair
Original implementation gated each triangle on its own near-horizontal/vertical normal, causing neighboring noisy scan triangles to alternate between color and original material. The replacement infers supported planes, fits vertical support strips with weighted XZ covariance, and assigns every nearby triangle by vertex-to-plane distance without a local-normal gate. Predominantly vertical facets seed wall inference; noisy surrounding facets can still join the resulting plane.
Horizontal plane support uses 0.05m bins and adjacent-bin projected area. Vertical support uses 16 fixed orientations, 0.1m offset bins, projected area>=0.5m² and height span>1.4m. Fitted support covariance rejects ambiguous two-dimensional support (minor/major>0.12). Plane distance tolerance0.12m; vertex weld0.02m for connectivity only. Geometry and vertex buffers remain untouched.
Connected candidate regions below0.5m² (floor/wall/ceiling) or0.4m² (furniture) remain unknown. Furniture additionally needs projected horizontal support>=max(0.15m²,10%regionarea). Walls are assigned before furniture so low wall segments stay walls. Counts/groups preserve every original triplet exactly once.
Return adds eligibility:{eligible,coverage,reason,regions}, with finite0..1 area-weighted coverage. Eligibility needs supported floor, >=80%coveredarea, <=24acceptedregions, and discardedcandidatearea<=25%acceptedarea. Reasons: resource_limit, no_supported_floor, fragmented_regions, insufficient_coverage, supported_regions. Above100000inferencebins yields conservative unknown/ineligible; trianglecap remains1000000. Caller MUST skip automatic overlay when eligibility.eligible is false.

## Validation
- `node node_modules/vitest/vitest.mjs run tests/design/semantic-segmentation.test.ts`: exit0,7/7passed. No broad suite rerun.
- New meaningful fixture has6404triangles:3200wrinkledfloor,2400wrinkledwall,800wrinkledbedtop,4unknown. Local normals are intentionally outside previous thresholds. Exact expected coherent groups all pass, isolated floor/wall/furniture specks stay unknown, originalarrays/topology preserved.
- New fragmented-region/no-supported-floor eligibility cases pass. Prior NullEngine Before/After, UV/position preservation, material cleanup and malformed-input cases remain passing.
- Mutation removing connected-region minimum area: targeted noisy fixture exits1 and detects added isolated coloredfloortriangle; restored source hash above.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler packages/viewer/src/semantic-segmentation.ts tests/design/semantic-segmentation.test.ts`: exit0.
- Two initial noisy-fixture failures identified false oblique wall strips through furniture; covariance fit plus predominantly vertical inference seeds corrected them. Final assertions unchanged.

## Limitations and handoff
No private scan, browser, DB, network or provider accessed by this unit. Root owns actual privateGLB aggregate checks/screenshots and renderer eligibility handling. This is geometric approximation, not object recognition. Highly incomplete/sloped/curved/fragmented scans can be ineligible; tall furniture may still resemble wall. Connectivity uses quantized coincident vertices, so cracks beyond2cm or bucket boundaries can split regions. Thin features and objects belowminimumarea stay unknown. Plane support/coverage are heuristics, not measured semantic accuracy. Fixed16orientations plus bounded local covariance handle common vertical planes but do not guarantee arbitrary scan orientation. Independent review and integrated browser validation remain with coordinator.

Status: completed
