# Independent bounded reference-design review
Finished: 2026-10-14T19:29:21.601413+00:00
Launch: review-launch.json
Launch SHA256: 9d3fec14425546d79910956da4731e85140afe2d5a2469d34739f9ecd0c4f2a4
Actual model: unknown (execution metadata unavailable).
Verdict: changes_requested

1. Selected image contribution is not guaranteed. Material colors cycle by surface index, then ceiling unconditionally becomes white. With more references than GLB surfaces, later references are analyzed but never used. For six manual surfaces where ceiling is second, selecting five refs drops the second reference entirely. AC says selected actual images affect scene. Ensure all selected colors contribute, independent of surface count/ceiling position; cover five refs and a one-primitive GLB.
2. Manual edits inherit reference style. After reference generation, switching to Manual and editing an individual color/object then saving sends referenceIds:[] but preserves the reference-prefixed style. Hydration derives designMode from style and switches back to Reference, hiding manual controls. Normalize manual style or use provenance/referenceIds as well for mode inference. JobsCard also still receives referenceIds while in manual mode although manual text says references are not applied; pass an empty array for that branch.

No security/CAS blocker identified in bounded static review: guard before body, 1–5 unique UUID validation, project-scoped refs and owned asset resolution, normalized file size/hash and rights checks, bounded local parser slot, no external request in new route/adapter, create rechecks CAS with existing validation. Existing current same-shell objects are retained. Link-only rejects helpfully. UI conditionally exposes one mode's controls. Current tests cover single red/blue, stale, missing UUID and link-only; they do not cover all-ref participation, object retention or manual-mode hydration.

Static exact-file/diff review only. No tests/build/E2E/provider calls executed. Unknown usage/cost not estimated. Receipt is sole file written by reviewer.

Source SHA256:
- `apps/web/src/server/reference-design.ts`: fdaa21796190b4b03ea6af48ead4b45f9af3c4f41e85b3e60832f49710807a6b
- `packages/adapters/src/reference-palette.ts`: a28a2f9c13cae5e39d7063121521ef1e7cacf613ee41f64b30003bb7c4326aab
- `apps/web/src/components/DesignPanel.tsx`: 7a900caa6ae278903650ea853001d3f8672613ec2bbf04739b5dce0579c29b25
- `apps/web/src/app/api/projects/[projectId]/designs/from-references/route.ts`: d42edfd5c442e131473bacd657f16c7287de90ccd8a924149212a82f963508a4
- `tests/design/reference-palette.test.ts`: 4e5bba53206eba1b6eb4c2cb107409604918bc44f2c19f87737a51f5c58f6cd3

FinalStatus: completed
Status: completed
