# GLB point picker

Scope: existing homeowner app; user asked immediate preview, mouse points and native1:1. Budget10min from final user instruction; no new external service/table.

### AC-glb-point-picker-1
Immediate private GLB preview. Given the existing owner project, When Upload ready GLB; preview appears before shell exists; private GET only. Then named browser/domain checks must pass.

### AC-glb-point-picker-2
Pick two actual surface points. Given the existing owner project, When Click A and B on mesh; markers and source coordinates update; dragging camera is not selection. Then named browser/domain checks must pass.

### AC-glb-point-picker-3
Measured scale with explicit consent. Given the existing owner project, When Given two distinct points and positive realdistance, confirm; immutable measured shell persists and reloads. Then named browser/domain checks must pass.

### AC-glb-point-picker-4
Explicit native scale without anchors. Given the existing owner project, When Choose preserve1:1 and confirm; native method persists scale1,emptyanchors; falseconfirmation rejected. Then named browser/domain checks must pass.

### AC-glb-point-picker-5
Reset without hidden persistence. Given the existing owner project, When Changing scan/method/points/distance clearsconsent; uploading/picking alone never replaces current shell; WebGLfailure honest. Then named browser/domain checks must pass.

### AC-glb-point-picker-6
Compatibility and resource envelope. Given the existing owner project, When Legacy measured shells load unchanged; ownership/CAS/GLB guards unchanged; no inference/network egress. Then named browser/domain checks must pass.
