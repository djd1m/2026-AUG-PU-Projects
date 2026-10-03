# N8 Replicate planning — delivery receipt

Run-ID: n8-20261002-1740
Work-Unit-ID: n8-replicate-plan-delivery-1
Attempt-ID: replicate-plan-delivery-1
Source: e2dded9898d8b00f2fa5613e5f5d3fb63281715b
Build: null (documentation only)
Launch-SHA256: 42fe421a17fdf8f5c4eaaf37b90c7ffab41288562ae4f866218aef71229a60d0
Finished-At: 2026-10-03T06:44:21Z
Verdict: plan ready for independent validation

## Delivered files and identity

All six regular, non-symlink artifacts under `docs/features/f07-replicate/` exist and match the delivery launch hashes. The five role files also match the saved traceability input hashes. Git HEAD matches Source. No planning document was changed in this delivery attempt.

| File | Verified SHA256 |
|---|---|
| `01_specification.md` | `2f63500b8299fb4dba537b9c3494493116fa581d68ba72e34b662e21616d27ad` |
| `02_pseudocode.md` | `19a86156135d7751e7414e9a406070c990686d6ec8c095448549be012a10572d` |
| `03_architecture.md` | `c14c88440c537afcb1c09fe4d843c253c3e0ed4e0c904105fc3297e6fe9803b9` |
| `04_refinement.md` | `43fcc7495be1b92be9537f4c9d9e57fe57b574e7e8e9522c5428af21aff9e02e` |
| `05_completion.md` | `90a91240404d9edf7c8bbf042cb5a867dc9e0302691bd15aebcbf931c52a79e4` |
| `replicate-research.md` | `a3246fd4d5e0184b62b8bada1ab162e9f6785c228e895d244df8989d758e4a2d` |

## Checks and evidence

Installed p-replicator1.13.2 checker result preserved in `replicate-plan-1-evidence/traceability.json` and raw `traceability.log`: exit0;20 requirements /20 algorithm requirement claims; missing0, orphan0; exact F07 role-mapped composed view. The checker was resolved from the existing installed package with documented role-map flags, not replaced or modified. Its count describes matched machine keys, not20 distinct algorithm blocks. Delivery verifies saved evidence and hashes; it does not rerun or reinterpret the gate as semantic approval.

Original launch SHA256 `79c5eb9d749743f4bd29a968b0984235bf7079a4d26a12a56b4b462bfea33361` verified unchanged. Original attempt `replicate-plan-1` exceeded its900s window and terminated with timeout exit124, as reported by the coordinator. Preserve that failed attempt; its original receipt path remains absent. This fresh receipt completes delivery only and does not retroactively convert timeout124 into success.

## Current official evidence already gathered

Research verified2026-10-03 through unauthenticated public reads. `replicate-research.md` links Replicate HTTP/create/lifecycle/input/output/retention/billing/privacy documents, model/version/schema pages, and author code/license/model card. `official-model-schema.json` preserves the publicly extracted version/input/output schema and page digest; author-source digest evidence is alongside it. No new research occurred during delivery.

Candidate `jagilley/controlnet-depth2img:922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60` has documented depth conditioning. Public schema and author source support the proposed two-output depth/result contract; deployed order still needs authorized smoke verification. Code Apache2.0 and weights OpenRAIL are distinguished. Data URI avoids public source hosting, but provider retention/privacy and cancellation/billing remain explicit separate limits. Actual quality/performance/cost and production safety equivalence remain unknown.

## Next slice and remaining gates

Coordinator first assigns a fresh independent validator the exact six digests above, source and saved gate. No independent semantic validation is claimed here. After accepted PLAN/VALIDATE, I1 is a bounded≤25min Sol6.1 high implementation attempt limited to `db/007-replicate.sql`, `web/provider-submissions.js`, `tests/replicate.integration.test.js`: durable unique submission identity, immutable bindings/deadline, conservative spend reservation and one-shot submitting CAS; verify real PostgreSQL contenders/rollback. No external paid prediction is needed. Coordinator owns integration and continuation receipts.

Later slices cover transport/private import/worker wiring, original-deadline recovery, deletion/hold, hosted evidence and quality guards. All prior green tests remain unmodified, full relevant regressions and meaningful duplicate-create mutation are mandatory, followed by fresh independent review and actual shared-Docker browser E2E after source/build preflight. These checks were not executed by this planner.

Real pilot remains pending:12 licensed photos×3styles/36 planned creates,≥30 actual completed jobs for latency measurement, geometry thresholds unchanged. Proposed12USD total/0.30USD modeled per-create ceilings are not authorization; current allowed external spend remains0. Access, corpus rights, privacy/transfer, license, safety policy, billing-control and explicit spend authorization must be populated before live calls. Unknown warm/hardware cannot satisfy the existing warm p95 gate. No product acceptance, deployment, commit or push is claimed.

## Timing, model and scope

Profile: compact-balanced-v1 with owner-requested Astra high planning / Sol6.1 high implementation / fresh Astra review routing.
Requested model: gpt-6-astra; requested effort: high.
Actual model: null; actual effort: null; usage: null; cost: null. Reason: provider-resolved host metadata and counters were not supplied; requested model is not proof of actual execution.
Delivery elapsed from serialized launch to receipt preparation: 94.721s (actual UTC timestamps, includes launch wait). Original planning elapsed is preserved as coordinator-reported900s timeout, not reconstructed usage. Active time unknown. No paid provider calls occurred; no new research, code, Docker/browser, delegation, canonical-doc edits or coordinator run/events writes in delivery.

Status: completed
