# Cloud.ru provider foundation — Pseudocode

v3 PLAN, 2026-10-27; v1 algorithms are frozen at source `0c42dfb1acd7f5085517ddde57f11d1f04781e66`. Baseline and closed names: `01_specification.md`. Only this document owns logical data structures. No new public API routes.

## Data Structures

`Backend = openrouter | cloudru`; `Mode = live | fake`; `ExecutionProvider = openrouter | cloudru | fake`.
`LlmConfig = {mode, provider: Backend, baseUrl, model, apiKey: string|null}`; baseUrl/model follow specification's exact provider mapping.
`SttConfig = {mode, provider: Backend, baseUrl, model, apiKey: string|null}`; exact provider URLs/key mapping and fixed Whisper model follow specification. `TranscriptionDependencies` adds explicit executionProvider/model; existing SpendEvent adds these fields without changing attempt identity or unit semantics.
`Selector.select(TranscriptResult,duration,AbortSignal) -> unknown`; `TranscriptResult` retains language, real words and segments.
`SelectionDependencies` carries actual executionProvider, model, selector, limits, spendPath, pool and enqueue.
`SelectionSpend` retains existing attempt/outcome/result fields; provider becomes ExecutionProvider. No historical mutation.
DB `job_attempt.provider` and `.model` remain nullable text; current attempt is filled when dispatch is authorized. Logical provider values are the closed ExecutionProvider set. Fake derives from execution mode, never from a missing secret.

## Core Algorithms

### Algorithm: Resolve provider configuration

REQUIREMENT: `FR-cloudru-provider-foundation-1`
REQUIREMENT: `AC-cloudru-provider-foundation-1`
REQUIREMENT: `NFR-cloudru-provider-foundation-1`
REALISES: SC-US-001-1

1. Parse existing live/fake mode; reject fake outside test. Read each selector; absent means openrouter, blank/unknown throws before runtime workers start.
2. Validate selected model against provider-specific closed allowlist. Pin endpoint; do not read arbitrary base URL.
3. For live require the selected key only; fake has apiKey null and executionProvider fake. Never infer provider from available keys.
4. Entry points forward exact config names; compose supplies optional key strings without unconditional OpenRouter-required expansion. Runtime is authoritative for selected-key validity. Keys are absent from web/video wiring.

### Algorithm: Dispatch optional strict STT

REQUIREMENT: `FR-cloudru-provider-foundation-2`
REQUIREMENT: `AC-cloudru-provider-foundation-2`
REALISES: SC-US-001-2
INPUT: validated SttConfig, existing MP3 path, measured duration, caller signal.
OUTPUT: strict TranscriptResult or nonretryable format/timing error / classified ProviderError.

1. Test-only fake returns existing fixture; actual identity is fake. For live branch retain common pre/post-read nonempty 25_000_000-byte guards.
2. OpenRouter keeps its existing JSON/base64/verbose_json/Together-only body byte semantics. Cloud.ru creates FormData with real MP3 Blob, fixed filename/content type, model, response_format=verbose_json, temperature=0, language=ru, then append literal timestamp_granularities[] twice with word and segment. No manual multipart Content-Type, routing extension or other timestamp option. This accepted request returned words:null live; synthetic valid fixtures prove only adapter compatibility.
3. Combine caller signal and existing 120000 ms timeout; POST once to fixed selected endpoint with Bearer key and redirect=error. Keep timeout active through response-body read/JSON parse. Non-2xx cancels body; only existing 429/5xx, transport and timeout classifications are retryable by the worker. Invalid JSON/object shape/timing is nonretryable.
4. Cloud.ru alone maps an absent language field to requested ru; present malformed/empty values fail. Require segments array, at least one entry and nonblank text context; never manufacture segments from text/words. This is local conservative policy, not provider-contract evidence.
5. Pass actual words and all provided timing through unchanged parseTranscript(duration); do not coerce strings/units, unwrap guessed envelopes or fill timestamps. Worker/persistence validate again. Normalize JSON syntax and unusable-segment failures to existing TranscriptError, without logging body/keys. RETURN parsed transcript; schema failure returns no successful result.
COMPLEXITY: O(bytes + words + segments); existing bounded input memory, no SDK/model dependency.

### Algorithm: Request documented chat and validate result

REQUIREMENT: `FR-cloudru-provider-foundation-3`
REQUIREMENT: `AC-cloudru-provider-foundation-3`
REQUIREMENT: `FR-cloudru-provider-foundation-4`
REQUIREMENT: `AC-cloudru-provider-foundation-4`
REQUIREMENT: `NFR-cloudru-provider-foundation-2`
REALISES: SC-US-002-1
REALISES: SC-US-002-2

1. Build existing system prompt and user timestamped-segment payload. For Cloud.ru add exact serialized FRAGMENTS_SCHEMA to system instructions and response_format json_object, stream false; omit OpenRouter routing extensions. For OpenRouter retain existing strict json_schema/provider pin body without Cloud.ru additions.
2. Combine caller signal with 240000 ms timeout, POST once to selected fixed endpoint, reject redirects. Do not repair/retry on rejection.
3. Non-2xx cancels body and throws SelectionProviderError. Timeout remains active while body is consumed. Parse choices[0].message.content; reject invalid envelope, refusal, nonstring/empty content, explicit finish_reason length and invalid JSON as FragmentSchemaError.
4. Return unknown to existing select worker, which calls validateFragments before acceptSelection. Shape failure rejects all; existing semantic candidate filtering preserves valid candidates and removes invalid ones. Snapping uses actual transcript words; no acceptance directly from model JSON.
5. Schema/provider/timeouts do not trigger another mode or model. A zero-fragment valid result follows current no_fragments behavior.

### Algorithm: Authorize and attribute a dispatch

REQUIREMENT: `FR-cloudru-provider-foundation-5`
REQUIREMENT: `AC-cloudru-provider-foundation-5`
REALISES: SC-US-003-1

1. Runtime derives executionProvider = fake for fake execution, selected backend for live; supply provider and model explicitly with selector.
2. In authorizeSelection retain current lock, current-fence check, llm_dispatched conditional claim and quota/reservation semantics. Bind provider/model as SQL parameters to the authorized job_attempt update; no SQL interpolation or second claim.
3. If authorization refused, return without spend event/HTTP. Otherwise append and fsync attempt event with actual provider/model BEFORE selector dispatch.
4. Call selector once; strict local validation precedes acceptSelection. Outcomes append success/no_fragments/provider_error/timeout/schema_violation with same provider/model and attempt identity. Failure never erases attempt count; stale attempt results remain fenced.
5. Concurrent handlers have at most one successful dispatch claim. No DB migration or old-row relabeling.

### Algorithm: Verify reusable storage configuration offline

REQUIREMENT: `FR-cloudru-provider-foundation-6`
REQUIREMENT: `AC-cloudru-provider-foundation-6`
REALISES: SC-US-003-2

1. Load existing S3Config with synthetic compound credential and Cloud.ru origin/region. Do not create buckets or call service.
2. Use existing createS3Client/signParts/generateDownloadUrl; independently verify GET/PUT host, SigV4 region/credential, 900-second expiry, Unicode filename disposition and both path styles. Inject SDK handler for transport assertions.
3. Existing public signing client remains separate from internal transport. Retain multipart/list/complete/abort/render/retention checks; no provider-specific S3 branch.
4. Record offline-only verdict; actual RF-server/S3 capability acceptance remains pending.

### Algorithm: Authorize and attribute STT call

REQUIREMENT: `FR-cloudru-provider-foundation-7`
REQUIREMENT: `AC-cloudru-provider-foundation-7`
REALISES: SC-US-004-1
INPUT: existing fenced attempt/chunk/expectedPrevious, explicit actual provider/model and existing limits.
OUTPUT: claimed ordinal or null, then existing attempt/outcome events.

1. Runtime derives actual identity from mode/backend, passes it to TranscriptionDependencies; the worker never infers it from secret presence.
2. Extend authorizeSttCall with identity metadata using bound parameters in its existing conditional job_attempt UPDATE alongside stt_calls; retain lockCurrent, deadline, initial-minute check, expectedPrevious comparison, savepoint and retry-quota transaction. Legacy direct callers may retain an explicit backward-compatible OpenRouter/model default; production worker always passes identity, including fake. No second DB claim or migration.
3. On null RETURN with no HTTP. On claim, append/fsync existing attempt event with provider/model and ordinal before transcriber dispatch. Retryable failures alone may request previousCall=call, at most three calls; refusal/format failure never produces an extra call.
4. Outcome copies the exact event identity. Current job_attempt stores attempt-level selected provider/model; per-call history remains existing JSONL. Preserve credit reservation/finalization and initial whole-video quota; do not add a customer debit per chunk/retry. Crashes remain started/unknown and require current fenced recovery, never a free replay.
COMPLEXITY: existing bounded transaction + O(1) event append per call.

### Algorithm: Verify bounded STT pipeline offline

REQUIREMENT: `FR-cloudru-provider-foundation-8`
REQUIREMENT: `AC-cloudru-provider-foundation-8`
REALISES: SC-US-004-2
INPUT: synthetic MP3 >180 seconds with overlap speech and injected timed responses.
OUTPUT: offline chunk/selection/render assertions, never provider capability proof.

1. Exercise zero-fetch empty/oversize cases; simulated fetch/body stalls, caller abort, redirects, malformed JSON and provider errors with fake timers/injected transport. Assert exact existing timeout and worker retry ceiling.
2. Run unchanged extraction/chunker/merge with 180-second chunks and 2-second overlap, measured MP3 duration and chunk-relative timings; verify offsets, duplicate removal and timing-clamp diagnostics. No hardcoded new tolerance.
3. Require nonempty segment text in selectionMessage, validateFragments word snapping and chronological rendered subtitle output with existing media tools/tests. Verify stale acceptance cannot enqueue selection and source/customer-credit invariants remain unchanged. RETURN separate offline evidence.
COMPLEXITY: existing media pipeline; no new service/aligner/GPU.

### Algorithm: Preserve actual incompatibility and qualification boundary

REQUIREMENT: `FR-cloudru-provider-foundation-9`
REQUIREMENT: `AC-cloudru-provider-foundation-9`
REALISES: SC-US-005-1
INPUT: coordinator's five Whisper probe results, raw evidence SHA256 `2eb9e243634471f4fe34487defb5aea6b10dd0652e8d954a4d259b987e616739`.
OUTPUT: AC-9 not passed; explicit production restriction and pending long migration.

1. Record actual fixture duration 5.26175 seconds: JSON yielded text/usage; four verbose bracketed/bare word+segment and word-only variants yielded one segment from 0 to 4.66 and words:null. HTTP acceptance does not satisfy unchanged actual-word parsing.
2. Do not dispatch another unchanged probe, infer missing words, add upstream flags, repair timestamps or switch provider. AC-1–8 operate with injected fixtures only and cannot convert this live incompatibility into a pass.
3. Operator must not enable N5_STT_PROVIDER=cloudru for real users until a selected provider has a separately authorized actual word+usable-segment pass. Any new supported request requires new source evidence/authority and read-only companion readiness, never discovery at runtime.
4. Preserve GigaChat/GigaASR empty-text HTTP-200 result as research only. No GigaASR selector/code or Yandex/T-Bank dependency is added. Root owns the other RF-STT choice and separately authorized long-fixture chunk/subtitle journey; no Cloud coding starts before root's Yandex v3 FULL_DATA qualification result. Full migration remains pending.
COMPLEXITY: evidence inspection only; zero new inference calls in this scope.

## API and Data Flow

Existing select job → fenced DB authorization/quota → fsynced attempt event → selected Selector → unknown response → existing strict local validator → fenced acceptSelection/enqueue. Errors → current failed state and outcome event. No schema mode negotiation, automatic discovery or live startup probe.

STT job → existing measured source/probe quota → fenced call-ordinal/provider claim → fsynced attributed attempt → fixed selected Transcriber → strict actual-word/usable-segment acceptance → unchanged chunk offsets/merge → fenced acceptTranscript → selection. No new public API route.

## Scenario Coverage

Scenarios in `01_specification.md`: 9 · claimed by an algorithm: 9. FR-9/AC-9 preserves actual incompatibility and remains not passed; it is not a live-pass claim.

Not claimed by any algorithm:

none

Claimed by an algorithm but absent from Specification.md:

none
