# Renderer instance-sharing guard addendum
Finished: 2026-10-14T21:55:11.642868+00:00
Verdict: pass
SemanticMeshAppearance.create additionally rejects mesh.instances.length>0, avoiding direct-helper index regrouping on an instanced source. This is a conservative strengthening of the previously reviewed unsupported-instance whole-scan gate. Static line inspection only; no test rerun claimed.
Source SHA256 packages/viewer/src/renderer.ts: 6fa68309a4b04af67819e2ef72d734777dc0e1eb4856600de82983187c38a6ba
Status: completed
