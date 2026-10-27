# Cloud.ru provider foundation — Refinement

v4 PLAN, 2026-10-27. Planner runs document checks only. Root's short Yandex protocol proof is distinct from implementation/offline integration and pending natural/long/target acceptance.

## Edge Cases Matrix

| Scenario | Input | Expected | Enforcement |
|---|---|---|---|
| Provider config | Missing/blank/unknown selector or selected key | Startup fail, zero external work | Separate closed selectors; absent alone defaults OR |
| Withdrawn Cloud STT | cloudru STT in live or fake | Existing exact unsupported startup error | No transcriber/network construction |
| Wrong secret scope | Only another provider key exists | Selected live backend fails | Actual entrypoint+compose projection; no key inference |
| Yandex size/duration | Empty/>10MB/>300s/nonfinite input | Zero RPCs | Stat/read guards plus measured duration; common25MB preserved |
| Protocol drift | Field number/enum/method differs | Interoperability test fails | Complete-official-schema golden independent of production projection |
| Finals | Partial/refinement or repeated final | Only finals; exact duplicate once, conflicting key fails | Key actual top-level channel + final_index; zero valid |
| Bad words | Missing/empty words, blank word, invalid/unsafe ms | Nonretryable TranscriptError | Typed decoded boundary then unchanged strict parser |
| No context/language | Empty phrase text; empty languages arrays | Empty context fails; empty languages alone derives requested ru | No segment/time generation or malformed-language fallback |
| Cancellation/status | Stall/abort/error after final/late event | No success/persistence, RPC cancelled/closed | 120s/caller/job deadline through final status |
| Race/quota | Two handlers/same ordinal; refusal/stale | One authorized dispatch or zero | Existing real DB transaction/fence/quota and fsync-before-RPC |
| History/credits | Timeout/retry/redelivery | Attempt remains counted; customer finalized once | Existing quota and reservation/finalization controls |
| Chat/S3 | Selected Yandex STT | v1 LLM/S3 behavior unaffected | Full existing regression suites |

## Testing Strategy

Unit tests use synthetic keys, injected gRPC and actual temporary MP3 files; no network. Verify fixed TLS host/method/model/MP3/FULL_DATA/WHITELIST/ru-RU/normalization-disabled, options-first/chunks/half-close, backpressure and actual bytes. Preserve OR request/fake behavior and Cloud startup refusal. No private environment or live keys are test inputs.

Protocol interoperability uses root's official-protocol-golden.json SHA256 `8d7a2f539e0eff0fc881b516f25deb78cc9ea971aa84313094b21c99f1005314`, generated with full official pinned schema. Compare production request encoding to golden and decode official response bytes into expected two finals/10 words. Do not merely encode/decode the project's own subset. Keep source manifest/provenance and distinguish re-encoded synthetic fixture from network capture. Build/import smoke must prove chosen protocol packaging works from built worker/container paths.

Response tests cover indices0/1, phrase/word time0, int64 millisecond strings, precise /1000 conversion, fractional/exponent/whitespace/unsafe malformed representations, duplicates/conflicts, wrong channel, partial/refinement noise, no-final/wordless/textless output and empty languages->ru. Existing parser timing-clamp/order diagnostics remain unchanged. No shape repair, inferred timing, punctuation alignment or new threshold.

Cancellation tests simulate stalled upload, write backpressure, readable events with no terminal status, status error after valid finals, caller abort before/during call, 120000-ms deadline and late final/status. Successful first final/end alone must not resolve. Check one cleanup/cancel for owned resources and no late accept/enqueue. Classify closed transient statuses only; UNAVAILABLE/DEADLINE_EXCEEDED/RESOURCE_EXHAUSTED can reach existing worker retry logic, while auth/config/format/conflicting-final and caller cancellation cannot. No client retry config.

Integration uses existing isolated PostgreSQL/Redis/MinIO environment: exclusive same-ordinal claims, yandex/general stored before RPC, matching fsynced event identity, quota/stale refusal before dispatch, timeout counting, max3 attempts, no retry on missing timing, and idempotent customer credits/source/fence behavior. Sequential mocks do not replace the required concurrent DB race. Existing chat/S3/credit/selection tests remain required.

Offline pipeline: own >180-second synthetic audio with speech across pause/overlap, current extraction/chunker/merge, injected official-shaped finals, actual segment-only selection input, word snapping and rendered karaoke/subtitle chronology. Pause-aware target180s means non-final lengths160..200s; do not assert hard180s chunks or change existing ±20s rule. This proves code integration, not model quality/long-file latency.

## Test Cases

```gherkin
Scenario: Explicit RF STT with preserved Cloud chat
  Given live yandex STT with a synthetic selected key and Cloud.ru DeepSeek LLM
  When config loads and injected protocol finals complete with successful RPC status
  Then real word and phrase milliseconds map to strict N5 seconds
  And only worker-stt receives the Yandex key and chat/S3 remain unchanged

Scenario: Conflicting final and late failure
  Given two different final payloads share one channel and final index
  When the second arrives, or terminal RPC error follows a valid final
  Then transcription is refused without format retry or late persistence

Scenario: Legacy provider prohibition
  Given cloudru STT is selected in any mode
  When startup configuration loads
  Then the exact existing unsupported error occurs before any request

Scenario: Shared financial ownership
  Given two handlers compete for one fenced STT ordinal
  When existing authorization and fsynced spend run before injected RPC
  Then at most one dispatch occurs with yandex/general identity
  And retry/refusal/redelivery cannot debit the customer a second time
```

These supplement the nine named Specification scenarios; planned prose is not future executable test-title coverage.

## Guard mutations and mandatory regression

One implementation pass → independent review → corrections for concrete findings. Each new guard needs red/restored-green proof. Mutate fixed host/model/FULL_DATA/MP3/normalization, protocol field numbers/enums against independent golden, selected-key/entrypoint projection, missing-word/segment acceptance, conflicting-final dedupe, timeout-before-final-status, cancel/late acceptance and provider/model/fsync/ordinal behavior. Restore exact source before green control; preserve existing source/quota/customer-credit mutants. No new generic validator or invented benchmarks.

After relevant changes run focused tests, full npm test with mandatory no-skip reporter, workspace build/typecheck/lint, existing relevant mutation runners and synthetic env completeness/wiring/model-cost checks. Root owns lockfile/manifests; dependency install is implementation work under assigned authority, not this PLAN. No unchanged successful suite repeated without new cause. All <500-line guards apply.

## Performance, security and accessibility

No model quality/SLA/savings target is invented from 0.5605392s short probe. Current 120s RPC/30-min job/time/size/disk ceilings remain. No unbounded gRPC receive/output configuration, extra cache, repair loop, async job, service, GPU or aligner. Request/response bodies/keys are absent from operational receipts. Standard TLS verifies fixed endpoint; no arbitrary authority override. Existing account isolation/404/quota/fence/origin checks remain.

No UI change planned. Any browser/UI acceptance used later still requires the existing fresh Docker/browser setup; HTTP checks are not a replacement. E2E companion preflight is not_applicable for this docs-only stage and required immediately before actual E2E.

## Live qualification and economics

Short own 5.26175s/43245-byte MP3 protocol proof passed: grpc0, two finals/10 actual timed words, imperfect recognition, actual charge unknown. It does not pass natural speech, actual full 160..200s chunk within120s, >180s overlap/subtitle journey, target rollout or live S3/browser. Additional paid requests remain root-owned with explicit fixture/budget/environment authority; do not repeat unchanged tests for reassurance.

Owner requested updated unit economics; a separate author owns those files. Include real sent chunk seconds, overlap, per-request 15s rounding and retried attempts in future calculations; do not equate one-hour input with exactly one-hour billed audio. Keep actual usage/bill versus tariff arithmetic distinct. No customer tariff/credit engine change follows automatically from provider cost.
