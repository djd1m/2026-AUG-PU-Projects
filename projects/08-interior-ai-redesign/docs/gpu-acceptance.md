# F05 real GPU acceptance — blocked, not run

This is the canonical pending gate record, not an acceptance certificate. F01–F04 local software and F06a documentation/restore preparation are reviewable; full F05/F06/MVP remain incomplete.

## Observed blocker

[Read-only host metadata](features/f05/host-availability.json) records the latest device/runtime observation. No `/dev/nvidia*` device and no NVIDIA Docker runtime were observed; the DRM device is vendor0x1013/device0x00b8. This is more evidence than an absent `nvidia-smi` command, but it is not a universal claim that no GPU exists elsewhere. No CUDA inference was run. Licensed room inputs and safe, hash-pinned offline weights/runtime have not been provisioned.

## Existing implementation and required inputs

Use the existing [Python engine](../worker/engine.py), [Node controller](../web/generation.js), [worker entry](../scripts/worker.js), [quality operator](../scripts/quality.js) and [source-checked setup](README/en.md). Keep SD1.5+ControlNet-depth; OpenAI image generation is not a substitute for this product requirement. Coding-agent OpenAI routing is a separate policy.

The [model candidate provenance](model-provenance-candidates.md) records exact observed revisions, source cards and licensing/loading limits. Candidates are not tested GPU artifacts. Provisioning must retain license materials, exact weight/config hashes, safe offline loading, the safety checker and an explicitly verified dependency/CUDA combination. Intel DPT safe-weight availability/compatibility remains unresolved; do not silently enable unsafe pickle or remote code. The existing source deliberately fails closed on missing prerequisites.

## Required measured result

Follow [GEOM-01/02/03 and PERF-03](Specification.md), [named scenarios](test-scenarios.md) and the existing [F02b plan](plans/f02b-inference-quality.md). Supply at least12 licensed room photos with source/licensing records, opening/anchor annotations and3 required styles per room. Independently compare real outputs: zero new/missing windows or doors and anchor error≤2% of image diagonal. Bind input/output/depth/config/model/hardware/seed hashes and independent reviewer decision to the actual artifacts; fixtures and model cards cannot satisfy this gate.

Record at least30 actual warm GPU jobs with inference p95≤25seconds; queue time is separate. Publish hardware, runtime/dependency versions, warm-up policy, all sample durations and actual failures. A failed quality result stays private/rejected under existing guards. Only independently accepted real evidence may authorize the existing publication path; synthetic `accepted-software` seeds are test-only.

## Authorized next boundary

The current external-spend ceiling is0. No GPU rental, model download, paid provider, live charge or deployment has been performed or silently authorized. Resume the existing pipeline when an authorized environment, safe offline artifacts and licensed corpus are supplied; prepare a concrete cost/destination plan before any external spend. Do not change the financial/job invariants or weaken tests to manufacture a pass. Real provider and final deployment/security configuration remain separate release gates documented in [Completion](Completion.md).

Current verdict: **BLOCKED — real geometry and latency unmeasured**. No quality score, GPU price, delivery forecast or model cost is estimated here.
