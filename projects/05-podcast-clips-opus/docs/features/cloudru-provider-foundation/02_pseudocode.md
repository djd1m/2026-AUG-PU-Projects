# Cloud.ru provider foundation — Pseudocode

Baseline and closed names: `01_specification.md`. Only this document owns logical data structures. No new public API routes.

## Data Structures

`Backend = openrouter | cloudru`; `Mode = live | fake`; `ExecutionProvider = openrouter | cloudru | fake`.
`LlmConfig = {mode, provider: Backend, baseUrl, model, apiKey: string|null}`; baseUrl/model follow specification's exact provider mapping.
`SttConfig` retains existing OpenRouter fields plus provider; no usable Cloud.ru STT config exists yet.
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

### Algorithm: Refuse deferred STT

REQUIREMENT: `FR-cloudru-provider-foundation-2`
REQUIREMENT: `AC-cloudru-provider-foundation-2`
REALISES: SC-US-001-2

1. If STT backend is cloudru, throw the exact unsupported error from specification before constructing a transcriber, reading a chunk or making any request; this also applies in fake tests.
2. Otherwise keep existing OpenRouter JSON/base64 contract, Together pin, actual-word parser, retry ceiling and no fallback unchanged.

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

## API and Data Flow

Existing select job → fenced DB authorization/quota → fsynced attempt event → selected Selector → unknown response → existing strict local validator → fenced acceptSelection/enqueue. Errors → current failed state and outcome event. No schema mode negotiation, automatic discovery or live startup probe.

## Scenario Coverage

Scenarios in `01_specification.md`: 6 · claimed by an algorithm: 6.

Not claimed by any algorithm:

none

Claimed by an algorithm but absent from Specification.md:

none
