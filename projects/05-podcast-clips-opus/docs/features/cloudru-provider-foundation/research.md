# Cloud.ru foundation — Research and decisions

Historical research snapshot from 2026-10-26. Subsequent implementation and
the [v4 specification](01_specification.md) supersede the runtime/scope statements
below: Cloud.ru DeepSeek/S3 foundation is implemented; explicit Yandex SpeechKit
v3 STT is the selected next adapter, while Cloud.ru STT remains refused. The
current estimated variable-cost budget is 57 RUB/hour (stress 62), not the old
35 RUB/hour scenario; see [current economics](../../research/unit-economics-20261026/unit-economics-summary.md).
Original findings and earlier gate limitations remain below as dated history.

Checked 2026-10-26 against baseline `c559673649460fa5d8ef1e5e3c86bf7053ebbb69`. Earlier bounded research artifact: `/tmp/n5-cloudru-plan-20261026.md`, SHA256 `afb591fc2efcd420f9b6b3d136ecaa8943b6de86f7cc0f1d3f709c7b22a40f36`. This file preserves the feature-relevant conclusions; temporary artifact is not a runtime dependency.

## Product Brief and solution

Existing N5 turns Russian podcasts into word-aligned short clips. Operator needs provider choice without invalid fragments, unexpected paid fallback, false cost attribution or a speculative STT adapter. Scope is narrow foundation, not product discovery. Parent approved Cloud.ru `json_object` request + exact schema in prompt + strict existing local validator. There is no claim of provider-enforced strict schema. No extra research agent or broad market analysis is needed.

Root/project CLAUDE and applicable routing/companion/telemetry instructions were read in initial research. The companion is applied for source/readiness/handoff discipline; preflight is not applicable to docs-only PLAN. Feature.md Phase 1 and sparc-prd-mini role map are applied here, existing project scaffold not regenerated. Requirements-validator and feature-report-contracts were read for future report/coverage formats. Research/Solve context supplied by parent permits skipping Explore and further delegated research. Actual model/token/cost counters unavailable: null, not estimated.

## Evidence and confidence

High confidence from source inspection: S3 SDK already supports configurable origin, region, compound credentials transparently, path style, separate public signer, multipart/read/write/delete/retention; no new driver needed. Cloud.ru signature/SDK/CORS/multipart primary links and short quotations are in Architecture. Runtime storage pass remains unknown.

High confidence: configuration hardcodes OpenRouter currently; selection spend type, worker event and DB `authorizeSelection` update hardcode provider='openrouter'. Existing provider/model columns are text; no migration needed. Only LLM attribution is in foundation scope; optional STT ledger enrichment is deferred.

Documented chat API evidence: [reference](https://cloud.ru/docs/foundation-models/ug/topics/api-ref), [OpenAPI 1.0.0](https://cloud.ru/docs/api/specs/foundation-models/ug/_downloads/f2949c1237d79b17b2df8e523e02a89a/openapi__foundation-models.yaml?source-platform=Evolution), [authentication](https://cloud.ru/docs/foundation-models/ug/topics/api-ref__authentication?source-platform=Evolution), [quickstart](https://cloud.ru/docs/foundation-models/ug/topics/quickstart?source-platform=Evolution), all opened 2026-10-26. Published spec exposes models/chat only; response_format enum text/json_object coexists with a json_schema object. Decision uses documented JSON-object mode and local validation, not the ambiguous strict-generation path.

Catalogue evidence: [model overview](https://cloud.ru/docs/foundation-models/ug/topics/overview__available__models), opened 2026-10-26, gives internal `deepseek-ai/DeepSeek-V4-Pro` context 1048576 and internal `openai/whisper-large-v3` context448. Context is not proven output ceiling or duration limit. Internal versus external model placement is documented; exact tenant geographic execution is not independently measured here. Do not substitute external DeepSeek Flash.

Whisper audio endpoint, encoding, word timestamps/alignment, chunk and body limits remain UNKNOWN after official spec/index/guides and targeted public searches. This is absence of evidence, not proof unsupported. Deferred next step: operator-safe redacted generated integration example from model Use action ([guide](https://cloud.ru/docs/foundation-models/ug/topics/guides__models-ui?source-platform=Evolution)), then separately authorized capability tests with actual timestamps. Do not guess multipart or reuse OpenRouter base64 body unverified.

Canonical economics: `docs/research/unit-economics-20261026` targets Whisper+DeepSeek and Cloud.ru storage; the 35 RUB/hour scenario is estimated, not measured. This feature makes no pricing/latency/cost savings claim and does not amend finance packages or bonus policies.

## Route, ownership and bounds

Substantive profile L: external chat provider request + worker/DB boundary, no new money product behavior, no data migration, no invariant relaxation. Mechanical router on provider/worker/DB files returned M (exit0); it is only a lower bound, so L full lifecycle retained. Earlier broader config scan returned XL due imported payment text; payment design stays in separate parent XL scope.

This PLAN task owns only six files in `docs/features/cloudru-provider-foundation/`; no toolkit/runtime changes. Baseline and exact implementation allowlist are in Architecture. One bounded implementation pass, independent review and concrete fixes; tests do not rerun unchanged merely for reassurance. Coordinator owns accepted revision/remaining work/executor continuity.

## Deferred acceptance and missing inputs

Credentials presence was not inspected. Later target work needs Foundation Models API-key Key Secret (`CLOUDRU_FM_API_KEY`), S3 tenant/key/secret/bucket with existing parameter names, target RF server/release authority/public origin/CORS, approved synthetic or rights-cleared audio fixture and explicit paid-call budget. Key possession does not authorize spend. No purchase, real content upload, paid API/model call, deployment, container/image creation or global model change occurred in research/PLAN.

Future tests must demonstrate actual word times, chunk offsets/overlap and usable segments before Cloud.ru STT implementation; JSON-object/local validator behavior before live chat acceptance; and S3 private multipart/browser ETag/signature/download/cleanup on dedicated test-owned objects. Offline tests and MinIO establish regressions, not actual Cloud.ru migration completion.

## PLAN gate result

Packaged checker from N5 root without role-map flags returned exit2 because root-owned `.claude` is absent inside project. With its supported `--role-map-source ../../.claude/commands/feature.md --project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md`, Cloud.ru contour passed 14 requirements/14 claims. Aggregate returned exit1: `VERDICT traceability=FAIL features=32 gaps=11 inconclusive=30`. Eleven duplicate claims are in pre-existing project Pseudocode; thirty legacy feature folders lack numbered specification slots. This task has no ownership to repair those unrelated artifacts. Do not commit or advance on own-contour pass alone. Coordinator next action: establish an approved canonical feature-scoped gate boundary without weakening checks, or assign separate repair of historical role-map evidence. Full diagnostics and source binding are preserved in `/tmp/n5-cloudru-provider-plan-terminal-20261026.md`.
