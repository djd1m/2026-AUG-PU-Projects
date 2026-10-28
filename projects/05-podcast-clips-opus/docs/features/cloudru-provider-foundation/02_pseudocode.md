# Cloud.ru provider foundation — Pseudocode

v4 PLAN, 2026-10-27; closed names and authority: 01_specification.md. Preserve v1 chat/S3 algorithms and existing parser/chunker/merge. No new public route or asynchronous provider job.

## Data Structures

`LlmBackend = openrouter | cloudru`; operational `SttBackend = openrouter | yandex`; selector cloudru retains the existing refusal. `Mode = live | fake`.
`ExecutionProvider = openrouter | cloudru | yandex | fake`; use narrower LLM/STT selections at config/dispatch boundaries so extending identity cannot select Yandex chat.
`SttConfig` is immutable mode/provider/fixed model/selected apiKey and fixed transport; Yandex general/TLS host/mode are constants. `TranscriptionDependencies` carries actual provider/model; SpendEvent retains current identity/seconds/phase/result and adds these fields. Existing job_attempt nullable text columns hold attempt identity, no migration.
`FinalKey = (channel_tag, final_index)` with protocol-safe int64 index; `FinalPayload` retains first alternative actual words/text/times/languages. Map exists for one RPC only, not cross-job memory coordination. `TranscriptResult` remains unchanged language/words/segments.

## Core Algorithms

### Algorithm: Resolve provider configuration

REQUIREMENT: `FR-cloudru-provider-foundation-1`
REQUIREMENT: `AC-cloudru-provider-foundation-1`
REQUIREMENT: `NFR-cloudru-provider-foundation-1`
REALISES: SC-US-001-1
INPUT: role-specific environment.
OUTPUT: immutable selected config or startup error before network.

1. Parse current live/fake mode and separate closed LLM/STT selectors; absent alone defaults to OpenRouter, blank/unknown fails. Preserve exact Cloud.ru STT refusal before construction in all modes. Yandex LLM fails.
2. Keep existing LLM model mapping. Pin Yandex general, TLS stt.api.cloud.yandex.net:443, FULL_DATA/MP3/ru-RU/normalization-disabled; no endpoint/model variable.
3. In live require selected component key only. Fake only in test, key null and actual identity fake. Never choose provider from available secrets.
4. Project Yandex key only through actual STT entrypoint/compose/runtime; FM key remains LLM-only. No model key in web/video/other role. RETURN config; no startup probe.
COMPLEXITY: O(1).

### Algorithm: Transcribe Yandex final events strictly

REQUIREMENT: `FR-cloudru-provider-foundation-2`
REQUIREMENT: `AC-cloudru-provider-foundation-2`
REALISES: SC-US-001-2
INPUT: selected config, MP3 path/measured duration, caller signal and injected typed gRPC seam.
OUTPUT: unchanged TranscriptResult or sanitized nonretryable TranscriptError/classified ProviderError.

1. Preserve current fake and OpenRouter branch. For Yandex perform input/deadline checks from bounded pipeline algorithm; no Cloud.ru request branch.
2. Open fixed TLS client and create one RecognizeStreaming call at /speechkit.stt.v3.Recognizer/RecognizeStreaming with Api-Key metadata and retries disabled. Write exact session options, then bounded actual bytes honoring writable backpressure; half-close only input after bytes. No SDK retry/pacing experiment/fallback.
3. On each final read actual top-level channel_tag and audio_cursors.final_index, including zero. Require one consistent mono channel and valid nonnegative integral index. Keep first alternative. Canonical identical payload for an existing key is ignored; conflicting payload for that key throws TranscriptError and cancels the RPC. Ignore partial/refinement/EOU/status-only transcript content; never append both final and normalized refinement.
4. On successful complete RPC only, order retained finals by numeric final index for the selected channel. Validate decoded int64 timing as exact safe integral milliseconds before division by 1000; no parseFloat, exponent/whitespace coercion, fabricated zero or unit guessing. Respect legitimate protobuf-defined zero defaults. Copy actual word text/times and actual phrase text/times to N5 structures; no phrase-derived word timing.
5. Use the first valid nonblank language_code in final-index order when supplied; if every languages array is empty use request-derived ru. Malformed present language arrays/items fail. Require actual nonempty words and at least one usable actual text segment; pass through unchanged parseTranscript(duration). Worker/persistence parse again. RETURN only validated result after RPC success; partial data is discarded on error/cancel.
COMPLEXITY: O(input bytes + final words/segments); bounded per-call collection, no general event engine.

### Algorithm: Request documented chat and validate result

REQUIREMENT: `FR-cloudru-provider-foundation-3`
REQUIREMENT: `AC-cloudru-provider-foundation-3`
REQUIREMENT: `FR-cloudru-provider-foundation-4`
REQUIREMENT: `AC-cloudru-provider-foundation-4`
REQUIREMENT: `NFR-cloudru-provider-foundation-2`
REALISES: SC-US-002-1
REALISES: SC-US-002-2
INPUT: existing timestamped transcript segments/duration/caller signal.
OUTPUT: unknown candidate for existing local validation.

1. Preserve Cloud.ru JSON-object chat with exact FRAGMENTS_SCHEMA in prompt and no OR routing; preserve OpenRouter strict json_schema and provider pin unchanged.
2. One fixed selected HTTPS POST under 240000 ms including body read; reject redirects, malformed/refused/truncated envelope/JSON and never repair/retry/fallback.
3. Return unknown to validateFragments before acceptSelection. Keep existing candidate filtering, real-word snapping and all score/time/overlap rules. Zero fragments follow existing outcome.
4. Yandex adds only STT identity/client: fixed dependencies/protocol and bounded transport policy apply to that branch without changing chat. No client retry or new model request on failure.
COMPLEXITY: existing segment prompt/local validator behavior.

### Algorithm: Authorize and attribute a chat dispatch

REQUIREMENT: `FR-cloudru-provider-foundation-5`
REQUIREMENT: `AC-cloudru-provider-foundation-5`
REALISES: SC-US-003-1
INPUT: current attempt/selector/model/actual execution identity.
OUTPUT: exclusive current claim and existing selection outcome.

1. Keep existing authorizeSelection lock/fence/llm_dispatched/quota transaction and explicit actual provider/model parameters.
2. Refused claim returns before HTTP; accepted claim fsyncs current attempt record before selector. Local validation precedes fenced acceptSelection.
3. Preserve actual success/no_fragments/error outcomes, no history rewrite, no migration or replay. Competing handlers yield at most one dispatch.
COMPLEXITY: existing transaction + local validation.

### Algorithm: Verify reusable storage configuration offline

REQUIREMENT: `FR-cloudru-provider-foundation-6`
REQUIREMENT: `AC-cloudru-provider-foundation-6`
REALISES: SC-US-003-2
INPUT: existing S3 config/synthetic compound credential/injected SDK handler.
OUTPUT: offline signatures/regression evidence only.

1. Keep existing S3 clients/signParts/download signing, Cloud.ru endpoint/region/compound key, both path styles, 900-second expiry and filename disposition.
2. Preserve public signing/internal transport separation and multipart/render/retention regressions. No new Yandex bucket or storage driver.
3. Actual storage/browser acceptance remains a separate coordinator receipt; no live S3 request in offline checks.
COMPLEXITY: existing implementation.

### Algorithm: Authorize and attribute STT call

REQUIREMENT: `FR-cloudru-provider-foundation-7`
REQUIREMENT: `AC-cloudru-provider-foundation-7`
REALISES: SC-US-004-1
INPUT: existing fenced attempt/chunk/expectedPrevious, actual provider/model and limits.
OUTPUT: claimed ordinal or null, then current spend outcomes.

1. Runtime passes actual yandex/general (or OR/fake) explicitly; production worker never infers identity from keys. Fake identity is fake.
2. In existing authorizeSttCall conditional stt_calls UPDATE bind provider/model alongside ordinal under current lock/deadline/savepoint/initial-minute and retry-quota transaction. Preserve positional expectedPrevious and old-call compatibility only where required; production always passes identity. No second claim or DB migration.
3. Null => zero RPCs. Claim => append/fsync existing attributed attempt before opening/dispatching RPC. Only transient ProviderError may advance previousCall; at most three existing worker attempts. Format/conflicting-final/auth/config failures never retry; statuses/events are not extra billable attempt records.
4. Outcomes copy exact identity. Preserve initial whole-video quota/credit reservation and current retry-minute consumption without another customer debit. Keep fence acceptance and finalizeVideoCreditsTx; crashes remain started/unknown, never a free replay.
COMPLEXITY: current bounded transaction plus one event append per actual attempt.

### Algorithm: Bound transport and verify STT pipeline

REQUIREMENT: `FR-cloudru-provider-foundation-8`
REQUIREMENT: `AC-cloudru-provider-foundation-8`
REALISES: SC-US-004-2
INPUT: common MP3 chunk/measured duration, caller/job signal; offline >180-second pipeline fixture.
OUTPUT: bounded validated result or failure with no late persistence.

1. Retain common 25_000_000-byte guard. Before Yandex RPC stat/read bytes must be nonempty <=10_000_000 and duration finite >0 <=300. Existing mono extraction/pause-aware 180-second target/2-second overlap stay unchanged; no video-upload limit change.
2. Whole RPC uses 120000-ms deadline combined with caller/job abort. Cancel call and close owned client once on timeout, caller abort or terminal failure; remove listeners/timer, stop writes and reject late events. Wait for complete success status, not first final/end alone.
3. Retryable mapping is the closed transient set UNAVAILABLE, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED plus equivalent preclassified connection failures; caller cancellation/auth/config/INVALID_ARGUMENT and format conflicts are nonretryable. Do not broadly retry every gRPC error or create a client retry policy. Worker owns any allowed retry and quota.
4. Inject full-official-schema golden events plus adversarial duplicates/partials/errors to check cancellation and mapping; run unchanged extraction/chunk/merge/select/render on >180-second synthetic audio with overlap speech. Check offsets/deduplication, actual segment prompt, word snapping, chronological subtitles and current credit/source/fence controls. RETURN separate offline evidence.
COMPLEXITY: existing media pipeline and bounded one-call stream; no asynchronous job store.

### Algorithm: Preserve protocol evidence and remaining qualification

REQUIREMENT: `FR-cloudru-provider-foundation-9`
REQUIREMENT: `AC-cloudru-provider-foundation-9`
REALISES: SC-US-005-1
INPUT: root's source-bound Yandex short receipt and old incompatible Cloud probes.
OUTPUT: short protocol proven, migration/quality/long journey pending.

1. Verify ready/result/response/proto-manifest hashes from research note; retain 5.26175-second own synthetic fixture, gRPC0, 0.5605392-second duration, two finals/10 words. Natural recognition is imperfect; do not turn one short elapsed value into a bound/SLA.
2. Preserve Cloud Whisper words:null and GigaASR empty result as historical negative controls; retain Cloud STT startup refusal, no new Cloud transport or automatic fallback.
3. Separate implementation checks from natural speech, full pause-aware chunk <=120 seconds, >180-second overlap/render and target/browser/storage receipts. Unit-economics update is separately assigned and required by owner; unknown bills/counters stay null.
4. No new paid request by planner/coder without root's concrete authority. Coordinator continues pending work after bounded handoff; only fresh accepted receipts can close remaining migration AC.
COMPLEXITY: source/evidence inspection, zero new inference in PLAN.

## API and Data Flow

Existing STT quota/ordinal/provider claim → fsynced attempt → selected Transcriber (Yandex one TLS bidi call) → complete success plus strict final mapping → unchanged chunk merge → fenced acceptTranscript → segment-only selection → word snapping/render. No REST audio endpoint or async job/poll state is added. Chat/S3 flow remains v1.

## Scenario Coverage

Scenarios in 01_specification.md: 9 · claimed by an algorithm: 9. Naming coverage is not semantic or runtime proof.

Not claimed by any algorithm:

none

Claimed by an algorithm but absent from Specification:

none
