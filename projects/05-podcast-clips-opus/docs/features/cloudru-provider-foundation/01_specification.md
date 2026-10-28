# Cloud.ru provider foundation — Specification

Status: **v4 PLAN**, 2026-10-27; Yandex STT implementation pending. Source baseline `ff80cdd07311c98e3d5f0fd2bfbf42deea5ecee7` (coordinator counterpart `081d2860`). Feature slug: `cloudru-provider-foundation`. Existing Cloud.ru DeepSeek chat and S3 remain the v1 regression contour.

## Executive Summary

Add an explicitly selected Yandex SpeechKit v3 word-timed Transcriber in the existing worker. Preserve the default OpenRouter path, Cloud.ru chat/S3, strict transcript acceptance and existing financial/source invariants. Cloud.ru STT retains its existing startup refusal: five Whisper probes returned no usable words; GigaASR's empty result is not an approved fallback. The proposed Cloud.ru STT transport is withdrawn in v4.

Owner selected another RF STT with real word timing, supplied `YANDEX_SPEECHKIT_API_KEY`, and requested unit-economics updates if SpeechKit is adopted. Coordinator's separately authorized short v3 FULL_DATA probe returned two finals/10 actual timed words; this is protocol evidence only. Natural-speech quality, a full pause-aware chunk under 120 seconds, overlap/render journey and target rollout remain unqualified. Economics documents have a separate assigned author; this planner edits only the existing five SPARC roles plus research note.

## Version, authority and role map

The 2026-10-27 owner instructions and eight-hour autonomy authorize this finite v4 plan without another approval request. They do not authorize unspecified paid calls, production, new resources or a hidden fallback. v4 supersedes v2/v3 optional Cloud.ru Whisper transport plans: FR-2/AC-2 now describe Yandex; the old Cloud.ru refusal is retained under FR-1/AC-1. v1 LLM/S3 requirements and historical completion receipts remain frozen at `0c42dfb1acd7f5085517ddde57f11d1f04781e66`; old 1092-test/21-mutation results are not v4 evidence. Prior validation/review reports remain historical until freshly rebound.

Mode 2 /feature: `specification=01_specification.md`, `pseudocode=02_pseudocode.md`, `architecture=03_architecture.md`, `refinement=04_refinement.md`, `completion=05_completion.md`; target is this existing folder. Explore/research inputs are supplied; no new feature folder/scaffold. Existing owner-approved selected-contour evidence boundary and official gates/thresholds stay unchanged. Root owns cold VALIDATE, native gates, source integration and cold REVIEW; no coder exists at this PLAN handoff.

## Inherited constraints

Apply project CLAUDE, PRD/REPRODUCE, root Specification/Architecture reconciliation, model-cost contract and ADR-003/006. Do not edit the frozen root product spec, shared transcript parser, extractor/chunker/merge, credit engine or old receipts. Actual words remain mandatory before select. Quota/claim/fsync precede paid RPC; stale results cannot persist/enqueue. Existing attempt retry, source ownership, all eight limits and customer-credit finalization remain required.

## User Stories with Acceptance Criteria

US-001: As the operator, I want explicit typed provider selection so invalid config cannot silently spend elsewhere.

### FR-cloudru-provider-foundation-1

Keep LLM backend allowlist `openrouter|cloudru`; add operational STT backend `openrouter|yandex`. Recognize `N5_STT_PROVIDER=cloudru` only to retain the exact existing unsupported-word-contract startup error in all modes, before a transcriber/network is created. Absent selectors default to OpenRouter; blank/unknown selectors fail. Fake remains test-only and never makes a live call. Each live worker requires only its selected provider's key. Yandex is not a valid LLM backend, and key presence never selects a provider.

### AC-cloudru-provider-foundation-1

[SC-US-001-1] Closed independent provider configuration
Given Cloud.ru LLM with exact DeepSeek model and synthetic FM key, and/or explicit yandex STT with synthetic Yandex key, when each worker loads its own config, then selected keys alone suffice and secrets remain worker-scoped. Missing selected key, blank/unknown selector or yandex LLM fails before network. Cloud.ru STT retains `Cloud.ru STT не поддерживается: контракт таймкодов слов не подтверждён` with zero dispatch. Absent selectors still select OpenRouter; production fake fails and test fake records fake.

### FR-cloudru-provider-foundation-2

For explicit yandex STT create only TLS gRPC `/speechkit.stt.v3.Recognizer/RecognizeStreaming` at fixed `stt.api.cloud.yandex.net:443`. Fixed options: model `general`, audio container `MP3`, mono input from existing 16-kHz/64-kbit extraction, `FULL_DATA`, language WHITELIST `[ru-RU]`, `TEXT_NORMALIZATION_DISABLED`. Send `authorization: Api-Key <selected key>` metadata; no URL/model override, fallback, async operations, new bucket, diarization, LLM postprocessing or local model.

Send session options once, then bounded actual audio-byte chunks with backpressure, then half-close input; collect final events until successful RPC completion. Key finals by actual top-level channel_tag and audio_cursors.final_index; valid index zero must be preserved. Ignore partial/refinement/EOU/status-only events for transcript text; exact duplicate finals deduplicate, conflicting duplicates fail nonretryably. Select first alternative deterministically. Preserve only one consistent mono channel; do not concatenate several channels or hypotheses.

Map actual word text/start_time_ms/end_time_ms and actual phrase text/start_time_ms/end_time_ms to word/segment seconds by checked int64 milliseconds /1000, then unchanged parseTranscript at adapter/worker/persistence. Require nonempty actual words and usable actual segment text. Empty languages arrays, as observed live, may use request-derived `ru`; malformed present language/timing structures fail. Never infer timestamps from words, phrase boundaries or text. Protocol-defined scalar zero is valid; an arbitrary missing/malformed decoded field is not permission to insert zero.

### AC-cloudru-provider-foundation-2

[SC-US-001-2] Word-timed gRPC protocol and strict response mapping
Given injected gRPC and the pinned full-official-schema golden, when Yandex transcribes a real temporary MP3, then one fixed TLS RPC carries exact options/audio and maps the two-final/10-word proof to seconds and usable segments. Byte/field-number compatibility is checked against the independent golden, not just our projection. Partial/refinement events never duplicate words; exact duplicate finals add nothing; conflicting indices, missing words/times, malformed int64s, unsafe values, bad envelopes or empty context fail before acceptTranscript/select without repair/retry/fallback. OpenRouter/fake controls retain their existing behavior.

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

US-004: As the operator, I want STT attributed and bounded by existing attempt machinery so a new backend cannot bypass quotas or charge the customer twice.

### FR-cloudru-provider-foundation-7

Runtime supplies actual STT provider `openrouter|yandex|fake` and fixed selected model (`general` for Yandex) to worker dependencies, authorizeSttCall and current SpendEvent. Fill existing job_attempt.provider/model with bound parameters in the same successful call-ordinal UPDATE/transaction; enrich existing JSONL attempt/outcome events, with no migration, new paid ledger or backfill. Fake records fake. Initial whole-video minutes/credit reservation stay once per current contract; retries consume existing retry quota without another customer-credit debit. Preserve locks/savepoints/fences/ordinal ownership and finalizeVideoCreditsTx behavior.

### AC-cloudru-provider-foundation-7

[SC-US-004-1] Exclusive attributed STT dispatch
Given competing handlers for one fenced ordinal, when Yandex/fake/OpenRouter fixtures run in the existing isolated DB, then only one claim dispatches; actual provider/model is stored and attempt event fsynced before RPC. Quota refusal/stale claim has zero RPCs; retryable transport failure/timeout remains counted up to the existing three-call maximum. Format/conflicting-final rejection never advances a retry ordinal. Customer reservation/finalization remains idempotent across retry, refusal, stale result and redelivery.

### FR-cloudru-provider-foundation-8

Retain common nonempty STT MP3 input ceiling 25_000_000 bytes and unchanged extraction/chunking: 180-second target, pause-aware cuts within target ±20 seconds, 2-second overlap. Yandex additionally checks <=10_000_000 bytes (conservative decimal interpretation of documented 10 MB), finite measured chunk duration >0 and <=300 seconds before RPC; both stat and read size are checked. Do not turn this into a new original-video size limit or change shared constants/chunker to 300 seconds.

Keep 120000 ms request deadline through upload, all result events and final status; caller/job abort cancels the RPC, closes resources and prevents late acceptance. No adapter retry loop or gRPC transparent retry policy; existing worker owns three attempts and 30-minute job deadline. Retry only classified transient transport statuses; malformed response/timing, configuration/auth and conflicting finals are nonretryable. Complete only on normal RPC success plus validated actual transcript, never on the first final/event/end alone. Current offsets/deduplication/clamp diagnostics, word snapping and subtitle rendering remain unchanged.

### AC-cloudru-provider-foundation-8

[SC-US-004-2] Provider limits, cancellation and pipeline regression
Given Yandex-shaped injected finals for >180-second synthetic audio with speech across a pause/overlap, when existing extraction/chunk/merge/select/render runs offline, then offsets/deduplication, actual segment context, word snapping and chronological subtitles remain correct. Empty/>10MB/>300s Yandex input causes zero RPCs; exact valid limits are covered. A stalled upload/result/status exceeds neither 120000 ms nor caller deadline, cancels once and cannot accept late events; error status after finals still fails. This is offline pipeline proof, not natural-speech quality or a live long-file pass.

US-005: As the operator, I want live evidence separated from implementation results so successful protocol work is never reported as completed migration.

### FR-cloudru-provider-foundation-9

Coordinator short protocol evidence is available: own synthetic Russian MP3, 5.26175 seconds/43245 bytes, fixed Yandex general/FULL_DATA/MP3/ru-RU/normalization-disabled request; gRPC status 0, 0.5605392 seconds elapsed, two finals and 10 words with int64 millisecond strings. Output recognition is imperfect. Response SHA256 `f4e38ddb339d44aafaff0f30004e991a62a91c18d297f5830a613e60bb372ecd`; source manifest pins official cloudapi `b5702253b8216fa5cdac9f70509ed608eb0f17f5`. This proves a short protocol path only; no N5 build, natural-speech quality, latency SLA, long chunk or full user journey is accepted by it.

### AC-cloudru-provider-foundation-9

[SC-US-005-1] Bounded actual protocol proof with honest remaining qualification
Given the source-bound short receipt, when readiness is reported, then mark short Yandex protocol/timed-word receipt proven and overall live acceptance partial. Keep natural Russian speech/word-origin checks, representative pause-aware chunk within the unchanged 120-second deadline, >180-second overlap/render journey, target/server/browser/storage acceptance and unit-economics update explicitly pending until their own measured receipts. Do not resubmit unchanged probes or infer natural-speech quality from espeak. Additional paid calls require root's concrete fixture/budget/target authority; this PLAN author makes none. Cloud.ru STT remains refused; neither GigaASR nor another provider is a hidden fallback. Full migration is not complete.

## Non-Functional Requirements

### NFR-cloudru-provider-foundation-1

Worker-only secrets: YANDEX_SPEECHKIT_API_KEY only worker-stt, CLOUDRU_FM_API_KEY only selected worker-llm, no model secrets in web/video/browser/logs/fixtures/receipts. Keep fixed TLS host, standard certificate verification and no untrusted authority/redirect/endpoint override. Preserve ownership/quota/fence/public-origin/production-fake guards. No global settings, VM/GPU/service, support message or automatic discovery.

### NFR-cloudru-provider-foundation-2

Bounded behavior: one authorized RPC per STT worker attempt, no retry in adapter/client; 120000-ms STT deadline and three worker attempts, existing 240000-ms chat timeout and no repair/fallback. Use only pinned @grpc/grpc-js 1.14.6 and @grpc/proto-loader 0.8.1 plus a readable bounded official protocol projection/descriptor, each file <500 lines. No full SDK/proto repository copy or hand-written generic protocol engine. Root owns lockfile integration. Preserve current memory/disk/source/credit budgets; no unmeasured performance or cost-saving claim.

## Closed environment canon

| Name | Allowed values / rule |
|---|---|
| N5_MODEL_PROVIDER | Existing live/fake; fake only NODE_ENV=test |
| N5_LLM_PROVIDER | openrouter/cloudru; absent OpenRouter; blank/unknown/yandex invalid |
| N5_STT_PROVIDER | openrouter/yandex; absent OpenRouter; cloudru recognized only for existing startup refusal; other/blank invalid |
| N5_LLM_MODEL | Existing OpenRouter anthropic/claude-sonnet-5 or google/gemini-3.8-flash; Cloud.ru deepseek-ai/DeepSeek-V4-Pro |
| OPENROUTER_API_KEY | Required only by selected live OpenRouter component |
| CLOUDRU_FM_API_KEY | Required only by selected live Cloud.ru LLM; not STT |
| YANDEX_SPEECHKIT_API_KEY | Required only by selected live Yandex STT; service-account SpeechKit key; no aliases or credential auto-discovery |
| S3_ENDPOINT / S3_PUBLIC_ENDPOINT | Existing configuration, Cloud.ru https://s3.cloud.ru example |
| S3_REGION / S3_BUCKET | Existing ru-central-1 example / operator-owned bucket |
| S3_ACCESS_KEY / S3_SECRET_KEY | Existing compound tenant_id:key_id / Key Secret |
| S3_FORCE_PATH_STYLE | Existing true/false configuration |

No STT model, endpoint, protocol-mode, fallback or extra billing environment names. Yandex RPC/model/mode are constants. Existing limits/origin/DB/Redis/billing variables retain current contracts. New vendor cost description belongs to the separately assigned unit-economics author, not a new spending gate or customer charge.

## Feature Matrix and Success Metrics

| v4 implementation scope | Qualification still pending | Excluded |
|---|---|---|
| Explicit Yandex adapter, protocol golden, strict mapping, actual STT attribution, offline pipeline; v1 LLM/S3 regressions | Natural-speech/long-chunk/full journey, unit-economics update, RF target and live storage receipts | Cloud.ru/GigaASR STT adapter, async jobs/new bucket, new paid ledger, automatic fallback, current-VPS/production release |

AC-1–8 require fresh executable checks; AC-9 has short protocol evidence only. Provider mismatch/duplicate customer debit target zero in DB/spend integration fixtures (source: наша БД/наш журнал). Offline external dispatch target zero (source: injected transport assertions). Actual bill and N5 production latency/quality remain unknown (source: later authorized measurements). Full migration remains incomplete until the accepted remaining work is delivered.
