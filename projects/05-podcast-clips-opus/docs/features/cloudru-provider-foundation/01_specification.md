# Cloud.ru provider foundation — Specification

Status: PLAN, 2026-10-26. Baseline: `c559673649460fa5d8ef1e5e3c86bf7053ebbb69`.
Feature slug: `cloudru-provider-foundation`. Parent approved the technical decision: documented chat JSON-object generation, schema in prompt, strict existing local schema and semantic validation. This is not strict schema generation supplied by Cloud.ru.

## Executive Summary

Prepare an optional Cloud.ru chat provider without changing the podcast-to-clips product or claiming the whole Cloud.ru migration is complete. Existing OpenRouter behavior remains available through explicit selection; Cloud.ru STT is rejected until its audio and word-timestamp wire contract is established. Existing S3 transport is reused. No deployment, paid calls, resource creation or real content access is authorized by this feature's implementation.

Mode 2: project PRD/CLAUDE and scaffold are inputs, not generated outputs. Explore is skipped because the coordinator supplied product brief, research and solution decision. Parent order is credit packages/bonus → this foundation → later capability/target launch → actual four Metrika goals. Only this foundation is described here.

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

Selecting Cloud.ru STT fails clearly before any HTTP call. The error states that its word-timestamp contract is unconfirmed. Existing OpenRouter STT remains unchanged; no fabricated word timings or provider fallback is introduced.

### AC-cloudru-provider-foundation-2

[SC-US-001-2] Deferred STT fails closed
Given `N5_STT_PROVIDER=cloudru`, when STT configuration loads, then it throws `Cloud.ru STT не поддерживается: контракт таймкодов слов не подтверждён` and dispatch count is zero. Word-timestamp rejection tests remain green for OpenRouter.

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

## Non-Functional Requirements

### NFR-cloudru-provider-foundation-1

Security: new FM key appears only in STT/LLM worker environment wiring as needed, never web/video/browser, logs, fixtures or receipts. Fixed HTTPS chat endpoint, redirects rejected, existing account isolation/quota/fences retained. Synthetic fixture secrets only. Production fake is forbidden. No arbitrary base-URL option is added.

### NFR-cloudru-provider-foundation-2

Bounded behavior: preserve one LLM dispatch per authorized attempt, 240000 ms selection timeout covering body reads, existing 120000 ms STT request timeout and three STT attempts. Add no repair loop, alternate-provider call or retry on schema failure. No new cache/index/background process, performance promise or provider SLA is introduced.

## Closed environment canon

| Name | Allowed values / rule |
|---|---|
| N5_MODEL_PROVIDER | Existing live or fake; fake only NODE_ENV=test |
| N5_LLM_PROVIDER | openrouter or cloudru; absent defaults openrouter; empty invalid |
| N5_STT_PROVIDER | openrouter or cloudru; absent defaults openrouter; cloudru always unsupported in this scope |
| N5_LLM_MODEL | OpenRouter: existing anthropic/claude-sonnet-5 or google/gemini-3.8-flash; Cloud.ru: deepseek-ai/DeepSeek-V4-Pro |
| OPENROUTER_API_KEY | Required for selected live OpenRouter component only |
| CLOUDRU_FM_API_KEY | Required for selected live Cloud.ru LLM only; Foundation Models API-key Key Secret |
| S3_ENDPOINT / S3_PUBLIC_ENDPOINT | Existing origin settings; Cloud.ru example https://s3.cloud.ru for both |
| S3_REGION / S3_BUCKET | ru-central-1 example / operator-approved bucket name |
| S3_ACCESS_KEY / S3_SECRET_KEY | `<tenant_id>:<key_id>` / Key Secret; examples only |
| S3_FORCE_PATH_STYLE | Existing true or false, matched to bucket naming; template false retained |

No new model, endpoint, schema-mode, fallback, billing or analytics environment names are permitted. Existing DB/Redis/limits/origin variables stay under their existing contracts. Constants: Cloud.ru base `https://foundation-models.api.cloud.ru/v1`, request `/chat/completions`, nonstreaming `stream:false`.

## Feature Matrix

| Foundation scope | Later capability/launch scope | Excluded |
|---|---|---|
| Typed config, JSON-object chat adapter, local validation, attribution, offline S3 safety | Cloud.ru Whisper wire + actual word timestamps; authorized RF server tests | Current-VPS rollout, paid calls, new resources, purchases, model fallback, finance changes, Metrika verification |

## Success Metrics

| Metric | Target at foundation handoff | Source |
|---|---|---|
| AC covered by executable checks | All six after implementation | ручное измерение: packaged completion gate and fresh test receipts |
| HTTP dispatches for one accepted mock selection | 1; 0 on quota refusal | наш журнал |
| Provider mismatch between dispatch and stored record | 0 in focused fixtures | наша БД |
| External calls during offline suite | 0 | ручное измерение: injected fetch/SDK handler assertions |
| Actual model cost, target latency, live S3 pass | Unknown, not an acceptance claim for this feature | ручное измерение: later authorized RF-server receipt |

Full Cloud.ru migration remains incomplete after foundation delivery. Unknown external capabilities cannot be promoted by configuration or mock results.
