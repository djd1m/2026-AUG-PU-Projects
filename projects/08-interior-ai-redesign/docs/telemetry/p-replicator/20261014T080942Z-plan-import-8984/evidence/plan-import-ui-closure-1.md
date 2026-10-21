# Narrow UI closure — UI-P01 through UI-P04 and results focus

Run ID: 20261014T080942Z-plan-import-8984
Work unit ID: plan-import-ui-closure-1
Attempt ID: ui-closure-1
Source revision: 3b84e9ef5ce68fdbdcf34e0d1671bace8006aff4; 153 production files match evidence/source-image-4.json and the test driver is separately bound there
Build revision: sha256:181590da9bf545d69fb927e56abb5da50f52f5ead7bd3d0fdcca8a45d90058ee
Launch record: plan-import-ui-closure-1-launch.json
Launch-SHA256: f667db2f95d8ae623773b787606de5cb8479de8a4bccd07922ce679cc5dde334
Launched-At: 2026-10-14T09:19:12.717370+00:00
Finished-At: 2026-10-14T09:20:23.094Z
Duration from formal launch: 70.377 seconds
Actual model: null (authoritative execution metadata unavailable)
Usage/cost: null (host counters and billing attribution unavailable)
Verdict: PASS — UI-P01 through UI-P04 and the Firefox results-focus defect are concretely closed

Scope was limited to the five assigned UI findings, the bounded changed files, `evidence/source-image-4.json`, and actual `drawing-journey-6` results/screenshots. No product file was changed, no test was started or repeated, and no network, installation, container start, publication, or external write was performed by this review.

| Finding | Closure evidence |
| --- | --- |
| UI-P01 feature keyboard evidence | `scripts/floorplan-e2e.mjs` now traverses from the focused results heading through units, length, width, optional height and transfer using actual Tab/ArrowDown/Enter/Escape input. It waits for browser focus and never sets focus from the test. `drawing-journey-6` passed this path in Chromium 148, Firefox 150.0.2 and WebKit 26.4, including transfer and missing-height focus. |
| Firefox results focus | `DrawingImport.tsx` now focuses the results heading in a result-dependent React effect. This replaces the premature requestAnimationFrame call. The actual keyboard path first waits for this focus and passed in all three engines, including Firefox. |
| UI-P02 mobile annotation readability | Candidate numbers are screen-sized HTML markers with computed `14px` text, a contrasting background and padding; OCR boxes remain in the aligned SVG. The runner asserts the computed 14px size at the 390px viewport. The three recognized-mobile screenshots show legible `№1`, `№2`, and `№3` labels without horizontal overflow. |
| UI-P03 source-link separation | `.drawing-source-link` is block-level with a 6px top margin. The confirmed-mobile screenshots show “Посмотреть чертёж-источник” on its own line in all three engines. |
| UI-P04 drawing asset label | The source-file list now labels `room_photo` assets “Фото комнаты или чертёж”, matching the upload control and the imported drawing's actual use. The text is visible in the fresh screenshots. |

`drawing-journey-6/result.json` reports `passed`, exact build revision `sha256:181590da9bf545d69fb927e56abb5da50f52f5ead7bd3d0fdcca8a45d90058ee`, 30 checks across the three engines, zero Axe violations, zero page errors, and zero unexpected outbound requests. No failure artifact exists. Earlier attempts 3 through 5 remain honest evidence of the native select-popup mismatch and Firefox focus defect; journey 6 is the first cited passing closure after the result-dependent focus correction.

Bound SHA-256 values checked in this review:

```text
08329fecbc715fc8e7c772aaf600ec2c139b45cd7c64cd880036709446941854  apps/web/src/app/globals.css
1e1573b4591c34b95ddc1f0b907cdac89312d7003482a1700691de4e4a85c0de  apps/web/src/components/DrawingImport.tsx
c7fb2b306bc6592c6e735fabb220e6d198e3924e45ef69f5d1221d08e2e22870  apps/web/src/components/SpacePanel.tsx
8ccb8efcf24cf9a9d092bd1da052a56e44f05cd971c2ae435463000be7c4adcf  scripts/floorplan-e2e.mjs
18ae192e018755af6827e1592f21d83e82fd013839ffdcff569da62dcf27ccce  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/result.json
2a4c3b08ec16863fcbe8a73d12f81085ec972cbf2a85cc154f03049203e75e1d  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/chromium-confirmed-mobile.png
b50b830ab355771f8d5a77e41a576c4e05ffdea3b8c6abbc60a380ebf92adab0  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/chromium-recognized-mobile.png
be4c8cd6ad9436b262015b709c4da27dde03a58d866505b2d742f3e19cf68539  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/firefox-confirmed-mobile.png
8d297038fd551af502cf42562fa7538c923e9bfb680468eaf68516edf8d975e7  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/firefox-recognized-mobile.png
5603b12b08e0fde025bd2798fcd83b5ece26c9de5a01da9d3a293c434aded058  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/webkit-confirmed-mobile.png
bbf3237b767da974be6e9e2f3fe50360e6948a2a425ab288a8209d84f1163067  docs/telemetry/p-replicator/20261014T080942Z-plan-import-8984/evidence/drawing-journey-6/webkit-recognized-mobile.png
```

No unresolved finding remains in the assigned closure scope.

Status: completed
