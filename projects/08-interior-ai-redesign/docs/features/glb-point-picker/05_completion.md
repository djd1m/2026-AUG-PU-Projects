# Completed through M route

259 fulltests and7 browser checks passed; native proof mutation fails as expected. Independent Astra requested review2findings fixed/closed. No global/fullfeature gate pass claimed. Budget and exact image/source evidence in telemetry run.

## Criterion coverage
| Criterion | Test file | Test title |
|---|---|---|
| AC-glb-point-picker-1 | scripts/e2e-glb-calibration.mjs | preview before immutable shell, no manual coordinates required |
| AC-glb-point-picker-2 | scripts/e2e-glb-calibration.mjs | actual surface mouse clicks select A and B |
| AC-glb-point-picker-3 | scripts/e2e-glb-calibration.mjs | measured distance confirms actual picked coordinates and survives reload |
| AC-glb-point-picker-4 | tests/space/geometry.test.ts | native GLB scale requires explicit proof and never invents anchors |
| AC-glb-point-picker-5 | scripts/e2e-glb-calibration.mjs | WebGL loss disables surface point selection |
| AC-glb-point-picker-6 | tests/space/geometry.test.ts | calibrates one uniform scale, unknown floor area, explicit check tolerance |

Owner realfile unavailable; no native accuracy guarantee.
