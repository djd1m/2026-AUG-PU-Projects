# Algorithms

### Algorithm: Preview, pick and confirm

REQUIREMENT: `AC-glb-point-picker-1`
REQUIREMENT: `AC-glb-point-picker-2`
REQUIREMENT: `AC-glb-point-picker-3`
REQUIREMENT: `AC-glb-point-picker-4`
REQUIREMENT: `AC-glb-point-picker-5`
REQUIREMENT: `AC-glb-point-picker-6`

1. Read owned validated asset; show ephemeral source-scale GLB, never fabricate ShellRevision.
2. Explicit pick A/B mode; ray-pick imported mesh only, ignore camera drags; retain world/source coordinates at scale1.
3. Measured request uses selected actual points and user distance. Native request uses method=native, no anchors.
4. Server validates literal confirmation, optional separately confirmed area; native scale fixed1, measured scale from distance.
5. Persist immutable owned shell via existing CAS. Reset confirmation on edits/source changes.
6. Retain no-WebGL error and read-only selected coordinates; old stored shells unchanged.
