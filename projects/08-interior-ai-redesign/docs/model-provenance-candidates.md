# Runtime model provenance candidates

Checked 2026-10-02 using public model cards and unauthenticated Hugging Face metadata API. Only metadata was fetched; no weights, model execution, account credentials or paid service were used. These are candidates for F02, not evidence that the runtime loads or meets geometry acceptance. Existing validated-source checkpoint remains unchanged.

| Role | Repository | Observed immutable revision | Declared license | Loading note |
|---|---|---|---|---|
| Depth control | `lllyasviel/control_v11f1p_sd15_depth` | `539f99181d33db39cf1af2e517cd8056785f0a87` | card `openrail`, details CreativeML OpenRAIL M | fp16/full safetensors listed |
| SD 1.5 base | `stable-diffusion-v1-5/stable-diffusion-v1-5` | `451f4fe16113bff5a5d2269ed5ad43b0592e9a14` | `creativeml-openrail-m` | mirror explicitly unaffiliated with RunwayML; component safetensors listed |
| Depth estimation | `Intel/dpt-hybrid-midas` | `11eaf7a1cf4bd70740697dbc216f98980c0aeb03` | `apache-2.0` | no safetensors listed; safe weights-only loading compatibility must be checked before use |

Sources: [ControlNet card](https://huggingface.co/lllyasviel/control_v11f1p_sd15_depth), [SD 1.5 mirror card](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5), [Intel DPT card](https://huggingface.co/Intel/dpt-hybrid-midas). API endpoints are `https://huggingface.co/api/models/` plus each exact repository above. All three metadata responses reported `gated=false` and `private=false`; this says nothing about future availability.

## Capability and constraints

The ControlNet card identifies this checkpoint as depth conditioning trained with SD 1.5 and documents a depth-estimation preprocessing step. This establishes compatibility intent, not preservation of all windows/walls. The SD mirror card reports imperfect image fidelity and supports an included safety checker; preserve that checker in the implementation. The Intel card documents monocular depth estimation and warns hardware changes affect performance. These claims do not establish RoomKind's real GPU benchmark.

## License handling before a runtime download

Both diffusion cards link to [CreativeML Open RAIL-M terms](https://compvis-stable-diffusion-license.static.hf.space/index.html). Section4 covers hosted access and requires license/use restriction notices; section5 passes use restrictions to users. Preserve the license and attribution materials for provisioned models, record their content hashes with the weight manifest, and include applicable use terms before offering any hosted production inference. This is a recorded implementation requirement, not a claim that the future hosted service has completed its legal readiness check. No deployment is part of this authorized local phase.

## Secure loading contract for F02

Pin all three repositories to the observed revisions or document an explicit revised choice. Prefer safetensors; prohibit `trust_remote_code=True`, arbitrary repository/user-supplied URLs and unpinned `main`. For the DPT candidate, retain it only if the pinned supported Torch/Transformers combination uses safe weights-only loading; otherwise choose a documented compatible safetensors depth model before actual execution. Do not silently suppress a load error or disable the output safety checker. Offline worker startup should require pre-provisioned models and fail clearly when missing. Weight download/provisioning is a separate operator action, with local disk capacity and exact file hashes recorded.

## Acceptance still pending

Model provenance hash and deterministic seed are reproducibility inputs. Quality remains measured on at least12 room photos×3 styles, and performance requires at least30 actual GPU jobs on recorded hardware. No fixture, model-card claim, or successful metadata fetch closes either gate.

## Hosted candidate — accepted software pins, 2026-10-03

This dated addition specializes the local-only deployment assumption above; the historical2026-10-02 metadata/license/loading observations are retained. F07 uses `jagilley/controlnet-depth2img`, immutable version `922c7bb67b87ec32cbc2fd11b1d5f94f0ba4f5519c4dbd02856376444127cc60`, closed schema contract SHA `3d94bb6e59e6a90e24a0504abb4c06c055f7619372e2c36313f42de5d86e99bc`. [Preserved research/schema capture](features/f07-replicate/replicate-research.md) establishes depth-conditioned capability and depth0/generated1 schema intent, not measured deployed quality/order or license/privacy/safety acceptance. I7 performs no new network verification.

Actual accepted code pins are in [transport](../web/replicate.js) and [worker config](../web/replicate-worker-config.js). Input is sanitized512 JPEG data URI; returned depth/output bytes are privately imported and hash-bound to original/transmitted transform/request. Fixed settings: one sample, image_resolution='512', detect_resolution512, ddim_steps30, scale7.5, eta0 and trusted seed. Four prompts are server-owned. No silent model/version upgrades, generic prompt-only substitution or GPU/CPU/fixture fallback.

Hosted evidence has a separate v1 contract and `measured-hosted-corpus-v1` operator report; no local revision/manifest fabrication. Provider hardware, warm status, inference time and billed amount remain null; measured local elapsed/DB queue are distinct. Mocks prove software only. Local safety checker remains a local requirement; hosted safety enforcement/content policy cannot be inferred from it. Real model license, privacy transfer/retention, corpus rights/annotations/independent measurements, safety and billing controls remain pilot-pending with0 authorized spend. Proposed12 rooms×3 styles/36 creates/12USD is not approval or a provider guarantee. Warm≥30/p95≤25s remains unchanged/unmeasured.
