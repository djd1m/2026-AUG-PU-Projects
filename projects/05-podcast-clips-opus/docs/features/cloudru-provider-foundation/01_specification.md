# Cloud.ru provider foundation — Specification

Status: v2 PLAN, 2026-10-27; implementation and live compatibility pending. Source baseline: `0c42dfb1acd7f5085517ddde57f11d1f04781e66`. v1 plan baseline was `c559673649460fa5d8ef1e5e3c86bf7053ebbb69`.
Feature slug: `cloudru-provider-foundation`. Parent approved the technical decision: documented chat JSON-object generation, schema in prompt, strict existing local schema and semantic validation. This is not strict schema generation supplied by Cloud.ru.

## Executive Summary

Prepare an optional Cloud.ru chat provider without changing the podcast-to-clips product or claiming the whole Cloud.ru migration is complete. Existing OpenRouter behavior remains the default. v2 adds an explicitly selected, conditional Cloud.ru STT adapter using the owner-provided donor request shape; it accepts only real timed words and usable segments. Actual Cloud.ru word timing remains unconfirmed. Existing S3 transport is reused. No deployment, paid calls, resource creation or real content access is authorized by this feature's implementation.

Mode 2: project PRD/CLAUDE and scaffold are inputs, not generated outputs. Explore is skipped because the coordinator supplied product brief, research and solution decision. Parent order is credit packages/bonus → this foundation → later capability/target launch → actual four Metrika goals. Only this foundation and its requested optional STT extension are described here.

## Version and authority boundary

The owner explicitly requested the Cloud.ru Whisper adapter on 2026-10-27, supplied `https://gitverse.ru/dzhechkov/stt-rag-app`, and authorized eight hours of autonomous continuation. The coordinator authorizes this finite v2 contract; autonomy does not authorize purchases, new resources, production, support messages or unspecified inference spend. The owner-approved selected-Cloud-contour evidence boundary remains; the official lifecycle and native gate thresholds are unchanged and owned by the coordinator.

v1 LLM/S3 code and its receipts are immutable history at baseline `0c42dfb1acd7f5085517ddde57f11d1f04781e66`. v2 explicitly supersedes **only** the old FR-2/AC-2 blanket Cloud.ru STT startup refusal with the conditional strict adapter below. Old AC-2 test results prove v1 refusal only. v1 FR-1/3/4/5/6 and all financial/source invariants remain required regressions; none of their old results establishes a v2 pass. Existing validation/review reports are historical until freshly rebound.

Research is [research-whisper-donor-20261027.md](research-whisper-donor-20261027.md). The donor is implementation evidence, not the provider's contract. Offline adapter behavior is implementable without assuming the service returns timing. FR-9/AC-9 live compatibility is deferred until an actual authorized response; it cannot enter Phase 3 as an established provider capability. Full migration remains pending.

## Inherited constraints

Read project `CLAUDE.md`, `docs/PRD.md`, `docs/REPRODUCE.md`, `docs/Specification.md`, `docs/Architecture.md`, `docs/model-cost-contract.md` and ADR-003/006 before implementation. Local word timestamps, quota-before-spend, dispatch fence and local fragment validation remain required. Root Architecture's older model table is superseded by its implementation reconciliation and REPRODUCE. Frozen root Specification is not edited in this scope.

## User Stories with Acceptance Criteria

US-001: As the operator, I want to select a documented provider at worker startup so that invalid configuration cannot silently dispatch to a different service.

### FR-cloudru-provider-foundation-1

Load typed, validated provider configuration using the closed environment canon below. Absent backend selectors retain existing OpenRouter behavior; an empty or unknown selector is invalid. Existing live/fake mode retains its semantics; fake remains test-only. A live provider requires only its own secret. Unsupported model/provider pairs fail at startup.

### AC-cloudru-provider-foundation-1

[SC-US-001-1] Selected provider configuration
Given live mode, an explicit Cloud.ru LLM selector, exact DeepSeek model and a synthetic Cloud.ru key, when configuration loads, then it resolves Cloud.ru without requiring an OpenRouter key. Unknown/empty selector, missing selected key or wrong model fails before network access. Existing absent selectors still resolve OpenRouter; production fake fails.

### FR-cloudru-provider-foundation-2

For explicit `N5_STT_PROVIDER=cloudru`, construct the optional adapter with fixed model `openai/whisper-large-v3`, fixed `https://foundation-models.api.cloud.ru/v1/audio/transcriptions`, Bearer FM key, multipart real MP3 (fixed filename `audio.mp3`, `audio/mpeg`), fields `model`, `response_format=json`, `temperature=0`, `language=ru`. Let FormData generate the boundary; omit OpenRouter JSON/base64/routing fields, `verbose_json` and timestamp flags. This is the owner-reference-derived request choice, not primary confirmation of a JSON timing schema. No SDK/dependency, URL override or provider negotiation.

Accept only an object with actual nonempty words through unchanged `parseTranscript` at adapter, worker and persistence boundaries. Absent language may become the explicitly requested `ru`; a present malformed/blank language is rejected. Cloud.ru additionally requires nonempty segments with some nonblank text because selection sends only segments. Missing/empty/malformed segments fail; no segment/text/timing synthesis. This conservative adapter policy is coordinator-approved, not a claimed Cloud.ru response requirement.

### AC-cloudru-provider-foundation-2

[SC-US-001-2] Optional transcription fails closed on unusable output
Given explicit Cloud.ru STT and a synthetic selected FM key, when a real temporary MP3 is dispatched through injected fetch, then exactly one fixed multipart JSON-format request is made; valid synthetic timed-word/segment fixtures pass unchanged parsing and absent language alone maps to ru. Text-only, segment-only, missing/empty words, missing/nonfinite word times, malformed JSON/envelope/language or unusable segments fail before acceptTranscript/select. No fallback, invented timing, repair request or schema-error retry occurs. Default OpenRouter request and test-only fake semantics remain unchanged.

US-002: As a producer, I want candidate fragments from the selected chat provider to pass the same local validation so that an invalid model response cannot become a rendered clip.

### FR-cloudru-provider-foundation-3

Cloud.ru Selector sends one nonstreaming POST to the fixed documented chat endpoint with Bearer authentication, exact DeepSeek model, `response_format: {type: 'json_object'}`, schema in prompt, timestamped segments and duration. It omits OpenRouter routing extensions. OpenRouter retains its existing strict schema generation request and provider pins. Cloud.ru never claims strict schema generation or silently retries with another format/provider.

### AC-cloudru-provider-foundation-3

[SC-US-002-1] Cloud.ru request and valid candidate
Given an injected fetch and a valid candidate fixture, when selection runs, then exactly one request has the fixed Cloud.ru URL, required JSON-object body and serialized FRAGMENTS_SCHEMA in the prompt, without OpenRouter provider extensions. Returned content must pass existing `validateFragments` before persistence. The OpenRouter request contract remains unchanged.

### FR-cloudru-provider-foundation-4

Reject malformed envelopes/JSON, explicit refusal, missing/nonstring content and explicitly truncated completion (`finish_reason=length`). Existing strict local shape and semantic checks remain the acceptance boundary: unknown fields and wrong schema fail; invalid candidates are filtered according to existing rules; valid candidates may survive alongside invalid ones. Word snapping, length/overlap and score rules remain unchanged. No LLM request is added for repair.

### AC-cloudru-provider-foundation-4

[SC-US-002-2] Invalid response and failure paths
Given malformed/refused/truncated/extra-field fixtures, out-of-range candidates and a stalled body, when selection runs, then the existing local rejection/filtering rules and timeout error apply; rejected shapes never reach acceptSelection; there is no fallback or extra request. A body timeout remains bounded by existing 240000 ms selection timeout.

US-003: As the operator, I want attempts attributed to the actual execution provider and existing S3 settings verified offline so that operational records and migration readiness are accurate.

### FR-cloudru-provider-foundation-5

Pass actual execution provider through runtime, worker dependencies, selection authorization and JSONL spend events. Values are `openrouter`, `cloudru`, `fake`; fake execution is labeled fake. Persist provider/model with existing dispatch claim/quota ordering, not a hardcoded OpenRouter string. Do not rewrite history or add a DB migration. The existing attempt is counted before HTTP, including timeout/provider/schema failures.

### AC-cloudru-provider-foundation-5

[SC-US-003-1] Actual attribution and exclusive dispatch
Given selected provider and two competing handlers for the same attempt, when authorization/selection executes in the existing isolated integration environment, then at most one dispatch occurs, quota and durable attempt logging precede it, and DB plus ledger record actual provider/model. Quota refusal yields zero requests; timeout remains counted. Fake dispatch records fake.

### FR-cloudru-provider-foundation-6

Reuse `packages/s3` without a new transport. Document the Cloud.ru key format and existing private/presigned configuration. Add offline signing assertions for Cloud.ru endpoint, region and compound key; retain public-signing/internal-transport isolation, 900-second expiry and both path styles. No live storage compatibility claim follows.

### AC-cloudru-provider-foundation-6

[SC-US-003-2] Offline S3 configuration safety
Given synthetic `<tenant_id>:<key_id>` credentials and Cloud.ru endpoint configuration, when signing GET and multipart PUT under both addressing styles with an injected request handler, then signatures bind the intended host/region/credential, expire after 900 seconds and retain filename disposition; zero external requests occur. Existing S3 multipart/render/retention regressions pass.

US-004: As the operator, I want STT execution attributed and bounded by the existing attempt machinery so that selecting Cloud.ru cannot bypass quotas or charge the customer twice.

### FR-cloudru-provider-foundation-7

Runtime supplies explicit actual STT provider (`openrouter|cloudru|fake`) and fixed model to worker dependencies, `authorizeSttCall` and existing SpendEvent. Fill existing `job_attempt.provider/model` with bound SQL parameters in the same conditional call-ordinal update and transaction; enrich current JSONL attempt/outcome events without new tables/ledgers/services. Fake records fake. Preserve current call identity, fsync-before-HTTP, quota/fence/savepoint/retry/credit-finalization behavior and historical rows. Initial video minutes are not recharged per initial chunk; retry minutes remain counted by the existing quota path. Provider-attempt accounting does not create another customer-credit debit.

### AC-cloudru-provider-foundation-7

[SC-US-004-1] Exclusive attributed STT dispatch
Given two handlers for the same fenced call ordinal, when Cloud.ru/fake/OpenRouter fixtures execute against the existing isolated DB, then only one claim can dispatch, actual provider/model is stored before HTTP and JSONL attempt fsync precedes HTTP. Quota refusal or stale claim gives zero requests; retryable timeout/429/5xx attempts remain counted up to the existing three-call maximum. Format/timing rejection never advances a retry ordinal. Existing customer reservation/finalization stays idempotent across retry, refusal and redelivery.

### FR-cloudru-provider-foundation-8

Retain 25_000_000-byte nonempty MP3 ceiling checked before/after read, 120000 ms request timeout including complete response-body parsing, caller/job cancellation and rejected redirects. No adapter retry loop; the worker owns current retry policy and 30-minute job deadline. Unchanged 180-second chunks, 2-second overlap, measured MP3 offsets/deduplication and existing timing-clamp diagnostics must feed usable segment prompts, word-snapped selection and rendered subtitles.

### AC-cloudru-provider-foundation-8

[SC-US-004-2] Bounded transport and pipeline regression
Given injected valid Cloud.ru-shaped responses for a fixture longer than 180 seconds with speech across overlap, when the existing extraction/chunk/merge/select/render pipeline runs offline, then offsets, deduplication, chronological subtitle timing and usable segment context are preserved. Empty/oversize input yields zero fetch calls; a stalled body times out within 120000 ms; redirects and invalid formats fail without fallback. Actual Cloud.ru output quality is not inferred from this synthetic integration.

US-005: As the operator, I want separately evidenced real compatibility so that offline implementation is never represented as completed migration.

### FR-cloudru-provider-foundation-9

Deferred live qualification: only after a private FM key and concrete authorized one-request budget/fixture/environment are available, a bounded probe may send one short synthetic Russian MP3 with the exact FR-2 request. The owner reference authorizes this request choice; no undocumented timing flags or alternate-format trial. Credentials alone do not authorize dispatch. Missing key currently blocks this step while offline work continues. A real strict word+segment response and a separately authorized long-fixture chunk/render journey are required for full migration.

### AC-cloudru-provider-foundation-9

[SC-US-005-1] Honest live-capability receipt (deferred)
Given explicit key/environment/fixture/spend authorization, when at most one short probe executes, then a redacted source/request/response receipt records status, duration, real words and segments, numeric timing units/origin evidence, actual returned usage and billing evidence if available; unknown values remain null. Success requires unchanged strict parsing and usable segment context, with no invented word timings. Failure/text-only output preserves an explicit incompatibility result and zero automatic retries; long-fixture acceptance remains pending until separately authorized and passed. Without prerequisites, dispatch count is zero and live acceptance is pending.

## Non-Functional Requirements

### NFR-cloudru-provider-foundation-1

Security: new FM key appears only in STT/LLM worker environment wiring as needed, never web/video/browser, logs, fixtures or receipts. Fixed HTTPS chat/STT endpoints, redirects rejected, existing account isolation/quota/fences retained. Synthetic fixture secrets only. Production fake is forbidden. No arbitrary base-URL option is added.

### NFR-cloudru-provider-foundation-2

Bounded behavior: preserve one LLM dispatch per authorized attempt, 240000 ms selection timeout covering body reads, existing 120000 ms STT request timeout through response-body parsing and three worker-owned STT attempts. Add no repair loop, alternate-provider call or retry on schema failure. No new cache/index/background process, performance promise or provider SLA is introduced.

## Closed environment canon

| Name | Allowed values / rule |
|---|---|
| N5_MODEL_PROVIDER | Existing live or fake; fake only NODE_ENV=test |
| N5_LLM_PROVIDER | openrouter or cloudru; absent defaults openrouter; empty invalid |
| N5_STT_PROVIDER | openrouter or cloudru; absent defaults openrouter; explicit cloudru selects the conditional strict multipart adapter |
| N5_LLM_MODEL | OpenRouter: existing anthropic/claude-sonnet-5 or google/gemini-3.8-flash; Cloud.ru: deepseek-ai/DeepSeek-V4-Pro |
| OPENROUTER_API_KEY | Required for selected live OpenRouter component only |
| CLOUDRU_FM_API_KEY | Required for each selected live Cloud.ru worker only; Foundation Models API-key Key Secret |
| S3_ENDPOINT / S3_PUBLIC_ENDPOINT | Existing origin settings; Cloud.ru example https://s3.cloud.ru for both |
| S3_REGION / S3_BUCKET | ru-central-1 example / operator-approved bucket name |
| S3_ACCESS_KEY / S3_SECRET_KEY | `<tenant_id>:<key_id>` / Key Secret; examples only |
| S3_FORCE_PATH_STYLE | Existing true or false, matched to bucket naming; template false retained |

No new model, endpoint, schema-mode, fallback, billing or analytics environment names are permitted. Existing DB/Redis/limits/origin variables stay under their existing contracts. Constants: Cloud.ru base `https://foundation-models.api.cloud.ru/v1`, chat `/chat/completions` nonstreaming `stream:false`; STT `/audio/transcriptions`, fixed `openai/whisper-large-v3`. No STT model selector is added.

## Feature Matrix

| Foundation scope | Later capability/launch scope | Excluded |
|---|---|---|
| v1 chat/S3 preserved; v2 optional strict multipart STT, actual attribution and offline pipeline checks | AC-9 actual word/segment compatibility; authorized long RF-server journey and S3 acceptance | Current-VPS rollout, paid calls, new resources, purchases, model fallback, finance changes, Metrika verification |

## Success Metrics

| Metric | Target at foundation handoff | Source |
|---|---|---|
| AC covered by executable checks | Active AC-1–8 after fresh implementation; AC-9 deferred live qualification | ручное измерение: packaged completion gate and fresh test receipts |
| HTTP dispatches for one accepted mock selection | 1; 0 on quota refusal | наш журнал |
| Provider mismatch between dispatch and stored record | 0 in focused fixtures | наша БД |
| External calls during offline suite | 0 | ручное измерение: injected fetch/SDK handler assertions |
| Actual model cost, target latency, live S3 pass | Unknown, not an acceptance claim for this feature | ручное измерение: later authorized RF-server receipt |

Full Cloud.ru migration remains incomplete after foundation delivery. Unknown external capabilities cannot be promoted by configuration or mock results.
