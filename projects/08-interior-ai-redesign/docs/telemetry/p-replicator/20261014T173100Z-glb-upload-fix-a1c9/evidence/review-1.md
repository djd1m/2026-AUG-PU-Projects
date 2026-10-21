# Independent GLB upload review

Run: 20261014T173100Z-glb-upload-fix-a1c9
Work unit: review-1
Scope: read-only review of three assigned files, one pass, five-minute maximum; no code changes.
Baseline: 7eba5bed; reviewed coordinator-authored dirty worktree.
Requested model: Sol high. Actual model: null; authoritative host model/effort metadata unavailable to reviewer. Usage/cost: null; no authoritative counters available.

Verdict: no blocking findings in the scoped change.

Evidence and acceptance:
- upload-asset.ts lines 1–5: final .glb suffix (case insensitive) or model/gltf-binary overrides the generic selected purpose. Bytes remain server-authoritative; transport and limits are unchanged.
- SpacePanel.tsx lines 22–23: visible dedicated GLB uploader uses fixedKind=glb, while generic uploader selects GLB after a successful upload.
- SpacePanel.tsx lines 13–18, 25, 32–34: uploaded asset ID is selected after refreshing asset options; controlled selection and form key incorporating asset ID remount calibration fields when asset changes. Defaults only use the saved shell matching selected asset, preventing anchors from another scan. Confirmation checkbox is newly unchecked on remount.
- SpacePanel.tsx lines 20, 25: only form submission calls shell creation. Upload does not save a shell; confirmation remains required. Domain geometry.ts calibrationShape independently requires userConfirmed=true.
- Existing reference upload remains compatible: non-GLB image input keeps reference selection; uploadPrivateAsset signature and return contract are unchanged; ReferencesPanel uses existing image assets.
- RoomEditor.tsx refresh loads all asset pages, so successful selection is not blocked by first-page truncation. Concurrent upload/save attempts remain protected by the existing project version checks. No server-side code, validation limits, image decoder, or parser restrictions changed.

Checks: manual diff/source review only. Routing unit tests were inspected, not rerun; coordinator is running tests/build. No runtime/E2E pass is claimed. Helper tests cover routing, but upload-to-calibration selection, anchor/confirmation reset, and absence of automatic shell save require the coordinator's planned browser evidence. No new broader research or optional polishing round recommended.

Instructions applied: root/project CLAUDE.md, applicable coding/security/testing rules, complexity/model-routing/telemetry/swarm receipt rules, project-work-companion delivery evidence guidance, scoped Specification/Architecture and space feature contracts. Existing lessons applied: bounded independent pass, concrete acceptance checks, no repetition of unchanged successful tests, no expansion into a new validator.

Source SHA-256:
- apps/web/src/components/SpacePanel.tsx: 7fe9238cfe7f81229f33eaffdf8bc52c41b137ea9adfa4935fc931dab7b233c9
- apps/web/src/lib/upload-asset.ts: 2bde1f0a12246876e71bcb1fd1a36bf73513e00ca8886a3373abcaf9ce258538
- tests/space/upload-kind.test.ts: eed5118c2531cdac07622547952340f3653898f7531124d894a2af1af6f1fce9

Status: completed
