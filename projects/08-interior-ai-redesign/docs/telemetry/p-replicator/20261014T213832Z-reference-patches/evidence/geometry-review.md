# Independent geometry gate and UI review
Finished: 2026-10-14T21:49:57.364052+00:00
Actual model: unknown (execution metadata unavailable).
Verdict: changes_requested

P2 all-or-nothing gate misses rejected renderable meshes. loadGlbAsset only retains successfully created SemanticMeshAppearance instances. appearanceStatus evaluates those instances exclusively. With one eligible mesh plus one renderable mesh rejected for shared geometry/MultiMaterial/unsupported attributes, status can report eligible=true and partially paint the scan. Track rejected renderable meshes (exclude empty transform/root meshes) and reject overall application when any is unsupported. Include a mixed-mesh regression.

P2 unknown/stale UI eligibility implies success. GLB canApply uses eligible!==false, so null/loading/viewer failure is treated as eligible and advertises Apply before classification. Require affirmative eligible=true for GLB; unknown can offer clearly labelled analysis-only/pending state. Reset status to null on viewer initialization/shell change and load/WebGL failure, so eligibility from a previous scan cannot survive into an unverified scan. Existing success toast correctly describes saved analysis, not completed transfer.

The intended fallback is otherwise sound in inspected code: low-coverage SemanticMeshAppearance returns before creating MultiMaterial or regrouping indices; room-wide failed classification disables semantic configuration and appearance-associated whole-surface material overrides. Before restores imported materials/indices/submesh layout. Manual and legacy designs without appearance retain their material edits, and manual switch removes appearance. Callback JSON equality prevents redundant parent-state updates. Existing saved appearance is evaluated locally without provider calls.

Pure segmentation inspects connectivity/minimum-area/support and returns eligibility, while exact vertex/index source topology remains unchanged. Inspected tests include noisy connected fixtures, tiny disconnected regions, intersecting walls and low-coverage overlay preserving exact source material/indices. These tests and eligibility do not prove real scan semantic correctness. Coordinator reports owner scan ineligible (~67% coverage) and original render preserved; reviewer did not access the private asset or screenshots. Full semantic transfer on that scan remains unsupported and must stay disclosed.

Static bounded review only; no private assets, network, DB, paid calls, tests/build/browser execution or source changes. Coordinator owns actual runtime validation. Usage/cost unavailable, not estimated. Subsequent corrective changes require narrow closure.

Source SHA256:
- `packages/viewer/src/semantic-segmentation.ts`: 59dbd6d332d5f62496bb0ceafb18745fe7be82185dcaf386f1372c32de9ef365
- `packages/viewer/src/renderer.ts`: 0777cec6135548bb3aca72169cf334bebcd025cf6aaaaa8879505c34bed63911
- `packages/viewer/src/index.tsx`: ba4e71f99500e5d2c5c520fd7235a5b6f2f53e97ec9e757e0e8a39c02ab0689e
- `packages/viewer/src/types.ts`: e4cf526dfb5ccf2b8dd5e647c35dd215482075715235b4042374ffc5df4f8be3
- `apps/web/src/components/DesignPanel.tsx`: d93809c0f0052ab8c329e78d322255134ea02759eeb76582e45f3e363935dc00
- `apps/web/src/components/DesignReferences.tsx`: 0ba59872c66fabbc7335628e168fb1aa73569b39611c8056cf091456e3a15dea
- `apps/web/src/components/SceneViewport.tsx`: 6358e5281a05bf2a192679ab45049f42f458a4f43e3132e61d8dfde9907c84d8
- `tests/design/semantic-segmentation.test.ts`: 3ca221aed90535a555df258e86bf4f8aba9f3c082dd8921fc01655df885b49f0

FinalStatus: completed
Status: completed
