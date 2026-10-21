# SPACE implementation receipt

Run-ID: 20261013T220722Z-space-6259
Work-Unit-ID: space-author-1
Attempt-ID: space-author-1-implementation
Started-At: 2026-10-13T22:29:24.008456+00:00 (coordinator author-receipts.json)
Finished-At: 2026-10-13T22:46:52.684367+00:00
Duration-Seconds: 1048.676 (includes reading, implementation, tests, mutation and corrections)
Actual-Model: null (host did not expose model execution metadata; requested gpt-6-astra/high from coordinator)
Usage: null; Cost: null (no host counters; not zero)
Fallback: none; no model switch claimed
Profile: compact-quality-first-v2
Verdict: author checks pass; independent review and integrated build/browser E2E remain coordinator gates
Source-Revision: original git3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; isolated directory is a copy, not a Git worktree
Canon-SHA256: 70ae99506734ef86e0c6ac9474f48aa2d289b462cd801c155ccdcc4ee7e6a69d
Architecture-Current-SHA256: 1a902141862ccbfa411fb853460506a3238b8e6c10ba70a774ea1ba822f6b99c (coordinator corrected account rate-key documentation; no SPACE behavior change)
Owned-Code-Test-Snapshot-SHA256: bb2140d929dc10b6f1a80f48ca413b06614383662ce235eedc8dadd7f6811ef7
Build-Revision: null; no integrated Next build claimed
Launch-SHA256: null; coordinator supplied author-receipts metadata, no launch digest

## Scope and implementation

Pure exact-decimal manual geometry/openings/floor/wall area; uniform GLB calibration with explicit check tolerance and confirmation; immutable shell hashing and CAS. Private stream upload reserves30MiB(image10+normalized20) or25MiB(GLB) before read under Account→Project locks. Original and normalized files use random exclusive0600 keys; originals/hash preserved, decoded WebP strips EXIF. Ready published only after file/hash verification and repeated ownership/version check. GLB allows embedded uncompressed triangles/KHR_materials_unlit only; custom hard limits plus Khronos validation and truncation refusal. One decoder child active until actual process close, deadline10s, heap256MiB plus RSS512MiB supervision25ms. Malformed/quota/parser/CAS failures clean files/reservation. Cleanup hook settles stale15min pending and unreferenced30min files.

References accept exactly image OR original HTTPS URL, rights, tags/note; server never fetches source; Pinterest import explicitly disabled with alternative. Source cap20 refs and combined100 revisions enforced. List pages max50 with owner-checked keyset cursor retain access to64 assets/history.

Reusable Babylon viewer owns one engine/camera and disposes on unmount; actual wall openings, fixed shell normalization, optional material/object overlays, same-camera capturePair and transient before toggle. React SVG plan fallback preserves explicit measurements; GLB fallback does not infer a floor plan or area. Viewer dimensionsM uses canonical decimal-string tuples; positionM numeric centerX/bottomY/centerZ tuples.

## Public contracts

`@n8/domain/space`: geometry.ts/references.ts/index.ts. `createManualShell(geometry,userConfirmed)`→ShellContent; `calibrateGlb(calibration,readyDescriptor)`→ShellContent; `wallAreaM2`; `canonicalShellContent`; strict reference validator.
`@n8/viewer`: SceneViewer, RoomPlan, SceneViewerHandle.capturePair(), types.ts. Caller resolveAsset(id)→ArrayBuffer. Optional materialCode/color; no API/Next/db dependency.
Repository factory createSpaceRepository(pool). Uploader createAssetUploader(directory,repo); scheduler cleanupAssets(pool,directory).
GET shells/assets/references → data={items,nextCursor}; optional query `after` lastUUID, cursor must belong to same owned project. POST shell manual={mode:'manual',geometry,userConfirmed:true} or GLB={mode:'glb',sourceAssetId,calibration}. POST reference={assetId?|sourceURL?,tags,note,rightsConfirmed:true}. POST asset raw body, x-asset-kind=reference|room_photo|glb and x-rights-confirmed=true. All mutation If-Match numeric version. POST response data=entity, meta.version + ETag, status201. GET /api/assets/:id defaults normalized image/validated GLB; ?original=1 owner original; fixed MIME/nosniff/private no-store.

## Checks and observed corrections

- npm ci --ignore-scripts: exit0,193 installed, audit0 vulnerabilities; no manifest/lock changes.
- Full SPACE run22:42:49: `node --env-file=<original private test.env> node_modules/vitest/vitest.mjs run tests/space` exit0,49/49 (real PostgreSQL, subprocess Sharp/GLB, HTTP, geometry, viewer SSR/panels).
- Following coordinator source-limit findings and pagination change22:44:46: repository+http targeted run exit0,15/15, including3 new edge cases (20 refs,100 revisions,64 assets across50+14 pages/foreign cursor404). Total distinct current cases52; unaffected tests not repeated without reason.
- npm run typecheck final: exit0.
- Scoped eslint ownedsource/tests: exit0.
- Mutation1 actual streaming ceiling disabled: named parser byte-limit guard exit1, received11bytes instead of413; source restored.
- Mutation2 pending bytes excluded from quota: real concurrent guard exit1,12 reservations instead of6; source restored; corrected targeted run green.
- First parser suite found cancellation race: calling cancel before timeout reject produced422 instead of408. Corrected reject-before-cancel; real hanging stream test green.
- Parent substantive M from approved fresh plan retained. Author mechanical explicit6-file route exit0/TierS lower bound at handoff; never lowered risk or checks based on it. Author did not run an additional pre-code mechanical check; root workflow owns pre-stage ROUTE.
- AC1: geometry exact18 + DBstablehash/immutable + viewer wall-panels/SSR pass; live WebGL browser visual remains integrated gate.
- AC2: bounds/openings/calibration controls and negative tests pass.
- AC3: actual normalized EXIF/orientation/originalhash/GLB/fixed MIME private HTTP pass.
- AC4: malformed/oversize/pixelbomb/remote+data URI/animation/skin/extensions/resources/validator inconsistency/deadline/cleanup tests pass.
- AC5: actual PostgreSQL asset/reference ownership and pending invisibility pass; pre-body guard no consumption pass.
- AC6/7/8: reference provenance, exact Pinterest pin, disabled import and safe SSR text pass.

## Memory, evidence and integration limits

Russian dz recall before code/tests returned no matching entries; applied checked local rules for operation order, resource races, failclosed inputs and meaningful mutation. Confirmed new timeout/cancel ordering lesson taught to original canonical brain with --no-mirror, IDteach:659b873e347fb8db. CLI default reward0.8 is manual store metadata, not measurement.
Reuse searches and donor SHA/license/limitations recorded in reuse.md: local01–07 incl03a/05a before GitHub for geometry, reference, upload/parser and viewer; no runtime donor imports. Applicable project-work-companion used for preparation/handoff; browser E2E preflight not_applicable here because no browser E2E attempted.

Coordinator integration still required: call cleanupAssets periodically in worker; preserve/externalize @n8/adapters so asset-parser-worker.mjs remains resolved after Next build; integrated build, independent review, WebGL/browser/no-egress tests and full cross-feature suite. RSS monitoring is sampled every25ms and can briefly overshoot512MiB; V8 cap excludes native memory, so a strict OS-level ceiling requires the deployment container memory limit. Exact spend/model counters unavailable. No paid calls or public deployment.

Copied foundation/db bounds/002 dependencies are READ-ONLY integration inputs, not SPACE-owned deliverables. Owned files below are ready to copy; no commits.

```text
dac22685a1f13fc8437d5a701d64cbb3f275ff7b53453dccf4ca043bf6e57455  apps/web/src/app/api/assets/[assetId]/route.ts
4d50a163756f427c78a3c2f88cdb904a81e4734142f2af37ff3bb9f0f1c362de  apps/web/src/app/api/projects/[projectId]/assets/route.ts
05d3fd3dfec6f26641e7e9365867ff2c63ddd834345d50d0b452391adb590cda  apps/web/src/app/api/projects/[projectId]/references/route.ts
dba4416836a87636ebad1108e3c7d3b6b2083c12d192ce721b2f15dd10631250  apps/web/src/app/api/projects/[projectId]/shells/route.ts
67fe87bc6238270f86bd474719271721bdc7c4085df4df705967085a8efcfe95  apps/web/src/server/space.ts
10a9f8e044b39268838cc4333f1a5f3a3225da3789abdf0ebdff559dee1507ad  packages/adapters/src/asset-parser-worker.mjs
b1b5202607e87519298e06916985d9348ff23ba9135f55b61eb281935116201f  packages/adapters/src/asset-parser.ts
cd469ab768a39fcf1708c7651d471374cd3d3ca139f171eb02df4f5d8590843e  packages/adapters/src/assets.ts
713afa259299ca506bbece1cd72a012d75d6c7f687162fd5f879e7532b40ad3c  packages/adapters/src/cleanup.ts
0bcd7126756457e715ad049f1fecd8a9c64edb0d8cbe1e6a8f44a77676c6fed5  packages/db/src/space.ts
f1a0c793ec97c9d9098ca3a0ca0c826d0e1f9097269294bcbb70af3b5113c861  packages/domain/src/space/geometry.ts
9d3254752233a8cc10903a4f43d4c9965a6413599f124b473e7ead7f5cef8eee  packages/domain/src/space/index.ts
d6b297416824434c4d00d022d5f637b2f37e4bae7d3ffac6c65a70d3f1206d54  packages/domain/src/space/references.ts
0a18e8083093fe56e2a6471d53d664c9fcf14681f102149bb8dde1ed27e0000e  packages/viewer/src/index.tsx
0f5f6e569ead6daa1add6eeabe33e43747edaab8a334a17f77913d1dff6781d3  packages/viewer/src/renderer.ts
bd7f773e71e02680f3ddaa0ee0525c055984c5d5a7feabbb36837ebb385911b1  packages/viewer/src/types.ts
7f1df535d8e1d27e2b62f32fce5ced1c2e32038b4ef8edaf35864a9e95b2ad0c  tests/space/fixtures.ts
1878817de768afce508ecdb3371ef8c07edd85406cac8914633234644bc32c03  tests/space/geometry.test.ts
691df7aa0788ed0cee9188ba9f4e814d566a6761220059543bf2bb8f3275d3b4  tests/space/http.test.ts
4795b63c16d0625be5ef5b2261703ba5cfb87e5396de4e70b66d20003d9702b1  tests/space/parser.test.ts
9db0244dc5728f44e46845af222df8a0cbf404446d6d1b9171709e1373a7c1e9  tests/space/repository.test.ts
25deea033869d9713590125dcca640d2a2860b66a41f2306225c578d62bfe194  tests/space/viewer.test.ts
```

Status: completed
