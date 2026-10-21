# Independent GLB point-picker review
Run: 20261014T181240Z-glb-point-picker-54d0
Work unit: review-1
Source revision: cf4646ce plus filesha
Launch SHA256: cbc5709a9cb76963f37fc1d7280740f84864d31c84a5645dce8c79ee63fa04d8
Source hash verification at review completion: {"apps/web/src/components/GlbCalibration.tsx": true, "apps/web/src/components/SpacePanel.tsx": true, "apps/web/src/components/SceneViewport.tsx": true, "packages/viewer/src/types.ts": true, "packages/viewer/src/index.tsx": true, "packages/viewer/src/renderer.ts": true, "packages/domain/src/space/geometry.ts": true, "tests/space/geometry.test.ts": true}
Finished UTC: 2026-10-14T18:20:37.363104+00:00
Actual model: null (execution model identifier not exposed to reviewer).
Verdict: changes requested for two bounded UI lifecycle/interaction findings; no server/native security defect identified in scoped review.

1. AC5: packages/viewer/src/index.tsx webglcontextlost handler disposes runtime and shows an error but does not call onError. GlbCalibration therefore retains ready=true and failed=false, leaving selection enabled and omitting independent-check warning. Notify onError from this handler; also propagate SceneViewport dynamic-import failure.
2. AC2: packages/viewer/src/index.tsx compares only pointerDown/pointerUp distance. A camera drag that returns within five pixels of its start selects a surface point. Track maximum movement and pointer cancellation so dragging never becomes selection.

Spec/code checked in both directions across all eight launch files. Upload selects private preview without a shell; key=selectedGlb resets scan state and consent. Picking uses actual mesh hit coordinates at preview scale1; server strict native branch persists scale1 with empty anchors and requires true confirmation. Existing measured branch remains compatible. Changes to method, points, measured distance and floor-area inputs clear confirmation. No persistence occurs on preview/pick alone. Scoped geometry tests cover strict native input rejection and previous measured behavior. Browser interactions, context loss, cross-owner/CAS and full regression were not executed by reviewer; coordinator owns those checks. No claim that feature gates passed. No code edits by reviewer.

Status: completed
